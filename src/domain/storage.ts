import { isValidIsoDate } from './date'
import type {
  DocumentBlock,
  ListBlock,
  PanelBreakBlock,
  TodoDocument,
  TodoItem,
  Typography,
} from './types'

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

/**
 * `typography` was added after documents were already stored, and the stored shape carries no
 * migration marker of its own, so an absent value is read as the previous behavior rather than
 * rejected. Rejecting it would discard the user's only copy of the document. Any present value must
 * still be one this build understands.
 */
const readTypography = (value: unknown): Typography | null => {
  if (value === undefined) return 'latin'
  return value === 'latin' || value === 'moon' ? value : null
}

/**
 * `rotatePrint` was added after documents were already stored, and like `typography` it carries no
 * migration marker of its own, so an absent value is read as the previous behavior — the sheet
 * imaged onto landscape paper — rather than rejected. Any present value must still be a boolean.
 */
const readRotatePrint = (value: unknown): boolean | null => {
  if (value === undefined) return false
  return typeof value === 'boolean' ? value : null
}

export const decodeDocument = (value: unknown): TodoDocument | null => {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.date !== 'string' ||
    !isValidIsoDate(value.date) ||
    typeof value.showDate !== 'boolean' ||
    typeof value.showPanelNumbers !== 'boolean' ||
    !Array.isArray(value.blocks) ||
    !value.blocks.every(isDocumentBlock)
  ) {
    return null
  }

  const typography = readTypography(value.typography)
  if (typography === null) return null

  const rotatePrint = readRotatePrint(value.rotatePrint)
  if (rotatePrint === null) return null

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

  return { ...(value as unknown as TodoDocument), typography, rotatePrint }
}
