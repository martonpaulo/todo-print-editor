import type { DocumentBlock, ListBlock } from './types'

export interface PaginationOptions {
  firstPanelCapacity: number
  panelCapacity: number
  listGap: number
}

export interface PaginationResult {
  panels: ListBlock[][]
  overflowListIds: string[]
}

export const paginateBlocks = (
  blocks: DocumentBlock[],
  measurements: Readonly<Record<string, number>>,
  options: PaginationOptions,
): PaginationResult => {
  const panels: ListBlock[][] = [[]]
  const usedHeights = [0]
  const overflowListIds: string[] = []

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
    let capacity = panelIndex === 0 ? options.firstPanelCapacity : options.panelCapacity
    let gap = panel.length > 0 ? options.listGap : 0

    if (panel.length > 0 && usedHeights[panelIndex] + gap + height > capacity) {
      addPanel()
      panelIndex += 1
      panel = panels[panelIndex]
      capacity = options.panelCapacity
      gap = 0
    } else if (
      panelIndex === 0 &&
      panel.length === 0 &&
      height > options.firstPanelCapacity &&
      height <= options.panelCapacity
    ) {
      addPanel()
      panelIndex += 1
      panel = panels[panelIndex]
      capacity = options.panelCapacity
      gap = 0
    }

    if (height > capacity) overflowListIds.push(block.id)

    panel.push(block)
    usedHeights[panelIndex] += gap + height
  })

  return { panels, overflowListIds }
}
