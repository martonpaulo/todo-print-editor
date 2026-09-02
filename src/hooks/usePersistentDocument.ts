import { useCallback, useEffect, useState, useRef } from 'react'
import { createStarterDocument } from '../domain/document'
import { decodeDocument } from '../domain/storage'
import type { TodoDocument } from '../domain/types'
import { recordProfileSample } from '../profiling'

export const STORAGE_KEY = 'todo-print-editor.document.v1'

/**
 * Consecutive edits closer together than this merge into one history entry, so
 * typing a task title is one undo step rather than one per keystroke.
 */
export const HISTORY_COALESCE_MS = 500

/**
 * The deterministic bound on retained history: at most this many undoable
 * entries. Recording past the bound drops the oldest entry, so a long session
 * holds a fixed number of snapshots instead of growing without limit. `future`
 * only ever receives entries taken from `past`, so it is bounded by the same
 * number.
 */
export const HISTORY_LIMIT = 100

/**
 * Observable persistence states.
 *
 * - `unwritten`: nothing is stored under the key yet, so no save can be claimed.
 *   The starter document is written once on mount and this state resolves into
 *   `saved` or `write-failed` from that attempt.
 * - `saved`: the visible document is exactly what browser storage holds.
 * - `write-failed`: the visible draft is newer than storage because a write threw.
 *   Only a later successful write leaves this state.
 * - `load-failed`: stored content could not be read or decoded. The visible
 *   document is an in-memory starter draft and nothing is written, so the
 *   unreadable value survives until the user explicitly replaces it.
 */
export type PersistenceStatus = 'unwritten' | 'saved' | 'write-failed' | 'load-failed'

/**
 * What a recorded edit was, when the caller needs the interface to offer a
 * recovery action for it. The subject is a display context string the caller
 * already built for its own accessible names; the history owner only carries it,
 * and holds no product copy of its own.
 */
export type DocumentEdit =
  | { kind: 'task-removed'; subject: string }
  | { kind: 'list-removed'; subject: string }
  | { kind: 'panel-break-removed' }

interface DocumentState {
  document: TodoDocument
  status: PersistenceStatus
  canUndo: boolean
  canRedo: boolean
  /**
   * The edit the last recorded transition described, or `null`. Traversal clears
   * it: once the removal has been undone or redone it is no longer the action a
   * recovery affordance would reverse.
   */
  lastEdit: DocumentEdit | null
}

// Reading stays pure: it reports what storage holds, and never claims a save it
// has not performed. The first write of a starter document happens on mount.
const readDocument = (): DocumentState => {
  const initial = (document: TodoDocument, status: PersistenceStatus): DocumentState => ({
    document,
    status,
    canUndo: false,
    canRedo: false,
    lastEdit: null,
  })

  if (typeof window === 'undefined') {
    return initial(createStarterDocument(), 'unwritten')
  }

  try {
    // Only `null` means the key is absent. An empty string is stored content
    // that happens to be unreadable, and the mount write would destroy it.
    const source = window.localStorage.getItem(STORAGE_KEY)
    if (source === null) return initial(createStarterDocument(), 'unwritten')

    const document = decodeDocument(JSON.parse(source))
    return document
      ? initial(document, 'saved')
      : initial(createStarterDocument(), 'load-failed')
  } catch {
    return initial(createStarterDocument(), 'load-failed')
  }
}

// Writing is the only thing that may report a save. A thrown quota or security
// error keeps the draft and reports the failure; it never silences it.
const persistDocument = (document: TodoDocument): PersistenceStatus => {
  try {
    const persistenceStart = performance.now()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(document))
    recordProfileSample('persistence', performance.now() - persistenceStart)
    return 'saved'
  } catch {
    return 'write-failed'
  }
}

// While the stored value is unreadable it is the user's only remaining copy, so
// editing continues in memory and writes wait for consent. Replay obeys the same
// rule: traversing history must not overwrite what could not be read.
const persistUnlessUnreadable = (
  document: TodoDocument,
  status: PersistenceStatus,
): PersistenceStatus => (status === 'load-failed' ? 'load-failed' : persistDocument(document))

/**
 * Owns the canonical document for this tab: its persistence state and its
 * in-memory history.
 *
 * Two transition modes, and nothing else changes the document:
 *
 * - **record** (`setDocument`) is a genuine edit. It pushes the outgoing
 *   document onto `past` unless it falls inside the coalescing window, and
 *   always abandons `future`, so a divergent edit can never leave a redo branch
 *   that resurrects work the user moved away from.
 * - **replay** (`undo`, `redo`) moves along the existing history. It updates the
 *   visible document, the stacks, and storage in one step, and records nothing:
 *   a replayed snapshot is not a new edit.
 *
 * History is in-memory and per tab; it is never persisted.
 */
export const usePersistentDocument = () => {
  const [state, setState] = useState<DocumentState>(readDocument)

  // Callers read the status from React state; the hook's own decisions read it
  // from these refs so that the transition callbacks stay stable.
  const statusRef = useRef(state.status)
  const documentRef = useRef(state.document)
  const lastEditRef = useRef<DocumentEdit | null>(null)

  // The present document is `documentRef`, so it is stored once rather than
  // mirrored here where the two copies could drift apart.
  const history = useRef({ past: [] as TodoDocument[], future: [] as TodoDocument[] })

  // `null` means no window is open, so the next edit always starts a new entry.
  // Traversal resets it, which makes the boundary after an undo deterministic
  // rather than dependent on how long the user paused before pressing it.
  const lastRecordedAt = useRef<number | null>(null)

  const apply = useCallback(
    (nextDocument: TodoDocument, status: PersistenceStatus, edit: DocumentEdit | null) => {
      statusRef.current = status
      documentRef.current = nextDocument
      lastEditRef.current = edit
      setState({
        document: nextDocument,
        status,
        canUndo: history.current.past.length > 0,
        canRedo: history.current.future.length > 0,
        lastEdit: edit,
      })
    },
    [],
  )

  // A profile with nothing stored must not read as saved. Writing the starter
  // document once is what settles the question, and it also surfaces a browser
  // that denies storage outright instead of hiding it until the first edit.
  // Nothing is overwritten: this runs only while the key is absent.
  useEffect(() => {
    if (statusRef.current !== 'unwritten') return
    apply(documentRef.current, persistDocument(documentRef.current), lastEditRef.current)
  }, [apply])

  /**
   * Record a genuine edit. `edit` describes it only when the caller needs a
   * recovery affordance for it; any edit without one clears a stale description.
   */
  const setDocument = useCallback(
    (nextDocument: TodoDocument, edit: DocumentEdit | null = null) => {
      const now = Date.now()
      const openWindow = lastRecordedAt.current
      const coalesces = openWindow !== null && now - openWindow < HISTORY_COALESCE_MS

      if (!coalesces) {
        history.current.past.push(documentRef.current)
        // The bound is enforced where entries are added, so the oldest step is
        // dropped rather than the session accumulating snapshots.
        if (history.current.past.length > HISTORY_LIMIT) history.current.past.shift()
      }

      // Unconditional, in both branches: an edit made a moment after an undo is
      // still a divergent edit, and the abandoned branch must not survive it.
      history.current.future = []
      lastRecordedAt.current = now

      // Undo is in-memory editor state, so it tracks every edit whether or not
      // the browser accepted the write.
      apply(nextDocument, persistUnlessUnreadable(nextDocument, statusRef.current), edit)
    },
    [apply],
  )

  /**
   * The explicit recovery action: replace the unreadable stored value with the
   * document currently on screen. Nothing else leaves the `load-failed` state.
   */
  const replaceStoredDocument = useCallback(() => {
    apply(documentRef.current, persistDocument(documentRef.current), lastEditRef.current)
  }, [apply])

  // Traversal is a command: it performs the whole transition and reports only
  // whether there was one to perform. Nothing outside this hook resubmits the
  // restored snapshot, which is what used to record a replay as a new edit.
  const traverse = useCallback(
    (from: TodoDocument[], to: TodoDocument[]) => {
      if (from.length === 0) return false
      const restored = from.pop()!
      to.push(documentRef.current)
      // A replay ends the coalescing window, so the next edit always starts its
      // own entry instead of merging into the snapshot just restored.
      lastRecordedAt.current = null
      apply(restored, persistUnlessUnreadable(restored, statusRef.current), null)
      return true
    },
    [apply],
  )

  const undo = useCallback(
    () => traverse(history.current.past, history.current.future),
    [traverse],
  )

  const redo = useCallback(
    () => traverse(history.current.future, history.current.past),
    [traverse],
  )

  return { ...state, setDocument, replaceStoredDocument, undo, redo }
}
