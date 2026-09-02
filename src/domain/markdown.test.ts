import { describe, expect, it } from 'vitest'
import {
  continueMarkdownAtSelection,
  normalizeMarkdownSource,
  parseMarkdown,
  parseMarkdownDraft,
  reconcileMarkdownDraft,
  serializeMarkdown,
  type MarkdownIdFactory,
} from './markdown.ts'
import type { TodoDocument } from './types.ts'

const baseDocument: TodoDocument = {
  version: 1,
  date: '2026-08-24',
  showDate: false,
  showPanelNumbers: true,
  typography: 'latin',
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
      { line: 2, code: 'unrecognized-line' },
    ])
  })

  it('accepts the documented list heading and a bare heading with an empty title', () => {
    const result = parseMarkdown('## Title\n\n##', baseDocument)

    expect(result.errors).toEqual([])
    expect(result.document.blocks).toMatchObject([
      { kind: 'list', title: 'Title' },
      { kind: 'list', title: '' },
    ])
  })

  it.each([
    { source: '##Personal', label: 'a missing separator' },
    { source: '### Personal', label: 'three hashes' },
    { source: '#### Personal', label: 'four hashes' },
  ])('rejects a heading with $label instead of reinterpreting it', ({ source }) => {
    const result = parseMarkdown(source, baseDocument)

    expect(result.errors).toEqual([{ line: 1, code: 'unsupported-heading' }])
    expect(result.document.blocks).toEqual([])
  })

  it('reports an unsupported heading before a valid list without dropping the list', () => {
    const result = parseMarkdown(
      '### Personal\n\n## Work\n- [ ] Ship the draft',
      baseDocument,
    )

    expect(result.errors).toEqual([{ line: 1, code: 'unsupported-heading' }])
    expect(result.document.blocks).toMatchObject([
      { kind: 'list', title: 'Work', items: [{ text: 'Ship the draft' }] },
    ])
  })

  it('reports an unsupported heading after a valid task and keeps its tasks in the open list', () => {
    const result = parseMarkdown(
      '## Work\n- [ ] Ship the draft\n##Personal\n- [x] Call someone',
      baseDocument,
    )

    expect(result.errors).toEqual([{ line: 3, code: 'unsupported-heading' }])
    expect(result.document.blocks).toMatchObject([
      {
        kind: 'list',
        title: 'Work',
        items: [
          { text: 'Ship the draft', checked: false },
          { text: 'Call someone', checked: true },
        ],
      },
    ])
  })

  it('reports malformed checklist syntax instead of treating it as task text', () => {
    const result = parseMarkdown('## List\n* [yes] Ambiguous', baseDocument)

    expect(result.errors).toEqual([
      { line: 2, code: 'unrecognized-line' },
    ])
    expect(result.document.blocks[0]).toMatchObject({ kind: 'list', items: [] })
  })

  it('preserves checked state when parsing star checklist input', () => {
    const result = parseMarkdown('## List\n* [ ] Open\n* [x] Done', baseDocument)

    expect(result.errors).toEqual([])
    expect(result.document.blocks[0]).toMatchObject({
      kind: 'list',
      items: [
        { text: 'Open', checked: false },
        { text: 'Done', checked: true },
      ],
    })
    expect(serializeMarkdown(result.document)).toBe(
      '## List\n- [ ] Open\n- [x] Done',
    )
  })

  it('preserves compatible application IDs across valid text edits', () => {
    const previousDocument: TodoDocument = {
      ...baseDocument,
      blocks: [
        {
          id: 'list-stable',
          kind: 'list',
          title: 'Before',
          items: [{ id: 'item-stable', text: 'Before', checked: false }],
        },
        { id: 'break-stable', kind: 'panel-break' },
      ],
    }

    const result = parseMarkdown(
      '## After\n- [x] After\n\n---',
      previousDocument,
    )

    expect(result.errors).toEqual([])
    expect(result.document.blocks).toEqual([
      {
        id: 'list-stable',
        kind: 'list',
        title: 'After',
        items: [{ id: 'item-stable', text: 'After', checked: true }],
      },
      { id: 'break-stable', kind: 'panel-break' },
    ])
  })

  // Moon type has no Markdown syntax, so switching editor modes must not silently reset it.
  it('carries the typography setting through a Markdown round trip', () => {
    const moonDocument: TodoDocument = { ...baseDocument, typography: 'moon' }
    const result = parseMarkdown(serializeMarkdown(moonDocument), moonDocument)

    expect(result.errors).toEqual([])
    expect(result.document.typography).toBe('moon')
  })
})

describe('Markdown draft parsing and identity reconciliation', () => {
  const previousDocument: TodoDocument = {
    version: 1,
    date: '2026-08-23',
    showDate: true,
    showPanelNumbers: false,
    typography: 'latin',
    blocks: [
      {
        id: 'list-1',
        kind: 'list',
        title: 'First',
        items: [
          { id: 'item-1', text: 'Duplicate', checked: false },
          { id: 'item-2', text: 'Second', checked: false },
        ],
      },
      { id: 'break-1', kind: 'panel-break' },
      {
        id: 'list-2',
        kind: 'list',
        title: 'Second',
        items: [{ id: 'item-3', text: 'Duplicate', checked: true }],
      },
    ],
  }

  const createSequentialIdFactory = (): MarkdownIdFactory => {
    const counts = { list: 0, item: 0, break: 0 }
    return (prefix) => `${prefix}-new-${++counts[prefix]}`
  }

  it('parses an ID-free draft before reconciliation', () => {
    const result = parseMarkdownDraft('# 2026-08-24\n\n## List\n* [x] Done\n\n---')

    expect(result).toEqual({
      draft: {
        date: '2026-08-24',
        blocks: [
          {
            kind: 'list',
            title: 'List',
            items: [{ text: 'Done', checked: true }],
          },
          { kind: 'panel-break' },
        ],
      },
      errors: [],
    })
  })

  it('inherits unrepresented settings and reuses IDs at compatible positions', () => {
    const { draft } = parseMarkdownDraft(
      '## Renamed\n- [x] Changed\n- [ ] Still second\n- [ ] Added\n\n---\n\n## Other',
    )

    const document = reconcileMarkdownDraft(
      draft,
      previousDocument,
      createSequentialIdFactory(),
    )

    expect(document).toEqual({
      version: 1,
      date: '2026-08-23',
      showDate: false,
      showPanelNumbers: false,
      typography: 'latin',
      blocks: [
        {
          id: 'list-1',
          kind: 'list',
          title: 'Renamed',
          items: [
            { id: 'item-1', text: 'Changed', checked: true },
            { id: 'item-2', text: 'Still second', checked: false },
            { id: 'item-new-1', text: 'Added', checked: false },
          ],
        },
        { id: 'break-1', kind: 'panel-break' },
        { id: 'list-2', kind: 'list', title: 'Other', items: [] },
      ],
    })
  })

  it('allocates IDs when a block position changes kind', () => {
    const { draft } = parseMarkdownDraft('---\n\n## Replacement\n- [ ] Task')

    const document = reconcileMarkdownDraft(
      draft,
      previousDocument,
      createSequentialIdFactory(),
    )

    expect(document.blocks).toEqual([
      { id: 'break-new-1', kind: 'panel-break' },
      {
        id: 'list-new-1',
        kind: 'list',
        title: 'Replacement',
        items: [{ id: 'item-new-1', text: 'Task', checked: false }],
      },
    ])
  })

  it('drops deleted positions without reallocating the compatible remainder', () => {
    const { draft } = parseMarkdownDraft('## First\n- [ ] Remaining')

    const document = reconcileMarkdownDraft(
      draft,
      previousDocument,
      createSequentialIdFactory(),
    )

    expect(document.blocks).toEqual([
      {
        id: 'list-1',
        kind: 'list',
        title: 'First',
        items: [{ id: 'item-1', text: 'Remaining', checked: false }],
      },
    ])
  })

  it('keeps identity positional when duplicate content is reordered', () => {
    const { draft } = parseMarkdownDraft(
      '## Second\n- [ ] Duplicate\n\n---\n\n## First\n- [x] Duplicate',
    )

    const document = reconcileMarkdownDraft(
      draft,
      previousDocument,
      createSequentialIdFactory(),
    )

    expect(document.blocks).toEqual([
      {
        id: 'list-1',
        kind: 'list',
        title: 'Second',
        items: [{ id: 'item-1', text: 'Duplicate', checked: false }],
      },
      { id: 'break-1', kind: 'panel-break' },
      {
        id: 'list-2',
        kind: 'list',
        title: 'First',
        items: [{ id: 'item-3', text: 'Duplicate', checked: true }],
      },
    ])
  })

  it('uses a parsed date while preserving panel-number settings', () => {
    const { draft } = parseMarkdownDraft('# 2026-08-24\n\n## List')

    const document = reconcileMarkdownDraft(
      draft,
      previousDocument,
      createSequentialIdFactory(),
    )

    expect(document).toMatchObject({
      date: '2026-08-24',
      showDate: true,
      showPanelNumbers: false,
    })
  })
})

describe('Markdown source editing', () => {
  it('normalizes supported input to canonical dash checklists', () => {
    expect(
      normalizeMarkdownSource(
        '##   List   \r\n* [X] Done   \r\n- Plain task\r\n\r\n\r\n---   ',
      ),
    ).toBe('## List\n- [x] Done\n- [ ] Plain task\n\n---\n')
  })

  it('starts a new list only from a complete empty checklist line', () => {
    expect(continueMarkdownAtSelection('## List\n- [ ] ', 11, 11)).toEqual({
      source: '## List\n\n## ',
      selectionStart: 12,
      selectionEnd: 12,
    })
  })

  it.each([
    {
      name: 'before task text',
      selection: 14,
      expected: '## List\n- [ ] \n- [ ] Task',
    },
    {
      name: 'within task text',
      selection: 16,
      expected: '## List\n- [ ] Ta\n- [ ] sk',
    },
    {
      name: 'after task text',
      selection: 18,
      expected: '## List\n- [ ] Task\n- [ ] ',
    },
  ])('continues a non-empty checklist $name', ({ selection, expected }) => {
    expect(
      continueMarkdownAtSelection('## List\n- [ ] Task', selection, selection),
    ).toEqual({
      source: expected,
      selectionStart: selection + 7,
      selectionEnd: selection + 7,
    })
  })

  it('preserves indentation and CRLF when continuing a checklist', () => {
    const source = '## List\r\n  * [x] Task'

    expect(continueMarkdownAtSelection(source, source.length, source.length)).toEqual({
      source: '## List\r\n  * [x] Task\r\n  - [ ] ',
      selectionStart: source.length + 10,
      selectionEnd: source.length + 10,
    })
  })

  it('leaves selection ranges and non-checklist lines to native Enter behavior', () => {
    expect(continueMarkdownAtSelection('## List\n- [ ] Task', 14, 18)).toBeNull()
    expect(continueMarkdownAtSelection('## List', 7, 7)).toBeNull()
  })
})
