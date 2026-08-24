import type { DocumentBlock, ListBlock, PanelBreakBlock, TodoDocument, TodoItem } from './types'

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isTodoItem = (value: unknown): value is TodoItem =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  value.id.length > 0 &&
  typeof value.text === 'string' &&
  typeof value.checked === 'boolean'

const isListBlock = (value: unknown): value is ListBlock =>
  isRecord(value) &&
  value.kind === 'list' &&
  typeof value.id === 'string' &&
  value.id.length > 0 &&
  typeof value.title === 'string' &&
  Array.isArray(value.items) &&
  value.items.every(isTodoItem)

const isPanelBreak = (value: unknown): value is PanelBreakBlock =>
  isRecord(value) &&
  value.kind === 'panel-break' &&
  typeof value.id === 'string' &&
  value.id.length > 0

const isDocumentBlock = (value: unknown): value is DocumentBlock =>
  isListBlock(value) || isPanelBreak(value)

export const decodeDocument = (value: unknown): TodoDocument | null => {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.date !== 'string' ||
    !ISO_DATE_PATTERN.test(value.date) ||
    typeof value.showDate !== 'boolean' ||
    typeof value.showPanelNumbers !== 'boolean' ||
    !Array.isArray(value.blocks) ||
    !value.blocks.every(isDocumentBlock)
  ) {
    return null
  }

  const parsedDate = new Date(`${value.date}T00:00:00Z`)
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== value.date) {
    return null
  }

  const ids = new Set<string>()
  for (const block of value.blocks) {
    if (ids.has(block.id)) return null
    ids.add(block.id)

    if (block.kind === 'list') {
      for (const item of block.items) {
        if (ids.has(item.id)) return null
        ids.add(item.id)
      }
    }
  }

  return value as unknown as TodoDocument
}
