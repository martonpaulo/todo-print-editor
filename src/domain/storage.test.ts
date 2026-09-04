import { describe, expect, it } from 'vitest'
import { decodeDocument } from './storage.ts'

const validDocument = {
  version: 1,
  date: '2026-08-24',
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
}

describe('persisted document validation', () => {
  it('accepts a complete version-one document', () => {
    expect(decodeDocument({ ...validDocument, typography: 'latin' })).toEqual({
      ...validDocument,
      typography: 'latin',
      rotatePrint: false,
    })
  })

  it('keeps a stored Moon typography setting', () => {
    expect(decodeDocument({ ...validDocument, typography: 'moon' })).toMatchObject({
      typography: 'moon',
    })
  })

  // Documents were persisted before the setting existed, and their only copy is the browser's.
  // Rejecting them would discard the user's document rather than migrate it.
  it('reads a document stored before typography existed as Latin', () => {
    expect(decodeDocument(validDocument)).toEqual({
      ...validDocument,
      typography: 'latin',
      rotatePrint: false,
    })
  })

  it('keeps a stored print rotation', () => {
    expect(decodeDocument({ ...validDocument, rotatePrint: true })).toMatchObject({
      rotatePrint: true,
    })
  })

  // The same reasoning as the typography setting above: the stored document predates the field, and
  // the paper it was printed on was landscape.
  it('reads a document stored before the print rotation existed as unrotated', () => {
    expect(decodeDocument(validDocument)).toMatchObject({ rotatePrint: false })
  })

  it.each([
    null,
    { ...validDocument, version: 2 },
    { ...validDocument, typography: 'braille' },
    { ...validDocument, typography: null },
    { ...validDocument, rotatePrint: 'yes' },
    { ...validDocument, rotatePrint: null },
    { ...validDocument, date: 'August 24' },
    { ...validDocument, blocks: [{ kind: 'list' }] },
    {
      ...validDocument,
      blocks: [{ ...validDocument.blocks[0], id: '' }],
    },
    {
      ...validDocument,
      blocks: [validDocument.blocks[0], { id: 'list-1', kind: 'panel-break' }],
    },
    {
      ...validDocument,
      blocks: [
        {
          ...validDocument.blocks[0],
          items: [
            validDocument.blocks[0].items[0],
            { id: 'item-1', text: 'Duplicate', checked: false },
          ],
        },
      ],
    },
  ])('rejects malformed browser data', (value) => {
    expect(decodeDocument(value)).toBeNull()
  })
})
