import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEY, usePersistentDocument } from './usePersistentDocument'
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
  vi.restoreAllMocks()
  window.localStorage.clear()
})

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
    let restored: unknown = null
    act(() => {
      restored = result.current.undo()
    })

    expect(restored).toEqual(original)
  })
})
