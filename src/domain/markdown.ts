import { createId } from './document'
import type { MarkdownError, MarkdownParseResult, TodoDocument } from './types'

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const CHECKLIST_PATTERN = /^[-*]\s*\[([ xX])\]\s*(.*)$/
const BULLET_PATTERN = /^[-*]\s+(.*)$/
// The only supported list heading is exactly two hashes, optionally followed by a
// separator and a title. Bare `##` stays valid because an empty list title
// serializes to `## ` and `continueMarkdownAtSelection` inserts the same prefix.
const LIST_HEADING_PATTERN = /^##(?:[ \t]+(.*))?$/

export interface MarkdownDraftItem {
  text: string
  checked: boolean
}

export interface MarkdownDraftList {
  kind: 'list'
  title: string
  items: MarkdownDraftItem[]
}

export interface MarkdownDraftPanelBreak {
  kind: 'panel-break'
}

export type MarkdownDraftBlock = MarkdownDraftList | MarkdownDraftPanelBreak

export interface MarkdownDraft {
  date: string | null
  blocks: MarkdownDraftBlock[]
}

export interface MarkdownDraftParseResult {
  draft: MarkdownDraft
  errors: MarkdownError[]
}

export type MarkdownIdFactory = (prefix: 'list' | 'item' | 'break') => string

export interface MarkdownSelectionEdit {
  source: string
  selectionStart: number
  selectionEnd: number
}

const isValidIsoDate = (value: string): boolean => {
  if (!ISO_DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

export const parseMarkdownDraft = (source: string): MarkdownDraftParseResult => {
  const draft: MarkdownDraft = { date: null, blocks: [] }
  const errors: MarkdownError[] = []
  let currentList: MarkdownDraftList | null = null
  let hasDateHeading = false

  source.split(/\r?\n/).forEach((rawLine, index) => {
    const lineNumber = index + 1
    const line = rawLine.trim()

    if (!line) return

    if (line.startsWith('# ')) {
      const date = line.slice(2).trim()
      if (hasDateHeading) {
        errors.push({ line: lineNumber, code: 'duplicate-date' })
      } else if (!isValidIsoDate(date)) {
        errors.push({ line: lineNumber, code: 'invalid-date' })
      } else {
        draft.date = date
        hasDateHeading = true
      }
      return
    }

    if (line.startsWith('##')) {
      const headingMatch = line.match(LIST_HEADING_PATTERN)
      if (!headingMatch) {
        errors.push({ line: lineNumber, code: 'unsupported-heading' })
        return
      }

      currentList = {
        kind: 'list',
        title: headingMatch[1] ?? '',
        items: [],
      }
      draft.blocks.push(currentList)
      return
    }

    if (line === '---') {
      currentList = null
      draft.blocks.push({ kind: 'panel-break' })
      return
    }

    const checklistMatch = line.match(CHECKLIST_PATTERN)
    if (checklistMatch) {
      if (!currentList) {
        errors.push({ line: lineNumber, code: 'task-without-list' })
      } else {
        currentList.items.push({
          text: checklistMatch[2],
          checked: checklistMatch[1].toLowerCase() === 'x',
        })
      }
      return
    }

    const bulletMatch = line.match(BULLET_PATTERN)
    if (bulletMatch && !/^\[[^\]]*\]/.test(bulletMatch[1])) {
      if (!currentList) {
        errors.push({ line: lineNumber, code: 'task-without-list' })
      } else {
        currentList.items.push({ text: bulletMatch[1], checked: false })
      }
      return
    }

    errors.push({ line: lineNumber, code: 'unrecognized-line' })
  })

  return { draft, errors }
}

export const reconcileMarkdownDraft = (
  draft: MarkdownDraft,
  previousDocument: TodoDocument,
  idFactory: MarkdownIdFactory = createId,
): TodoDocument => ({
  version: 1,
  date: draft.date ?? previousDocument.date,
  showDate: draft.date !== null,
  showPanelNumbers: previousDocument.showPanelNumbers,
  // Moon type is a rendering setting with no Markdown syntax, so it survives a round trip through
  // the source instead of being serialized into it.
  typography: previousDocument.typography,
  blocks: draft.blocks.map((block, blockIndex) => {
    const previousBlock = previousDocument.blocks[blockIndex]

    if (block.kind === 'panel-break') {
      return {
        id:
          previousBlock?.kind === 'panel-break'
            ? previousBlock.id
            : idFactory('break'),
        kind: 'panel-break' as const,
      }
    }

    const previousList = previousBlock?.kind === 'list' ? previousBlock : null
    return {
      id: previousList?.id ?? idFactory('list'),
      kind: 'list' as const,
      title: block.title,
      items: block.items.map((item, itemIndex) => ({
        id: previousList?.items[itemIndex]?.id ?? idFactory('item'),
        text: item.text,
        checked: item.checked,
      })),
    }
  }),
})

export const parseMarkdown = (
  source: string,
  previousDocument: TodoDocument,
  idFactory: MarkdownIdFactory = createId,
): MarkdownParseResult => {
  const { draft, errors } = parseMarkdownDraft(source)
  return {
    document: reconcileMarkdownDraft(draft, previousDocument, idFactory),
    errors,
  }
}

export const normalizeMarkdownSource = (source: string): string => {
  const normalized = source
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/^(##?)[ \t]+/gm, '$1 ')
    .replace(
      /^([ \t]*)[-*][ \t]*\[([ xX]?)\][ \t]*(.*)$/gm,
      (_, indent: string, state: string, text: string) =>
        `${indent}- [${state.toLowerCase() === 'x' ? 'x' : ' '}] ${text}`,
    )
    .replace(
      /^([ \t]*)[-*][ \t]+(?!\[)(.*)$/gm,
      (_, indent: string, text: string) => `${indent}- [ ] ${text}`,
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return normalized ? `${normalized}\n` : ''
}

export const continueMarkdownAtSelection = (
  source: string,
  selectionStart: number,
  selectionEnd: number,
): MarkdownSelectionEdit | null => {
  if (
    selectionStart !== selectionEnd ||
    selectionStart < 0 ||
    selectionStart > source.length
  ) {
    return null
  }

  const lineStart = source.lastIndexOf('\n', selectionStart - 1) + 1
  const nextLineBreak = source.indexOf('\n', selectionStart)
  const lineEnd = nextLineBreak === -1 ? source.length : nextLineBreak
  const logicalLineEnd =
    lineEnd > lineStart && source[lineEnd - 1] === '\r' ? lineEnd - 1 : lineEnd
  const line = source.slice(lineStart, logicalLineEnd)
  const checklistMatch = line.match(/^([ \t]*)[-*][ \t]+\[[ xX]\][ \t]*(.*)$/)

  if (!checklistMatch) return null

  const lineBreak = source.includes('\r\n') ? '\r\n' : '\n'
  const taskText = checklistMatch[2]

  if (!taskText.trim()) {
    const beforeLine = source.slice(0, lineStart)
    const nextSource = `${beforeLine}${lineBreak}## ${source.slice(logicalLineEnd)}`
    const nextSelection = beforeLine.length + lineBreak.length + 3
    return {
      source: nextSource,
      selectionStart: nextSelection,
      selectionEnd: nextSelection,
    }
  }

  const prefix = `${lineBreak}${checklistMatch[1]}- [ ] `
  const nextSelection = selectionStart + prefix.length
  return {
    source: `${source.slice(0, selectionStart)}${prefix}${source.slice(selectionEnd)}`,
    selectionStart: nextSelection,
    selectionEnd: nextSelection,
  }
}

export const serializeMarkdown = (document: TodoDocument): string => {
  const sections: string[] = []

  if (document.showDate) sections.push(`# ${document.date}`)

  document.blocks.forEach((block) => {
    if (block.kind === 'panel-break') {
      sections.push('---')
      return
    }

    const lines = [`## ${block.title}`]
    block.items.forEach((item) => {
      lines.push(`- [${item.checked ? 'x' : ' '}] ${item.text}`)
    })
    sections.push(lines.join('\n'))
  })

  return sections.join('\n\n')
}
