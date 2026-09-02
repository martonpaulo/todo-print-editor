import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PrintPreview } from './PrintPreview'
import { COPY } from '../copy'
import { PANELS_PER_PAGE } from '../domain/pagination'
import type { DocumentBlock, TodoDocument } from '../domain/types'

/**
 * Panel breaks, not measured text, decide the panel count: jsdom reports every box as zero, so a
 * document that relied on heights would collapse to one panel regardless of its content.
 */
const documentOfPanels = (panelCount: number): TodoDocument => ({
  version: 1,
  date: '2026-01-01',
  showDate: true,
  showPanelNumbers: true,
  typography: 'latin',
  blocks: Array.from({ length: panelCount }, (_, index) => index).flatMap<DocumentBlock>((index) => [
    ...(index === 0 ? [] : [{ kind: 'panel-break' as const, id: `break-${index}` }]),
    {
      kind: 'list' as const,
      id: `list-${index + 1}`,
      title: `Panel ${index + 1}`,
      items: [{ id: `item-${index + 1}`, text: 'A task', checked: false }],
    },
  ]),
})

const renderPanels = (panelCount: number) => {
  const { container } = render(
    <PrintPreview document={documentOfPanels(panelCount)} onLayoutStatusChange={() => {}} />,
  )
  // The hidden measurement layer renders panels of its own; only the preview sheets are under test.
  const stage = container.querySelector('.print-pages')
  if (!stage) throw new Error('The preview rendered no sheets')

  return {
    container,
    pages: [...stage.querySelectorAll('.print-page')],
  }
}

describe('PrintPreview page structure', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    cleanup()
  })

  it.each([1, 2, 3, 4])('gives a %i-panel document whole sheets of three slots', (panelCount) => {
    const { pages } = renderPanels(panelCount)

    expect(pages).toHaveLength(Math.ceil(panelCount / PANELS_PER_PAGE))
    pages.forEach((page) => {
      expect(page.querySelectorAll('.print-panel')).toHaveLength(PANELS_PER_PAGE)
    })
    expect(pages.flatMap((page) => [...page.querySelectorAll('.print-panel--filler')])).toHaveLength(
      pages.length * PANELS_PER_PAGE - panelCount,
    )
  })

  it('leaves a filler slot empty and hidden from assistive technology', () => {
    const { pages } = renderPanels(1)
    const fillers = [...pages[0].querySelectorAll('.print-panel--filler')]

    expect(fillers).toHaveLength(2)
    fillers.forEach((filler) => {
      expect(filler).toBeEmptyDOMElement()
      expect(filler).toHaveAttribute('aria-hidden', 'true')
    })
  })

  it('numbers only the real panels and dates only the first', () => {
    const { pages } = renderPanels(4)
    const numbers = pages.flatMap((page) => [
      ...page.querySelectorAll('.print-panel-number'),
    ]).map((element) => element.textContent)

    expect(numbers).toEqual([1, 2, 3, 4].map((panel) => COPY.panelNumber(panel, 4)))
    expect(pages.flatMap((page) => [...page.querySelectorAll('.print-date')])).toHaveLength(1)
    expect(pages[0].querySelector('.print-date')).toBeInTheDocument()
  })

  it('declares no page width of its own, so the print tokens stay the only owner', () => {
    const { container, pages } = renderPanels(1)

    expect(container.querySelector('style')).toBeNull()
    pages.forEach((page) => {
      expect(page.getAttribute('style') ?? '').not.toMatch(/width|grid-template-columns/)
    })
    expect(container.innerHTML).not.toMatch(/\b(99|198)mm\b/)
  })
})
