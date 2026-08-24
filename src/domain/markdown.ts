import { createId } from './document'
import type {
  ListBlock,
  MarkdownError,
  MarkdownParseResult,
  TodoDocument,
  TodoItem,
} from './types'

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

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

const createItem = (text: string, checked: boolean): TodoItem => ({
  id: createId('item'),
  text,
  checked,
})

const createList = (title: string): ListBlock => ({
  id: createId('list'),
  kind: 'list',
  title,
  items: [],
})

export const parseMarkdown = (
  source: string,
  previousDocument: TodoDocument,
): MarkdownParseResult => {
  const document: TodoDocument = {
    ...previousDocument,
    showDate: false,
    blocks: [],
  }
  const errors: MarkdownError[] = []
  let currentList: ListBlock | null = null
  let hasDateHeading = false

  source.split(/\r?\n/).forEach((rawLine, index) => {
    const lineNumber = index + 1
    const line = rawLine.trim()

    if (!line) return

    if (line.startsWith('# ')) {
      const date = line.slice(2).trim()
      if (hasDateHeading) {
        errors.push({ line: lineNumber, message: 'Use only one document date.' })
      } else if (!isValidIsoDate(date)) {
        errors.push({
          line: lineNumber,
          message: 'Use an ISO date such as “# 2026-08-24”.',
        })
      } else {
        document.date = date
        document.showDate = true
        hasDateHeading = true
      }
      return
    }

    if (line.startsWith('##')) {
      const title = line.replace(/^##\s*/, '')
      currentList = createList(title)
      document.blocks.push(currentList)
      return
    }

    if (line === '---') {
      currentList = null
      document.blocks.push({ id: createId('break'), kind: 'panel-break' })
      return
    }

    const checklistMatch = line.match(/^-\s*\[([ xX])\]\s*(.*)$/)
    if (checklistMatch) {
      if (!currentList) {
        errors.push({ line: lineNumber, message: 'Add a “## List title” before its tasks.' })
      } else {
        currentList.items.push(
          createItem(checklistMatch[2], checklistMatch[1].toLowerCase() === 'x'),
        )
      }
      return
    }

    const bulletMatch = line.match(/^[-*]\s+(.*)$/)
    if (bulletMatch) {
      if (!currentList) {
        errors.push({ line: lineNumber, message: 'Add a “## List title” before its tasks.' })
      } else {
        currentList.items.push(createItem(bulletMatch[1], false))
      }
      return
    }

    errors.push({
      line: lineNumber,
      message: 'Use checklist items such as “- [ ] Task”.',
    })
  })

  return { document, errors }
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
