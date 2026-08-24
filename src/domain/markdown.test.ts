import { describe, expect, it } from 'vitest'
import { parseMarkdown, serializeMarkdown } from './markdown.ts'
import type { TodoDocument } from './types.ts'

const baseDocument: TodoDocument = {
  version: 1,
  date: '2026-08-24',
  showDate: false,
  showPanelNumbers: true,
  blocks: [],
}

describe('Markdown document conversion', () => {
  it('parses a dated document, checked tasks, and an explicit panel break', () => {
    const result = parseMarkdown(
      [
        '# 2026-08-24',
        '',
        '## Morning',
        '- [ ] Make coffee',
        '- [x] Pack lunch',
        '',
        '---',
        '',
        '## Afternoon',
        '- Call Alex',
      ].join('\n'),
      baseDocument,
    )

    expect(result.errors).toEqual([])
    expect(result.document).toMatchObject({
      date: '2026-08-24',
      showDate: true,
      blocks: [
        {
          kind: 'list',
          title: 'Morning',
          items: [
            { text: 'Make coffee', checked: false },
            { text: 'Pack lunch', checked: true },
          ],
        },
        { kind: 'panel-break' },
        {
          kind: 'list',
          title: 'Afternoon',
          items: [{ text: 'Call Alex', checked: false }],
        },
      ],
    })
  })

  it('serializes the supported subset without leaking implementation IDs', () => {
    const document: TodoDocument = {
      ...baseDocument,
      showDate: true,
      blocks: [
        {
          id: 'list-1',
          kind: 'list',
          title: 'Priorities',
          items: [
            { id: 'item-1', text: 'Ship the draft', checked: false },
            { id: 'item-2', text: 'Archive notes', checked: true },
          ],
        },
        { id: 'break-1', kind: 'panel-break' },
      ],
    }

    expect(serializeMarkdown(document)).toBe(
      '# 2026-08-24\n\n## Priorities\n- [ ] Ship the draft\n- [x] Archive notes\n\n---',
    )
  })

  it('reports unsupported content instead of silently discarding it', () => {
    const result = parseMarkdown('## List\nThis would be lost', baseDocument)

    expect(result.errors).toEqual([
      { line: 2, message: 'Use checklist items such as “- [ ] Task”.' },
    ])
  })
})
