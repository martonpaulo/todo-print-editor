import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { type Browser, type Page } from 'puppeteer'
import { createServer, type ViteDevServer } from 'vite'
import { launchBrowser } from './browser'
import { STORAGE_KEY } from '../../src/hooks/usePersistentDocument'
import type { TodoDocument } from '../../src/domain/types'

/**
 * The preview downscales a sheet to fit the stage. The gutter it fits inside is declared once, by
 * `.preview-stage` in `src/styles/app.css`, and a responsive breakpoint changes it — so the only
 * check that can prove the scale still matches the rendered layout is one that lets a real engine
 * apply that stylesheet. jsdom reports every box as zero and cannot.
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
 * Widths that exercise both padding configurations `.preview-stage` declares: the base one, and the
 * `max-width: 520px` override. 900 and 560 sit either side of the 820 px breakpoint that stacks the
 * layout, so the stage changes width without its padding changing; 520 and 380 are the narrow
 * gutter. 2600 is wide enough that the sheet fits unscaled, which pins the cap at 1.
 */
const VIEWPORT_WIDTHS = [2600, 900, 560, 520, 380]

/** Sub-pixel slack for a value the engine computed by layout rather than by our arithmetic. */
const EPSILON_PX = 0.5

interface StageMeasurement {
  paddingSumPx: number
  contentWidthPx: number
  scrollWidthPx: number
  clientWidthPx: number
  sheetWidthPx: number
  unscaledSheetWidthPx: number
  scale: number
}

describe('preview scaling', () => {
  let server: ViteDevServer
  let browser: Browser
  let page: Page

  const measured = new Map<number, StageMeasurement>()
  let resizedScales: { narrow: number; wide: number } | null = null

  const measureStage = async (): Promise<StageMeasurement> =>
    page.evaluate(() => {
      const stage = window.document.querySelector('.preview-stage')
      const shell = window.document.querySelector('.preview-page-shell')
      const sheet = window.document.querySelector('.print-page')
      if (!(stage instanceof HTMLElement)) throw new Error('The preview rendered no stage')
      if (!(shell instanceof HTMLElement)) throw new Error('The preview rendered no sheet shell')
      if (!(sheet instanceof HTMLElement)) throw new Error('The preview rendered no sheet')

      const stageStyle = window.getComputedStyle(stage)
      const paddingSumPx =
        Number.parseFloat(stageStyle.paddingLeft) + Number.parseFloat(stageStyle.paddingRight)
      const matrix = new DOMMatrixReadOnly(window.getComputedStyle(sheet).transform)

      return {
        paddingSumPx,
        contentWidthPx: stage.clientWidth - paddingSumPx,
        scrollWidthPx: stage.scrollWidth,
        clientWidthPx: stage.clientWidth,
        // The shell is the space the scaled sheet actually occupies in the flow; the sheet itself
        // keeps its unscaled box and is shrunk by a transform.
        sheetWidthPx: shell.getBoundingClientRect().width,
        unscaledSheetWidthPx: sheet.offsetWidth,
        scale: matrix.a,
      }
    })

  const at = (width: number): StageMeasurement => {
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
      // Reloaded rather than resized in place, so each width is measured from a first paint as well
      // as through the resize path the next iteration exercises.
      await page.reload({ waitUntil: 'networkidle0' })
      await page.waitForSelector('.print-page')
      measured.set(width, await measureStage())
    }

    // Resizing without a reload must land on the same scale a fresh load produces, which is what
    // proves the resize observation still sees the padding in force. Both directions cross the
    // 820px stacking breakpoint and the 520px gutter change, so a scale computed from a stale
    // gutter would disagree with the recorded one.
    const settleAt = async (width: number): Promise<void> => {
      await page.setViewport({ width, height: 1200, deviceScaleFactor: 1 })
      await page.waitForFunction(
        (expected: number) => {
          const sheet = window.document.querySelector('.print-page')
          if (!(sheet instanceof HTMLElement)) return false
          const scale = new DOMMatrixReadOnly(window.getComputedStyle(sheet).transform).a
          return Math.abs(scale - expected) < 1e-6
        },
        { timeout: 10_000 },
        at(width).scale,
      )
    }

    await settleAt(2600)
    await settleAt(380)
    await settleAt(900)
    resizedScales = { narrow: at(380).scale, wide: at(900).scale }
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

  it('declares a narrower gutter below the 520px breakpoint than above it', () => {
    expect(at(520).paddingSumPx).toBeLessThan(at(560).paddingSumPx)
    expect(at(380).paddingSumPx).toBe(at(520).paddingSumPx)
    expect(at(900).paddingSumPx).toBe(at(560).paddingSumPx)
  })

  it.each(VIEWPORT_WIDTHS)('scales the sheet to the rendered content box at %ipx', (width) => {
    const stage = at(width)

    expect(stage.scale).toBeCloseTo(
      Math.min(1, stage.contentWidthPx / stage.unscaledSheetWidthPx),
      5,
    )
  })

  it.each(VIEWPORT_WIDTHS)('keeps the sheet inside the stage at %ipx', (width) => {
    const stage = at(width)

    expect(stage.sheetWidthPx).toBeLessThanOrEqual(stage.contentWidthPx + EPSILON_PX)
    expect(stage.scrollWidthPx).toBeLessThanOrEqual(stage.clientWidthPx + EPSILON_PX)
  })

  it.each([900, 560, 520, 380])('fills the whole content box at %ipx', (width) => {
    const stage = at(width)

    // Below the cap the sheet is scaled precisely to the gutter the stylesheet left it, so any
    // width the preview fails to use is width the fixed-gutter arithmetic used to waste.
    expect(stage.scale).toBeLessThan(1)
    expect(stage.sheetWidthPx).toBeCloseTo(stage.contentWidthPx, 0)
  })

  it('recomputes the scale when the viewport crosses the 820px and 520px breakpoints', () => {
    // `settleAt` already asserted this by waiting; failing here reports it as a test rather than as
    // a suite-aborting timeout in the collection step.
    expect(resizedScales).toEqual({ narrow: at(380).scale, wide: at(900).scale })
  })

  it('caps the scale at 1 on a viewport wider than the sheet', () => {
    expect(at(2600).scale).toBe(1)
    expect(at(2600).contentWidthPx).toBeGreaterThan(at(2600).unscaledSheetWidthPx)
  })

  /**
   * Zoom multiplies that fit scale, so what it changes is the rendered sheet and the space reserved
   * for it — never the paginated layout, and never a number jsdom could report. These cases run on
   * the live page left at 900px, and each returns the preview to the fit scale it found.
   */
  describe('zoom', () => {
    const clickZoom = async (name: string): Promise<void> => {
      await page.evaluate((label: string) => {
        const control = [...window.document.querySelectorAll('.preview-zoom button')].find(
          (button) => (button.getAttribute('aria-label') ?? button.textContent ?? '').trim() === label,
        )
        if (!(control instanceof HTMLButtonElement)) throw new Error(`No ${label} control`)
        control.click()
      }, name)
      await page.waitForNetworkIdle({ idleTime: 50 }).catch(() => {})
    }

    const settle = async (expected: number): Promise<void> => {
      await page.waitForFunction(
        (scale: number) => {
          const sheet = window.document.querySelector('.print-page')
          if (!(sheet instanceof HTMLElement)) return false
          return (
            Math.abs(new DOMMatrixReadOnly(window.getComputedStyle(sheet).transform).a - scale) <
            1e-6
          )
        },
        { timeout: 10_000 },
        expected,
      )
    }

    afterEach(async () => {
      await clickZoom('Reset to fit')
      await settle(at(900).scale)
    })

    it('multiplies the fit scale by the zoom step', async () => {
      await clickZoom('Zoom in')
      await settle(at(900).scale * 1.25)

      const zoomed = await measureStage()
      expect(zoomed.unscaledSheetWidthPx).toBe(at(900).unscaledSheetWidthPx)
      expect(zoomed.sheetWidthPx).toBeCloseTo(at(900).sheetWidthPx * 1.25, 0)
    })

    it('scrolls the stage to both edges of a sheet wider than it', async () => {
      await clickZoom('Zoom in')
      await settle(at(900).scale * 1.25)

      const reach = await page.evaluate(() => {
        const stage = window.document.querySelector('.preview-stage')
        const shell = window.document.querySelector('.preview-page-shell')
        if (!(stage instanceof HTMLElement) || !(shell instanceof HTMLElement)) {
          throw new Error('The preview rendered no stage')
        }

        stage.scrollLeft = 0
        const startGap = shell.getBoundingClientRect().left - stage.getBoundingClientRect().left
        stage.scrollLeft = stage.scrollWidth
        const endGap = stage.getBoundingClientRect().right - shell.getBoundingClientRect().right
        stage.scrollLeft = 0

        return { overflows: stage.scrollWidth > stage.clientWidth, startGap, endGap }
      })

      expect(reach.overflows).toBe(true)
      // Neither edge of the sheet is stranded outside the scrollable range.
      expect(reach.startGap).toBeGreaterThanOrEqual(-EPSILON_PX)
      expect(reach.endGap).toBeGreaterThanOrEqual(-EPSILON_PX)
    })

    it('reaches neither the controls nor the sheet under print media', async () => {
      await clickZoom('Zoom in')
      await settle(at(900).scale * 1.25)

      await page.emulateMediaType('print')
      try {
        const printed = await page.evaluate(() => {
          const controls = window.document.querySelector('.preview-zoom')
          const sheet = window.document.querySelector('.print-page')
          if (!(controls instanceof HTMLElement) || !(sheet instanceof HTMLElement)) {
            throw new Error('The preview rendered no zoom controls')
          }

          return {
            controlsDisplay: window.getComputedStyle(controls).display,
            sheetTransform: window.getComputedStyle(sheet).transform,
            sheetWidthPx: sheet.getBoundingClientRect().width,
            unscaledSheetWidthPx: sheet.offsetWidth,
          }
        })

        expect(printed.controlsDisplay).toBe('none')
        // The zoom transform is dropped on paper, so a zoomed preview prints the recorded sheet.
        expect(printed.sheetTransform).toBe('none')
        expect(printed.sheetWidthPx).toBeCloseTo(printed.unscaledSheetWidthPx, 0)
      } finally {
        // `undefined`, not `null`: Puppeteer types the parameter as `string | undefined`.
        await page.emulateMediaType(undefined)
      }
    })

    it('leaves the fit scale itself unchanged, so reset returns to it', async () => {
      await clickZoom('Zoom out')
      await settle(at(900).scale * 0.75)
      await clickZoom('Reset to fit')
      await settle(at(900).scale)

      const reset = await measureStage()
      expect(reset.scale).toBeCloseTo(at(900).scale, 5)
      expect(reset.scrollWidthPx).toBeLessThanOrEqual(reset.clientWidthPx + EPSILON_PX)
    })
  })
})
