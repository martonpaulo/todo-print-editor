import { describe, expect, it } from 'vitest'
import { isValidIsoDate } from './date.ts'
import { parseMarkdownDraft } from './markdown.ts'
import { decodeDocument } from './storage.ts'

// One table, two boundaries. Markdown parsing and persisted-document decoding are checked against
// the same cases so neither can drift into accepting a date the other rejects.
const CASES: ReadonlyArray<{ value: string; valid: boolean; reason: string }> = [
  { value: '2026-08-24', valid: true, reason: 'an ordinary date' },
  { value: '2024-02-29', valid: true, reason: 'a leap day in a leap year' },
  { value: '2000-02-29', valid: true, reason: 'a leap day in a century leap year' },
  { value: '2026-01-01', valid: true, reason: 'the first day of a year' },
  { value: '2026-12-31', valid: true, reason: 'the last day of a year' },
  { value: '9999-12-31', valid: true, reason: 'the last representable four-digit date' },
  { value: '0001-01-01', valid: true, reason: 'a year below the two-digit boundary' },
  { value: '0050-03-01', valid: true, reason: 'a year the 1900 offset would misread' },
  { value: '2026-02-29', valid: false, reason: 'a leap day outside a leap year' },
  { value: '1900-02-29', valid: false, reason: 'a leap day in a non-leap century year' },
  { value: '2026-04-31', valid: false, reason: 'a day past the end of a 30-day month' },
  { value: '2026-13-01', valid: false, reason: 'a month past December' },
  { value: '2026-00-10', valid: false, reason: 'a zero month' },
  { value: '2026-01-00', valid: false, reason: 'a zero day' },
  { value: '0000-00-00', valid: false, reason: 'zero values throughout' },
  { value: '2026-1-01', valid: false, reason: 'a one-digit month' },
  { value: '2026-01-1', valid: false, reason: 'a one-digit day' },
  { value: '20260-01-01', valid: false, reason: 'a five-digit year' },
  { value: '2026-08-24 ', valid: false, reason: 'trailing whitespace' },
  { value: '2026/08/24', valid: false, reason: 'non-hyphen separators' },
  { value: '24-08-2026', valid: false, reason: 'a reordered date' },
  { value: 'August 24', valid: false, reason: 'a written date' },
  { value: '', valid: false, reason: 'an empty value' },
]

const parsedMarkdownDate = (value: string): string | null =>
  parseMarkdownDraft(`# ${value}\n## Today\n- [ ] Print this`).draft.date

const decodedDate = (value: string): string | null =>
  decodeDocument({
    version: 1,
    date: value,
    showDate: true,
    showPanelNumbers: false,
    blocks: [
      {
        id: 'list-1',
        kind: 'list',
        title: 'Today',
        items: [{ id: 'item-1', text: 'Print this', checked: false }],
      },
    ],
  })?.date ?? null

describe('the ISO date invariant', () => {
  it.each(CASES)('reports $value as $valid, being $reason', ({ value, valid }) => {
    expect(isValidIsoDate(value)).toBe(valid)
  })

  // Markdown owns its own line handling before the date is read: `# ` carries no value at all, and
  // surrounding whitespace is trimmed off the heading. The cross-boundary comparison therefore uses
  // every case whose value survives that step unchanged.
  it.each(CASES.filter((testCase) => testCase.value !== '' && testCase.value === testCase.value.trim()))(
    'agrees at both input boundaries for $value',
    ({ value, valid }) => {
      expect(parsedMarkdownDate(value)).toBe(valid ? value : null)
      expect(decodedDate(value)).toBe(valid ? value : null)
    },
  )
})
