import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Browser, type Page } from 'puppeteer'
import { createServer, type ViteDevServer } from 'vite'
import { launchBrowser } from './browser'
import { STORAGE_KEY } from '../../src/hooks/usePersistentDocument'
import type { TodoDocument } from '../../src/domain/types'

/**
 * The date control is a `<label>` inside a wrapping flex `.toolbar-group`, so whether it sits beside
 * the "Date on first panel" toggle or on a line of its own is decided entirely by the cascade at a
 * given viewport width. jsdom reports every box as zero and cannot answer that; a real engine can.
 */
const document: TodoDocument = {
  version: 1,
  date: '2026-01-01',
  showDate: true,
  showPanelNumbers: true,
  typography: 'latin',
  blocks: [
    {
      kind: 'list',
      id: 'list-1',
      title: 'Panel 1',
      items: [{ id: 'item-1', text: 'A task', checked: false }],
    },
  ],
}

/**
 * 1280 and 900 sit above and below the 1080px breakpoint; 560 is inside the 520-820 band, where the
 * groups stack without stretching their contents; 380 is below the 520px breakpoint that turns each
 * group into a stretched column.
 */
const ROW_SHARING_WIDTHS = [1280, 900, 560]
const STACKED_WIDTH = 380
const VIEWPORT_WIDTHS = [...ROW_SHARING_WIDTHS, STACKED_WIDTH]

/** Sub-pixel slack for boxes the engine computed by layout rather than by our arithmetic. */
const EPSILON_PX = 0.5

interface ToolbarMeasurement {
  toggleCenterY: number
  dateCenterY: number
  dateWidthPx: number
  groupContentWidthPx: number
}

describe('toolbar date control layout', () => {
  let server: ViteDevServer
  let browser: Browser
  let page: Page

  const measured = new Map<number, ToolbarMeasurement>()

  const measureToolbar = async (): Promise<ToolbarMeasurement> =>
    page.evaluate(() => {
      const group = window.document.querySelector('.document-toolbar .toolbar-group')
      if (!(group instanceof HTMLElement)) throw new Error('The toolbar rendered no group')

      const toggle = group.querySelector('.toggle-control')
      const date = group.querySelector('.date-control')
      if (!(toggle instanceof HTMLElement)) throw new Error('The toolbar group rendered no toggle')
      if (!(date instanceof HTMLElement)) throw new Error('The toolbar group rendered no date control')

      const groupStyle = window.getComputedStyle(group)
      const toggleBox = toggle.getBoundingClientRect()
      const dateBox = date.getBoundingClientRect()

      return {
        toggleCenterY: toggleBox.top + toggleBox.height / 2,
        dateCenterY: dateBox.top + dateBox.height / 2,
        dateWidthPx: dateBox.width,
        groupContentWidthPx:
          group.getBoundingClientRect().width -
          Number.parseFloat(groupStyle.paddingLeft) -
          Number.parseFloat(groupStyle.paddingRight),
      }
    })

  const at = (width: number): ToolbarMeasurement => {
    const measurement = measured.get(width)
    if (!measurement) throw new Error(`No measurement was collected at ${width}px`)
    return measurement
  }

  beforeAll(async () => {
    server = await createServer({ server: { port: 0 }, logLevel: 'silent' })
    await server.listen()
    const appUrl = server.resolvedUrls?.local[0]
    if (!appUrl) throw new Error('The Vite dev server reported no local URL')

    browser = await launchBrowser()
    page = await browser.newPage()

    await page.goto(appUrl, { waitUntil: 'networkidle0' })
    await page.evaluate(
      (key: string, value: string) => window.localStorage.setItem(key, value),
      STORAGE_KEY,
      JSON.stringify(document),
    )

    for (const width of VIEWPORT_WIDTHS) {
      await page.setViewport({ width, height: 1200, deviceScaleFactor: 1 })
      await page.reload({ waitUntil: 'networkidle0' })
      await page.waitForSelector('.document-toolbar .date-control')
      measured.set(width, await measureToolbar())
    }
  }, 300_000)

  afterAll(async () => {
    await browser?.close()
    await server?.close()
  })

  it('measured every viewport width', () => {
    expect([...measured.keys()].sort((a, b) => a - b)).toEqual(
      [...VIEWPORT_WIDTHS].sort((a, b) => a - b),
    )
  })

  it.each(ROW_SHARING_WIDTHS)('keeps the date control beside its toggle at %ipx', (width) => {
    const toolbar = at(width)

    expect(Math.abs(toolbar.dateCenterY - toolbar.toggleCenterY)).toBeLessThanOrEqual(1)
  })

  it.each(ROW_SHARING_WIDTHS)('leaves the date control narrower than its group at %ipx', (width) => {
    const toolbar = at(width)

    expect(toolbar.dateWidthPx).toBeLessThan(toolbar.groupContentWidthPx - EPSILON_PX)
  })

  it('stretches the date control across the stacked group below 520px', () => {
    const toolbar = at(STACKED_WIDTH)

    expect(toolbar.dateCenterY).toBeGreaterThan(toolbar.toggleCenterY)
    expect(toolbar.dateWidthPx).toBeCloseTo(toolbar.groupContentWidthPx, 0)
  })
})
