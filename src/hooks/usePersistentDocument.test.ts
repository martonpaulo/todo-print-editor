import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  HISTORY_COALESCE_MS,
  HISTORY_LIMIT,
  STORAGE_KEY,
  usePersistentDocument,
} from './usePersistentDocument'
import { createStarterDocument } from '../domain/document'

const storedDocument = () => {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  return raw === null ? null : (JSON.parse(raw) as { blocks: { id: string }[] })
}

const renamedFirstList = (document: ReturnType<typeof createStarterDocument>, title: string) => ({
  ...document,
  blocks: document.blocks.map((block, index) =>
    index === 0 && block.kind === 'list' ? { ...block, title } : block,
  ),
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

const firstListTitle = (document: ReturnType<typeof createStarterDocument>) => {
  const block = document.blocks[0]
  return block.kind === 'list' ? block.title : null
}

describe('usePersistentDocument', () => {
  it('restores a valid stored document and reports it as saved', () => {
    const saved = renamedFirstList(createStarterDocument(), 'Restored list')
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))

    const { result } = renderHook(() => usePersistentDocument())

    expect(result.current.status).toBe('saved')
    expect(result.current.document).toEqual(saved)
  })

  it('writes the starter document on a fresh profile before reporting it saved', () => {
    const { result } = renderHook(() => usePersistentDocument())

    expect(result.current.status).toBe('saved')
    // The claim is backed by the value the browser now holds, not by the absence
    // of an error.
    expect(storedDocument()).toEqual(result.current.document)
  })

  it('never claims a save on a fresh profile whose browser denies storage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage denied')
    })

    const { result } = renderHook(() => usePersistentDocument())

    // The denial surfaces on load rather than hiding until the first edit.
    expect(result.current.status).toBe('write-failed')
    expect(result.current.document.version).toBe(1)
  })

  it('reports a load failure and keeps unreadable stored content when decoding fails', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 99, blocks: 'broken' }))

    const { result } = renderHook(() => usePersistentDocument())

    expect(result.current.status).toBe('load-failed')
    // A starter draft is shown, but the unreadable value is untouched.
    expect(storedDocument()).toEqual({ version: 99, blocks: 'broken' })
  })

  it.each([
    ['an empty string', ''],
    ['whitespace', '   '],
  ])('treats %s as unreadable stored content rather than an absent key', (_label, stored) => {
    window.localStorage.setItem(STORAGE_KEY, stored)

    const { result } = renderHook(() => usePersistentDocument())

    // The mount write must not run here: this value is the user's only copy.
    expect(result.current.status).toBe('load-failed')
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(stored)
  })

  it('reports a load failure when reading throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('read blocked')
    })

    const { result } = renderHook(() => usePersistentDocument())

    expect(result.current.status).toBe('load-failed')
  })

  it('never writes while the stored document is unreadable', () => {
    window.localStorage.setItem(STORAGE_KEY, 'not json at all')
    const { result } = renderHook(() => usePersistentDocument())

    act(() => result.current.setDocument(renamedFirstList(result.current.document, 'Draft')))

    expect(result.current.status).toBe('load-failed')
    expect(result.current.document.blocks[0]).toMatchObject({ title: 'Draft' })
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('not json at all')
  })

  it('replaces the unreadable stored document only on the explicit action', () => {
    window.localStorage.setItem(STORAGE_KEY, 'not json at all')
    const { result } = renderHook(() => usePersistentDocument())

    act(() => result.current.setDocument(renamedFirstList(result.current.document, 'Draft')))
    act(() => result.current.replaceStoredDocument())

    expect(result.current.status).toBe('saved')
    expect(storedDocument()?.blocks[0]).toMatchObject({ title: 'Draft' })
  })

  it('keeps the draft visible and reports a write failure when storing throws', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    const { result } = renderHook(() => usePersistentDocument())

    act(() => result.current.setDocument(renamedFirstList(result.current.document, 'Unsaved')))

    expect(result.current.status).toBe('write-failed')
    expect(result.current.document.blocks[0]).toMatchObject({ title: 'Unsaved' })
    expect(setItem).toHaveBeenCalled()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('stays in the write-failed state across repeated failures', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    const { result } = renderHook(() => usePersistentDocument())

    act(() => result.current.setDocument(renamedFirstList(result.current.document, 'One')))
    act(() => result.current.setDocument(renamedFirstList(result.current.document, 'Two')))

    expect(result.current.status).toBe('write-failed')
    expect(result.current.document.blocks[0]).toMatchObject({ title: 'Two' })
  })

  it('clears the write failure only once a later write succeeds', () => {
    // Loading a valid document keeps the mount write out of the way, so the
    // one refused write below is the edit's own.
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(createStarterDocument()))
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('quota exceeded')
    })
    const { result } = renderHook(() => usePersistentDocument())

    act(() => result.current.setDocument(renamedFirstList(result.current.document, 'Unsaved')))
    expect(result.current.status).toBe('write-failed')

    setItem.mockRestore()
    act(() => result.current.setDocument(renamedFirstList(result.current.document, 'Saved')))

    expect(result.current.status).toBe('saved')
    expect(storedDocument()?.blocks[0]).toMatchObject({ title: 'Saved' })
  })

  it('keeps undo available for edits the browser refused to store', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    const { result } = renderHook(() => usePersistentDocument())
    const original = result.current.document

    act(() => result.current.setDocument(renamedFirstList(original, 'Unsaved')))
    act(() => {
      expect(result.current.undo()).toBe(true)
    })

    expect(result.current.document).toEqual(original)
  })
})

describe('usePersistentDocument history', () => {
  // Every history assertion below depends on when an edit happened relative to
  // the coalescing window, so the clock is controlled rather than raced.
  const editAfter = (
    result: { current: ReturnType<typeof usePersistentDocument> },
    delayMs: number,
    title: string,
  ) => {
    vi.advanceTimersByTime(delayMs)
    act(() => result.current.setDocument(renamedFirstList(result.current.document, title)))
  }

  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('restores the previous document however long the undo is delayed', () => {
    const { result } = renderHook(() => usePersistentDocument())
    const original = result.current.document

    editAfter(result, HISTORY_COALESCE_MS + 1, 'Edited')
    // A delayed undo used to fall into the branch that never cleared its own
    // stacks, so the reverted document was no longer available to redo.
    vi.advanceTimersByTime(60_000)

    act(() => {
      expect(result.current.undo()).toBe(true)
    })
    expect(result.current.document).toEqual(original)
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(true)

    act(() => {
      expect(result.current.redo()).toBe(true)
    })
    expect(firstListTitle(result.current.document)).toBe('Edited')
  })

  it('restores the previous document when the undo follows the edit immediately', () => {
    const { result } = renderHook(() => usePersistentDocument())
    const original = result.current.document

    editAfter(result, HISTORY_COALESCE_MS + 1, 'Edited')
    act(() => {
      expect(result.current.undo()).toBe(true)
    })

    expect(result.current.document).toEqual(original)
  })

  it('merges edits inside the coalescing window into one undo step', () => {
    const { result } = renderHook(() => usePersistentDocument())
    const original = result.current.document

    editAfter(result, HISTORY_COALESCE_MS + 1, 'One')
    editAfter(result, HISTORY_COALESCE_MS - 1, 'Two')

    act(() => {
      expect(result.current.undo()).toBe(true)
    })

    // Both edits belong to the same entry, so one undo returns to the start.
    expect(result.current.document).toEqual(original)
    expect(result.current.canUndo).toBe(false)
  })

  it('separates edits on either side of the coalescing boundary', () => {
    const { result } = renderHook(() => usePersistentDocument())

    editAfter(result, HISTORY_COALESCE_MS + 1, 'One')
    editAfter(result, HISTORY_COALESCE_MS, 'Two')

    act(() => {
      expect(result.current.undo()).toBe(true)
    })

    expect(firstListTitle(result.current.document)).toBe('One')
  })

  it('starts a new entry for the first edit after a replay, however quick', () => {
    const { result } = renderHook(() => usePersistentDocument())

    editAfter(result, HISTORY_COALESCE_MS + 1, 'One')
    act(() => result.current.undo())
    // A replay closes the window, so this edit cannot merge into the snapshot
    // the undo just restored.
    editAfter(result, 1, 'Two')

    act(() => {
      expect(result.current.undo()).toBe(true)
    })

    expect(firstListTitle(result.current.document)).not.toBe('Two')
  })

  it('abandons the redo branch on a divergent edit made inside the coalescing window', () => {
    const { result } = renderHook(() => usePersistentDocument())

    editAfter(result, HISTORY_COALESCE_MS + 1, 'Abandoned')
    act(() => result.current.undo())
    // The stale-redo reproduction: the divergent edit lands within 500 ms, which
    // is exactly the branch that used to leave `future` intact.
    editAfter(result, 1, 'Kept')

    expect(result.current.canRedo).toBe(false)
    act(() => {
      expect(result.current.redo()).toBe(false)
    })
    expect(firstListTitle(result.current.document)).toBe('Kept')
  })

  it('replays without recording the restored snapshot as a new edit', () => {
    const { result } = renderHook(() => usePersistentDocument())
    const original = result.current.document

    editAfter(result, HISTORY_COALESCE_MS + 1, 'Edited')
    act(() => result.current.undo())
    act(() => result.current.redo())
    act(() => result.current.undo())

    // One edit means exactly one undoable step, whatever the traversal did.
    expect(result.current.document).toEqual(original)
    expect(result.current.canUndo).toBe(false)
  })

  it('persists the replayed document through the same storage owner', () => {
    const { result } = renderHook(() => usePersistentDocument())
    const original = result.current.document

    editAfter(result, HISTORY_COALESCE_MS + 1, 'Edited')
    expect(storedDocument()).toEqual(JSON.parse(JSON.stringify(result.current.document)))

    act(() => result.current.undo())

    expect(result.current.status).toBe('saved')
    expect(storedDocument()).toEqual(JSON.parse(JSON.stringify(original)))
  })

  it('never writes a replayed document while the stored value is unreadable', () => {
    window.localStorage.setItem(STORAGE_KEY, 'not json at all')
    const { result } = renderHook(() => usePersistentDocument())

    editAfter(result, HISTORY_COALESCE_MS + 1, 'Draft')
    act(() => result.current.undo())

    expect(result.current.status).toBe('load-failed')
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('not json at all')
  })

  it('keeps at most the documented number of undo steps', () => {
    const { result } = renderHook(() => usePersistentDocument())

    for (let edit = 0; edit <= HISTORY_LIMIT; edit += 1) {
      editAfter(result, HISTORY_COALESCE_MS + 1, `Edit ${edit}`)
    }

    // Undoing the whole retained history lands on the oldest entry still held,
    // not on the document the session started from.
    for (let step = 0; step < HISTORY_LIMIT; step += 1) {
      act(() => {
        expect(result.current.undo()).toBe(true)
      })
    }

    expect(result.current.canUndo).toBe(false)
    expect(firstListTitle(result.current.document)).toBe('Edit 0')
  })

  it('reports the removal an edit describes until the next transition', () => {
    const { result } = renderHook(() => usePersistentDocument())

    editAfter(result, HISTORY_COALESCE_MS + 1, 'Edited')
    expect(result.current.lastEdit).toBeNull()

    act(() =>
      result.current.setDocument(renamedFirstList(result.current.document, 'Trimmed'), {
        kind: 'task-removed',
        subject: 'Task 1: Draft',
      }),
    )
    expect(result.current.lastEdit).toEqual({ kind: 'task-removed', subject: 'Task 1: Draft' })

    // Undoing the removal is what the description existed for, so it goes with it.
    act(() => result.current.undo())
    expect(result.current.lastEdit).toBeNull()
  })
})
