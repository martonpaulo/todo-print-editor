import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  it('renders tasks without a heading or divider when a list title is blank', () => {
    const document = documentOfPanels(1)
    const list = document.blocks.find((block) => block.kind === 'list')
    if (!list || list.kind !== 'list') throw new Error('The fixture rendered no list')
    list.title = '   '

    const { container } = render(
      <PrintPreview document={document} onLayoutStatusChange={() => {}} />,
    )
    const previewList = container.querySelector('.print-pages .print-list')

    expect(previewList).toHaveTextContent('A task')
    expect(previewList?.querySelector('h2')).toBeNull()
    expect(previewList?.querySelector('.print-list__rule')).toBeNull()
  })
})

describe('PrintPreview zoom', () => {
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

  const renderPreview = (onLayoutStatusChange = () => {}) =>
    render(<PrintPreview document={documentOfPanels(1)} onLayoutStatusChange={onLayoutStatusChange} />)

  const zoomLevel = () => screen.getByRole('group', { name: COPY.previewZoom }).textContent

  it('opens at the fit-to-width scale with the reset unavailable', () => {
    renderPreview()

    expect(zoomLevel()).toContain(COPY.zoomLevel(100))
    expect(screen.getByRole('button', { name: COPY.resetZoom })).toBeDisabled()
  })

  it('zooms in and out in whole quarter steps and returns to fit', async () => {
    const user = userEvent.setup()
    renderPreview()

    await user.click(screen.getByRole('button', { name: COPY.zoomIn }))
    expect(zoomLevel()).toContain(COPY.zoomLevel(125))

    await user.click(screen.getByRole('button', { name: COPY.zoomOut }))
    await user.click(screen.getByRole('button', { name: COPY.zoomOut }))
    expect(zoomLevel()).toContain(COPY.zoomLevel(75))

    await user.click(screen.getByRole('button', { name: COPY.resetZoom }))
    expect(zoomLevel()).toContain(COPY.zoomLevel(100))
    expect(screen.getByRole('button', { name: COPY.resetZoom })).toBeDisabled()
  })

  it('stops at half and double the fit scale', async () => {
    const user = userEvent.setup()
    renderPreview()

    const zoomIn = screen.getByRole('button', { name: COPY.zoomIn })
    for (let step = 0; step < 6; step += 1) {
      if (!(zoomIn as HTMLButtonElement).disabled) await user.click(zoomIn)
    }
    expect(zoomLevel()).toContain(COPY.zoomLevel(200))
    expect(zoomIn).toBeDisabled()

    const zoomOut = screen.getByRole('button', { name: COPY.zoomOut })
    for (let step = 0; step < 8; step += 1) {
      if (!(zoomOut as HTMLButtonElement).disabled) await user.click(zoomOut)
    }
    expect(zoomLevel()).toContain(COPY.zoomLevel(50))
    expect(zoomOut).toBeDisabled()
  })

  it('keeps the controls off the paper', () => {
    const { container } = renderPreview()

    expect(container.querySelector('.preview-zoom')).toHaveClass('screen-only')
    expect(container.querySelector('.print-page .preview-zoom')).toBeNull()
  })

  it('reports the same layout status however the preview is zoomed', async () => {
    const user = userEvent.setup()
    const onLayoutStatusChange = vi.fn()
    renderPreview(onLayoutStatusChange)

    const before = onLayoutStatusChange.mock.calls.at(-1)?.[0]
    await user.click(screen.getByRole('button', { name: COPY.zoomIn }))

    expect(onLayoutStatusChange.mock.calls.at(-1)?.[0]).toEqual(before)
  })
})
