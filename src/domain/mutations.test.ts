import { describe, expect, it } from 'vitest'
import {
  appendBlock,
  insertItemAfter,
  moveBlock,
  removeBlock,
  removeItem,
  setItemChecked,
  updateItemText,
  updateListTitle,
} from './mutations'
import type { TodoDocument, TodoItem } from './types'

// Two lists separated by a panel break, so every structural boundary the
// editor can reach is one move away.
const buildDocument = (): TodoDocument => ({
  version: 1,
  date: '2026-01-01',
  showDate: true,
  showPanelNumbers: true,
  typography: 'latin',
  blocks: [
    {
      id: 'list-a',
      kind: 'list',
      title: 'Work',
      items: [
        { id: 'item-a1', text: 'Draft', checked: false },
        { id: 'item-a2', text: 'Review', checked: true },
      ],
    },
    { id: 'break-1', kind: 'panel-break' },
    {
      id: 'list-b',
      kind: 'list',
      title: 'Personal',
      items: [{ id: 'item-b1', text: 'Only task', checked: false }],
    },
  ],
})

const blockIds = (document: TodoDocument) => document.blocks.map((block) => block.id)

const itemsOf = (document: TodoDocument, listId: string): TodoItem[] => {
  const block = document.blocks.find((entry) => entry.id === listId)
  if (!block || block.kind !== 'list') throw new Error(`missing list ${listId}`)
  return block.items
}

describe('appendBlock', () => {
  it('adds the block last and keeps the existing order and ids', () => {
    const document = buildDocument()
    const next = appendBlock(document, { id: 'break-2', kind: 'panel-break' })

    expect(blockIds(next)).toEqual(['list-a', 'break-1', 'list-b', 'break-2'])
    expect(blockIds(document)).toEqual(['list-a', 'break-1', 'list-b'])
  })
})

describe('removeBlock', () => {
  it('removes the named block and leaves the others untouched', () => {
    const document = buildDocument()
    const next = removeBlock(document, 'break-1')

    expect(blockIds(next)).toEqual(['list-a', 'list-b'])
    expect(next.blocks[0]).toBe(document.blocks[0])
  })

  it('keeps every block when the id is unknown', () => {
    const document = buildDocument()

    expect(blockIds(removeBlock(document, 'list-missing'))).toEqual(blockIds(document))
  })
})

describe('moveBlock', () => {
  it('swaps a list with the panel break above it', () => {
    const next = moveBlock(buildDocument(), 'list-b', -1)

    expect(blockIds(next)).toEqual(['list-a', 'list-b', 'break-1'])
  })

  it('swaps a list with the panel break below it', () => {
    const next = moveBlock(buildDocument(), 'list-a', 1)

    expect(blockIds(next)).toEqual(['break-1', 'list-a', 'list-b'])
  })

  it('returns the same document when the first block moves up', () => {
    const document = buildDocument()

    expect(moveBlock(document, 'list-a', -1)).toBe(document)
  })

  it('returns the same document when the last block moves down', () => {
    const document = buildDocument()

    expect(moveBlock(document, 'list-b', 1)).toBe(document)
  })

  it('returns the same document when the block is unknown', () => {
    const document = buildDocument()

    expect(moveBlock(document, 'list-missing', 1)).toBe(document)
  })
})

describe('updateListTitle', () => {
  it('rewrites only the named list', () => {
    const next = updateListTitle(buildDocument(), 'list-a', 'Renamed')

    expect(next.blocks[0]).toMatchObject({ id: 'list-a', title: 'Renamed' })
    expect(next.blocks[2]).toMatchObject({ id: 'list-b', title: 'Personal' })
  })

  it('ignores a panel break carrying the requested id', () => {
    const document = buildDocument()
    const next = updateListTitle(document, 'break-1', 'Renamed')

    expect(next.blocks[1]).toEqual({ id: 'break-1', kind: 'panel-break' })
  })

  it('changes nothing when the list is unknown', () => {
    const document = buildDocument()

    expect(updateListTitle(document, 'list-missing', 'Renamed').blocks).toEqual(document.blocks)
  })
})

describe('updateItemText and setItemChecked', () => {
  it('rewrites only the named item and preserves its id', () => {
    const next = updateItemText(buildDocument(), 'list-a', 'item-a2', 'Reviewed')

    expect(itemsOf(next, 'list-a')).toEqual([
      { id: 'item-a1', text: 'Draft', checked: false },
      { id: 'item-a2', text: 'Reviewed', checked: true },
    ])
  })

  it('toggles the checked state without touching the text', () => {
    const next = setItemChecked(buildDocument(), 'list-a', 'item-a1', true)

    expect(itemsOf(next, 'list-a')[0]).toEqual({ id: 'item-a1', text: 'Draft', checked: true })
  })

  it('changes nothing when the item is unknown', () => {
    const document = buildDocument()

    expect(itemsOf(updateItemText(document, 'list-a', 'item-missing', 'x'), 'list-a')).toEqual(
      itemsOf(document, 'list-a'),
    )
  })
})

describe('insertItemAfter', () => {
  const newItem: TodoItem = { id: 'item-new', text: '', checked: false }

  it('inserts directly after a known item', () => {
    const next = insertItemAfter(buildDocument(), 'list-a', newItem, 'item-a1')

    expect(itemsOf(next, 'list-a').map((item) => item.id)).toEqual([
      'item-a1',
      'item-new',
      'item-a2',
    ])
  })

  it('appends when no item is named', () => {
    const next = insertItemAfter(buildDocument(), 'list-a', newItem)

    expect(itemsOf(next, 'list-a').map((item) => item.id)).toEqual([
      'item-a1',
      'item-a2',
      'item-new',
    ])
  })

  it('inserts at the start when the named item is missing', () => {
    const next = insertItemAfter(buildDocument(), 'list-a', newItem, 'item-missing')

    expect(itemsOf(next, 'list-a').map((item) => item.id)).toEqual([
      'item-new',
      'item-a1',
      'item-a2',
    ])
  })

  it('keeps the caller-owned id', () => {
    const next = insertItemAfter(buildDocument(), 'list-b', newItem, 'item-b1')

    expect(itemsOf(next, 'list-b')[1]).toBe(newItem)
  })

  it('changes nothing when the list is unknown', () => {
    const document = buildDocument()

    expect(insertItemAfter(document, 'list-missing', newItem).blocks).toEqual(document.blocks)
  })
})

describe('removeItem', () => {
  it('removes the item and keeps the remaining ids', () => {
    const next = removeItem(buildDocument(), 'list-a', 'item-a1')

    expect(itemsOf(next, 'list-a').map((item) => item.id)).toEqual(['item-a2'])
  })

  it('leaves the list present and empty when its final item is removed', () => {
    const next = removeItem(buildDocument(), 'list-b', 'item-b1')

    expect(blockIds(next)).toEqual(['list-a', 'break-1', 'list-b'])
    expect(itemsOf(next, 'list-b')).toEqual([])
  })

  it('changes nothing when the item is unknown', () => {
    const document = buildDocument()

    expect(itemsOf(removeItem(document, 'list-a', 'item-missing'), 'list-a')).toEqual(
      itemsOf(document, 'list-a'),
    )
  })
})
