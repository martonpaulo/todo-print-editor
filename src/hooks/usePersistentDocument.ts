import { useCallback, useEffect, useState, useRef } from 'react'
import { createStarterDocument } from '../domain/document'
import { decodeDocument } from '../domain/storage'
import type { TodoDocument } from '../domain/types'
import { recordProfileSample } from '../profiling'

export const STORAGE_KEY = 'todo-print-editor.document.v1'

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

interface DocumentState {
  document: TodoDocument
  status: PersistenceStatus
}

// Reading stays pure: it reports what storage holds, and never claims a save it
// has not performed. The first write of a starter document happens on mount.
const readDocument = (): DocumentState => {
  if (typeof window === 'undefined') {
    return { document: createStarterDocument(), status: 'unwritten' }
  }

  try {
    // Only `null` means the key is absent. An empty string is stored content
    // that happens to be unreadable, and the mount write would destroy it.
    const source = window.localStorage.getItem(STORAGE_KEY)
    if (source === null) return { document: createStarterDocument(), status: 'unwritten' }

    const document = decodeDocument(JSON.parse(source))
    return document
      ? { document, status: 'saved' }
      : { document: createStarterDocument(), status: 'load-failed' }
  } catch {
    return { document: createStarterDocument(), status: 'load-failed' }
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

export const usePersistentDocument = () => {
  const [state, setState] = useState<DocumentState>(readDocument)

  // Callers read the status from React state; the hook's own decisions read it
  // from this ref so that setDocument stays a stable callback.
  const statusRef = useRef(state.status)
  const documentRef = useRef(state.document)

  const history = useRef({
    past: [] as TodoDocument[],
    present: state.document,
    future: [] as TodoDocument[]
  })

  const lastUpdate = useRef<number>(0)

  const apply = useCallback((nextDocument: TodoDocument, status: PersistenceStatus) => {
    statusRef.current = status
    documentRef.current = nextDocument
    setState({ document: nextDocument, status })
  }, [])

  // A profile with nothing stored must not read as saved. Writing the starter
  // document once is what settles the question, and it also surfaces a browser
  // that denies storage outright instead of hiding it until the first edit.
  // Nothing is overwritten: this runs only while the key is absent.
  useEffect(() => {
    if (statusRef.current !== 'unwritten') return
    apply(documentRef.current, persistDocument(documentRef.current))
  }, [apply])

  const setDocument = useCallback((nextDocument: TodoDocument) => {
    const now = Date.now()
    // Merge states if updated within 500ms. Undo is in-memory editor state, so
    // it tracks every edit whether or not the browser accepted the write.
    if (now - lastUpdate.current < 500) {
      history.current.present = nextDocument
    } else {
      history.current.past.push(history.current.present)
      history.current.present = nextDocument
      history.current.future = []
    }
    lastUpdate.current = now

    // While the stored value is unreadable it is the user's only remaining
    // copy, so editing continues in memory and writes wait for consent.
    const status =
      statusRef.current === 'load-failed' ? 'load-failed' : persistDocument(nextDocument)

    apply(nextDocument, status)
  }, [apply])

  /**
   * The explicit recovery action: replace the unreadable stored value with the
   * document currently on screen. Nothing else leaves the `load-failed` state.
   */
  const replaceStoredDocument = useCallback(() => {
    apply(documentRef.current, persistDocument(documentRef.current))
  }, [apply])

  const undo = useCallback(() => {
    if (history.current.past.length === 0) return null
    const previous = history.current.past.pop()!
    history.current.future.push(history.current.present)
    history.current.present = previous
    return previous
  }, [])

  const redo = useCallback(() => {
    if (history.current.future.length === 0) return null
    const next = history.current.future.pop()!
    history.current.past.push(history.current.present)
    history.current.present = next
    return next
  }, [])

  return { ...state, setDocument, replaceStoredDocument, undo, redo }
}
