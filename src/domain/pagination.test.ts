import { describe, expect, it } from 'vitest'
import { groupPanelsIntoPages, PANELS_PER_PAGE, paginateBlocks } from './pagination.ts'
import type { DocumentBlock, ListBlock } from './types.ts'

const list = (id: string): ListBlock => ({
  id,
  kind: 'list',
  title: id,
  items: [],
})

const panelBreak = (id: string): DocumentBlock => ({
  id,
  kind: 'panel-break',
})

const options = {
  firstPanelCapacity: 100,
  panelCapacity: 120,
  listGap: 10,
}

describe('atomic list pagination', () => {
  it('moves a whole list to the next panel when it cannot fit', () => {
    const result = paginateBlocks(
      [list('a'), list('b')],
      { a: 70, b: 40 },
      options,
    )

    expect(result.panels.map((panel) => panel.map((entry) => entry.id))).toEqual([
      ['a'],
      ['b'],
    ])
    expect(result.overflowListIds).toEqual([])
  })

  it('keeps an intentional empty panel created by explicit breaks', () => {
    const result = paginateBlocks(
      [panelBreak('one'), panelBreak('two'), list('a')],
      { a: 20 },
      options,
    )

    expect(result.panels.map((panel) => panel.map((entry) => entry.id))).toEqual([
      [],
      [],
      ['a'],
    ])
  })

  it('moves a list out of the shorter dated panel when it fits a normal panel', () => {
    const result = paginateBlocks([list('a')], { a: 110 }, options)

    expect(result.panels.map((panel) => panel.map((entry) => entry.id))).toEqual([
      [],
      ['a'],
    ])
    expect(result.overflowListIds).toEqual([])
  })

  it('marks a list that cannot fit an empty normal panel', () => {
    const result = paginateBlocks([list('a')], { a: 121 }, options)

    expect(result.overflowListIds).toEqual(['a'])
  })
})

describe('effective panel capacity', () => {
  // The regression #2 records: an empty regular panel used to keep the raw capacity when a
  // transition created it and a reduced one otherwise, so the same list was accepted or reported
  // as overflowing purely by the route it took.
  it('gives an empty regular panel the same capacity after an automatic move and an explicit break', () => {
    const height = options.panelCapacity
    const heights = { filler: options.firstPanelCapacity, a: height }

    const automatic = paginateBlocks([list('filler'), list('a')], heights, options)
    const explicit = paginateBlocks([list('filler'), panelBreak('one'), list('a')], heights, options)

    expect(automatic.panels.map((panel) => panel.map((entry) => entry.id))).toEqual([
      ['filler'],
      ['a'],
    ])
    expect(explicit.panels.map((panel) => panel.map((entry) => entry.id))).toEqual([
      ['filler'],
      ['a'],
    ])
    expect(automatic.overflowListIds).toEqual(explicit.overflowListIds)
    expect(automatic.overflowListIds).toEqual([])
  })

  it('accepts a list of exactly the panel capacity and rejects one pixel more', () => {
    const fits = paginateBlocks(
      [panelBreak('one'), list('a')],
      { a: options.panelCapacity },
      options,
    )
    const spills = paginateBlocks(
      [panelBreak('one'), list('a')],
      { a: options.panelCapacity + 1 },
      options,
    )

    expect(fits.overflowListIds).toEqual([])
    expect(spills.overflowListIds).toEqual(['a'])
  })
})

describe('fixed three-slot page grouping', () => {
  const panelsOf = (count: number) => Array.from({ length: count }, (_, index) => [list(`l${index}`)])

  const shapeOf = (pages: ReturnType<typeof groupPanelsIntoPages>) =>
    pages.map((page) => page.map((slot) => (slot === null ? null : slot.map((entry) => entry.id))))

  it.each([0, 1, 2, 3, 4, 7])('lays %i panels out in whole pages of three slots', (panelCount) => {
    const pages = groupPanelsIntoPages(panelsOf(panelCount))

    expect(pages).toHaveLength(Math.max(1, Math.ceil(panelCount / PANELS_PER_PAGE)))
    pages.forEach((page) => expect(page).toHaveLength(PANELS_PER_PAGE))
    expect(pages.flat().filter((slot) => slot !== null)).toHaveLength(panelCount)
  })

  it('fills only the trailing slots of the final page', () => {
    expect(shapeOf(groupPanelsIntoPages(panelsOf(1)))).toEqual([[['l0'], null, null]])
    expect(shapeOf(groupPanelsIntoPages(panelsOf(2)))).toEqual([[['l0'], ['l1'], null]])
    expect(shapeOf(groupPanelsIntoPages(panelsOf(3)))).toEqual([[['l0'], ['l1'], ['l2']]])
    expect(shapeOf(groupPanelsIntoPages(panelsOf(4)))).toEqual([
      [['l0'], ['l1'], ['l2']],
      [['l3'], null, null],
    ])
  })

  it('keeps an empty panel from an explicit break as a panel, not a filler', () => {
    const { panels } = paginateBlocks([panelBreak('one'), list('a')], { a: 10 }, options)

    expect(shapeOf(groupPanelsIntoPages(panels))).toEqual([[[], ['a'], null]])
  })

  it('still produces one page of paper for a document with no panels', () => {
    expect(groupPanelsIntoPages([])).toEqual([[null, null, null]])
  })
})
