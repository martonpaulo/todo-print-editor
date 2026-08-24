import { describe, expect, it } from 'vitest'
import { paginateBlocks } from './pagination.ts'
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
