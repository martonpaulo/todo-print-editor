import type { DocumentBlock, ListBlock, TodoDocument, TodoItem } from './types'

// Canonical TodoDocument transformations. Every operation is pure, returns a
// complete document suitable for the editor's onChange boundary, and preserves
// the application-owned ids of the blocks and items it does not touch.
//
// An operation whose target does not exist leaves the block list unchanged.
// moveBlock is the single exception that returns the received document by
// reference: an impossible move must not reach onChange, because the document
// history records every accepted change.

const withBlocks = (document: TodoDocument, blocks: DocumentBlock[]): TodoDocument => ({
  ...document,
  blocks,
})

const mapListBlock = (
  document: TodoDocument,
  listId: string,
  update: (list: ListBlock) => ListBlock,
): TodoDocument =>
  withBlocks(
    document,
    document.blocks.map((block) =>
      block.id === listId && block.kind === 'list' ? update(block) : block,
    ),
  )

const mapItem = (
  document: TodoDocument,
  listId: string,
  itemId: string,
  update: (item: TodoItem) => TodoItem,
): TodoDocument =>
  mapListBlock(document, listId, (list) => ({
    ...list,
    items: list.items.map((item) => (item.id === itemId ? update(item) : item)),
  }))

export const appendBlock = (document: TodoDocument, block: DocumentBlock): TodoDocument =>
  withBlocks(document, [...document.blocks, block])

export const removeBlock = (document: TodoDocument, blockId: string): TodoDocument =>
  withBlocks(
    document,
    document.blocks.filter((block) => block.id !== blockId),
  )

export const moveBlock = (
  document: TodoDocument,
  blockId: string,
  direction: -1 | 1,
): TodoDocument => {
  const index = document.blocks.findIndex((block) => block.id === blockId)
  const target = index + direction
  if (index < 0 || target < 0 || target >= document.blocks.length) return document

  const blocks = [...document.blocks]
  ;[blocks[index], blocks[target]] = [blocks[target], blocks[index]]
  return withBlocks(document, blocks)
}

export const updateListTitle = (
  document: TodoDocument,
  listId: string,
  title: string,
): TodoDocument => mapListBlock(document, listId, (list) => ({ ...list, title }))

export const updateItemText = (
  document: TodoDocument,
  listId: string,
  itemId: string,
  text: string,
): TodoDocument => mapItem(document, listId, itemId, (item) => ({ ...item, text }))

export const setItemChecked = (
  document: TodoDocument,
  listId: string,
  itemId: string,
  checked: boolean,
): TodoDocument => mapItem(document, listId, itemId, (item) => ({ ...item, checked }))

// The caller creates the item so it owns the id it will focus. Omitting
// afterItemId appends; an afterItemId the list does not hold inserts at the
// start, which is the position the editor has always produced for a stale row
// reference.
export const insertItemAfter = (
  document: TodoDocument,
  listId: string,
  item: TodoItem,
  afterItemId?: string,
): TodoDocument =>
  mapListBlock(document, listId, (list) => {
    const index = afterItemId
      ? list.items.findIndex((entry) => entry.id === afterItemId) + 1
      : list.items.length
    const items = [...list.items]
    items.splice(index, 0, item)
    return { ...list, items }
  })

export const removeItem = (
  document: TodoDocument,
  listId: string,
  itemId: string,
): TodoDocument =>
  mapListBlock(document, listId, (list) => ({
    ...list,
    items: list.items.filter((item) => item.id !== itemId),
  }))
