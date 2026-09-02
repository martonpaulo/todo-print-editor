import type { DocumentBlock, ListBlock } from './types'

/**
 * Panel slots on one physical sheet, as recorded in `AGENTS.md`. A sheet always has this many
 * slots; a document that fills fewer of them prints the remainder as blank fillers rather than
 * shrinking the paper.
 */
export const PANELS_PER_PAGE = 3

export interface PaginationOptions {
  /**
   * Effective capacities, in pixels: whatever tolerance the browser measurement adapter needs has
   * already been subtracted. Pagination applies no allowance of its own, so an equivalent panel
   * has the same capacity however it was created.
   */
  firstPanelCapacity: number
  panelCapacity: number
  listGap: number
}

export interface PaginationResult {
  panels: ListBlock[][]
  overflowListIds: string[]
}

/** A page slot holds one panel's lists, or `null` when it is a blank filler. */
export type PageSlot = ListBlock[] | null

export const paginateBlocks = (
  blocks: DocumentBlock[],
  measurements: Readonly<Record<string, number>>,
  options: PaginationOptions,
): PaginationResult => {
  const panels: ListBlock[][] = [[]]
  const usedHeights = [0]
  const overflowListIds: string[] = []

  // Position is the only input: two panels at the same position have the same capacity whether an
  // explicit break, an automatic overflow, or the start of the document created them.
  const capacityAt = (panelIndex: number) =>
    panelIndex === 0 ? options.firstPanelCapacity : options.panelCapacity

  const addPanel = () => {
    panels.push([])
    usedHeights.push(0)
  }

  blocks.forEach((block) => {
    if (block.kind === 'panel-break') {
      addPanel()
      return
    }

    const height = measurements[block.id] ?? 0
    let panelIndex = panels.length - 1
    let panel = panels[panelIndex]
    let gap = panel.length > 0 ? options.listGap : 0

    const movesToNextPanel =
      panel.length > 0
        ? usedHeights[panelIndex] + gap + height > capacityAt(panelIndex)
        : // An empty first panel is shorter than a regular one when it carries the date, so a list
          // that only fits a regular panel starts the document on the second panel instead of
          // being reported as overflowing.
          panelIndex === 0 &&
          height > options.firstPanelCapacity &&
          height <= options.panelCapacity

    if (movesToNextPanel) {
      addPanel()
      panelIndex += 1
      panel = panels[panelIndex]
      gap = 0
    }

    if (height > capacityAt(panelIndex)) overflowListIds.push(block.id)

    panel.push(block)
    usedHeights[panelIndex] += gap + height
  })

  return { panels, overflowListIds }
}

/**
 * Project sequential panels onto fixed-size pages. Every page has exactly `PANELS_PER_PAGE` slots;
 * unused trailing slots are `null` fillers, and a document with no panels still produces one page,
 * because the paper exists before the content does.
 *
 * An empty panel produced by consecutive explicit breaks stays an empty array, not `null`: it is a
 * real panel that keeps its numbering, while a filler is blank paper.
 */
export const groupPanelsIntoPages = (panels: readonly ListBlock[][]): PageSlot[][] => {
  const pageCount = Math.max(1, Math.ceil(panels.length / PANELS_PER_PAGE))

  return Array.from({ length: pageCount }, (_, pageIndex) =>
    Array.from(
      { length: PANELS_PER_PAGE },
      (_unused, slotIndex) => panels[pageIndex * PANELS_PER_PAGE + slotIndex] ?? null,
    ),
  )
}
