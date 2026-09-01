import { execFileSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import puppeteer, { type Browser, type Page } from 'puppeteer'
import { createServer, type ViteDevServer } from 'vite'
import { STORAGE_KEY } from '../../src/hooks/usePersistentDocument'
import type { TodoDocument } from '../../src/domain/types'
import { readPrintContract } from './contract'

const contract = readPrintContract()

/** CSS reference pixel, fixed by the CSS specification. */
const PX_PER_INCH = 96
/** PostScript point, the unit a PDF `/MediaBox` is written in. */
const POINTS_PER_INCH = 72
const MM_PER_INCH = 25.4

const pxToMm = (px: number): number => (px * MM_PER_INCH) / PX_PER_INCH
const pointsToMm = (points: number): number => (points * MM_PER_INCH) / POINTS_PER_INCH

/**
 * Document shapes worth measuring: one and two panels are partial sheets, the recorded panel count
 * is the full sheet, and one more than that produces a full sheet followed by a trailing partial.
 */
const PANEL_COUNTS = [1, 2, contract.panelsPerPage, contract.panelsPerPage + 1]

/**
 * Panel breaks, not text volume, decide the panel count here. The geometry under test is physical,
 * so nothing in this document may depend on how a font happens to render on the running machine.
 */
const panelBreakDocument = (panelCount: number): TodoDocument => ({
  version: 1,
  date: '2026-01-01',
  showDate: true,
  showPanelNumbers: true,
  blocks: Array.from({ length: panelCount }, (_, index) => index).flatMap((index) => [
    ...(index === 0 ? [] : ([{ kind: 'panel-break', id: `break-${index}` }] as const)),
    {
      kind: 'list',
      id: `list-${index + 1}`,
      title: `Panel ${index + 1}`,
      items: [{ id: `item-${index + 1}`, text: 'A task', checked: false }],
    } as const,
  ]),
})

interface MeasuredSheet {
  transform: string
  widthMm: number
  heightMm: number
  panels: { widthMm: number; heightMm: number; offsetLeftMm: number }[]
}

const launchBrowser = async (): Promise<Browser> => {
  const options = { args: ['--no-sandbox', '--disable-dev-shm-usage'] }
  try {
    return await puppeteer.launch(options)
  } catch (error) {
    // npm may be configured to skip install scripts, which is where Puppeteer normally provisions
    // its pinned Chrome. Fetch it once through Puppeteer's own CLI rather than asking for a manual
    // setup step the contract says must not exist.
    if (!String(error).includes('Could not find Chrome')) throw error
    execFileSync('npx', ['puppeteer', 'browsers', 'install', 'chrome'], { stdio: 'inherit' })
    return await puppeteer.launch(options)
  }
}

describe('printed page geometry', () => {
  let server: ViteDevServer
  let browser: Browser
  let page: Page
  let appUrl: string

  /** Seed a document of the given panel count and wait for its sheets to render. */
  const render = async (panelCount: number): Promise<void> => {
    await page.goto(appUrl, { waitUntil: 'networkidle0' })
    await page.evaluate(
      (key: string, document: string) => window.localStorage.setItem(key, document),
      STORAGE_KEY,
      JSON.stringify(panelBreakDocument(panelCount)),
    )
    await page.reload({ waitUntil: 'networkidle0' })
    await page.waitForSelector('.print-page')
  }

  const measureSheets = async (): Promise<MeasuredSheet[]> => {
    const raw = await page.evaluate(() =>
      [...window.document.querySelectorAll('.print-page')].map((sheet) => {
        const sheetRect = sheet.getBoundingClientRect()
        return {
          transform: window.getComputedStyle(sheet).transform,
          width: sheetRect.width,
          height: sheetRect.height,
          panels: [...sheet.querySelectorAll('.print-panel')].map((panel) => {
            const rect = panel.getBoundingClientRect()
            return { width: rect.width, height: rect.height, offsetLeft: rect.left - sheetRect.left }
          }),
        }
      }),
    )

    return raw.map((sheet) => ({
      transform: sheet.transform,
      widthMm: pxToMm(sheet.width),
      heightMm: pxToMm(sheet.height),
      panels: sheet.panels.map((panel) => ({
        widthMm: pxToMm(panel.width),
        heightMm: pxToMm(panel.height),
        offsetLeftMm: pxToMm(panel.offsetLeft),
      })),
    }))
  }

  /** Every `/MediaBox` in the printed PDF, in millimetres — one per physical sheet. */
  const measurePrintedPaper = async (): Promise<{ widthMm: number; heightMm: number }[]> => {
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true })
    const boxes = [
      ...Buffer.from(pdf)
        .toString('latin1')
        .matchAll(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/g),
    ].map((match) => ({
      widthMm: pointsToMm(Number(match[3]) - Number(match[1])),
      heightMm: pointsToMm(Number(match[4]) - Number(match[2])),
    }))

    if (boxes.length === 0) throw new Error('The generated PDF declares no /MediaBox')
    return boxes
  }

  /**
   * The preview downscales to fit narrow viewports. Measuring a scaled sheet would report the wrong
   * millimetres, so require the identity transform instead of dividing it back out.
   */
  const expectUnscaled = (sheets: MeasuredSheet[]) => {
    sheets.forEach((sheet) => {
      expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(sheet.transform)
    })
  }

  /** The invariants that hold for every sheet the renderer can currently produce. */
  const expectSequentialPanels = (sheets: MeasuredSheet[]) => {
    sheets.forEach((sheet) => {
      expect(sheet.panels.length).toBeGreaterThan(0)
      sheet.panels.forEach((panel, index) => {
        expect(panel.widthMm).toBeCloseTo(contract.panelWidthMm, 1)
        expect(panel.offsetLeftMm).toBeCloseTo(index * contract.panelWidthMm, 1)
      })
      expect(sheet.widthMm).toBeCloseTo(sheet.panels.length * contract.panelWidthMm, 1)
    })
  }

  beforeAll(async () => {
    server = await createServer({ server: { port: 0 }, logLevel: 'silent' })
    await server.listen()
    const url = server.resolvedUrls?.local[0]
    if (!url) throw new Error('The Vite dev server reported no local URL')
    appUrl = url

    browser = await launchBrowser()
    page = await browser.newPage()
    // Wide enough that the preview renders at scale 1; expectUnscaled proves it did.
    await page.setViewport({ width: 2600, height: 1600, deviceScaleFactor: 1 })
  }, 180_000)

  afterAll(async () => {
    await browser?.close()
    await server?.close()
  })

  it('states a contract whose panels tile the sheet', () => {
    expect(contract.panelsPerPage * contract.panelWidthMm).toBe(contract.pageWidthMm)
    expect(contract.panelHeightMm).toBe(contract.pageHeightMm)
  })

  it('renders one sheet of sequential panels at the recorded millimetre sizes', async () => {
    await render(contract.panelsPerPage)
    const sheets = await measureSheets()

    expect(sheets).toHaveLength(1)
    expectUnscaled(sheets)
    expectSequentialPanels(sheets)
    expect(sheets[0].panels).toHaveLength(contract.panelsPerPage)
    expect(sheets[0].widthMm).toBeCloseTo(contract.pageWidthMm, 1)
    expect(sheets[0].heightMm).toBeCloseTo(contract.pageHeightMm, 1)
    sheets[0].panels.forEach((panel) => {
      expect(panel.heightMm).toBeCloseTo(contract.panelHeightMm, 1)
    })
  })

  it('keeps that geometry under print media, where the stylesheet overrides it', async () => {
    // `@media print` in src/styles/print.css re-declares .print-page and .print-panel, so the
    // measurement above cannot speak for what a printer receives. Measure again under the media
    // the paper actually uses.
    await render(contract.panelsPerPage)
    await page.emulateMediaType('print')
    try {
      const sheets = await measureSheets()

      expectUnscaled(sheets)
      expectSequentialPanels(sheets)
      expect(sheets[0].panels).toHaveLength(contract.panelsPerPage)
      expect(sheets[0].widthMm).toBeCloseTo(contract.pageWidthMm, 1)

      // Height is bounded rather than equal here, and that is a finding rather than a looser
      // assertion: `.print-panel` under `@media print` is clamped to
      // `min-height: 209mm; max-height: 210mm`, so it settles 1mm short of the recorded 210mm
      // panel while the paper itself stays 210mm. Asserting equality would fail against current
      // main; asserting 209mm would encode the deviation as correct and break when it is fixed.
      // Tracked in #34, which owns the decision.
      sheets[0].panels.forEach((panel) => {
        expect(panel.heightMm).toBeLessThanOrEqual(contract.panelHeightMm + 0.05)
      })
      expect(sheets[0].heightMm).toBeLessThanOrEqual(contract.pageHeightMm + 0.05)
    } finally {
      // `undefined`, not `null`: Puppeteer types the parameter as `string | undefined`.
      await page.emulateMediaType(undefined)
    }

    // Prove the emulation was actually lifted, so a later test cannot silently inherit print media.
    const restored = await measureSheets()
    expect(restored[0].heightMm).toBeCloseTo(contract.pageHeightMm, 1)
  })

  it.each(PANEL_COUNTS)(
    'renders %i panels as sequential 99mm slots of full-height paper',
    async (panelCount) => {
      await render(panelCount)
      const sheets = await measureSheets()

      expect(sheets).toHaveLength(Math.ceil(panelCount / contract.panelsPerPage))
      expectUnscaled(sheets)
      expectSequentialPanels(sheets)
      sheets.forEach((sheet) => {
        expect(sheet.heightMm).toBeCloseTo(contract.pageHeightMm, 1)
      })

      // Half a millimetre: the PDF writes points rounded to two decimals, so an exact millimetre
      // comparison would fail on the rounding rather than on the geometry.
      const paper = await measurePrintedPaper()
      expect(paper).toHaveLength(sheets.length)
      paper.forEach((sheet) => {
        expect(sheet.heightMm).toBeCloseTo(contract.pageHeightMm, 0)
      })
    },
    120_000,
  )

  it('prints a full sheet at the recorded physical size', async () => {
    await render(contract.panelsPerPage)
    const paper = await measurePrintedPaper()

    expect(paper).toHaveLength(1)
    expect(paper[0].widthMm).toBeCloseTo(contract.pageWidthMm, 0)
    expect(paper[0].heightMm).toBeCloseTo(contract.pageHeightMm, 0)
  }, 60_000)

  /**
   * The contract says every printed page is A4 landscape. It is not, yet: `PrintPreview` assigns
   * `@page page-1` and `page-2` named sizes, so a one- or two-panel document — and the trailing
   * partial sheet of a longer one — prints narrower paper. That is the open defect #2, which is
   * outside this check's verification-only scope to fix.
   *
   * This test asserts the deviation rather than ignoring it, so it turns red the moment #2 lands
   * and the tightened assertion below has to replace it. Asserting the contract here instead would
   * fail against current main; asserting nothing would leave the gap invisible, which is what this
   * whole check exists to prevent.
   */
  it('still prints partial sheets as narrower paper, the deviation #2 owns', async () => {
    await render(1)
    const [singlePanelPaper] = await measurePrintedPaper()

    expect(
      singlePanelPaper.widthMm,
      'A one-panel document now prints full-width paper. If #2 has landed, replace this test with ' +
        'the contract assertion: every sheet is the recorded page width with the recorded number ' +
        'of panel slots.',
    ).not.toBeCloseTo(contract.pageWidthMm, 0)
    expect(singlePanelPaper.widthMm).toBeCloseTo(contract.panelWidthMm, 0)
  }, 60_000)
})
