import { execFileSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import puppeteer, { type Browser, type Page } from 'puppeteer'
import { createServer, type ViteDevServer } from 'vite'
import { STORAGE_KEY } from '../../src/hooks/usePersistentDocument'
import type { TodoDocument, Typography } from '../../src/domain/types'
import { readPrintContract, readPrintPanelClamp } from './contract'

const contract = readPrintContract()
const clamp = readPrintPanelClamp()

/** CSS reference pixel, fixed by the CSS specification. */
const PX_PER_INCH = 96
/** PostScript point, the unit a PDF `/MediaBox` is written in. */
const POINTS_PER_INCH = 72
const MM_PER_INCH = 25.4

/** Float slack for a measured millimetre, not a permitted geometric deviation. */
const EPSILON_MM = 0.05

/**
 * The `min-height` `src/styles/print.css` declares for a panel under `@media print`, pinned to the
 * exact figure recorded on #34. Not a tolerance and not a second contract: the recorded contract
 * says 210mm, this says what the stylesheet currently does instead, and the gap between them is the
 * open question #34 owns. Pinned rather than parsed-and-trusted so the declaration cannot move
 * without a test failing. Delete it when #34 lands.
 */
const FLOOR_RECORDED_ON_34_MM = 209

const pxToMm = (px: number): number => (px * MM_PER_INCH) / PX_PER_INCH
const pointsToMm = (points: number): number => (points * MM_PER_INCH) / POINTS_PER_INCH

/** Round to the tenth of a millimetre, so aggregate comparisons read as physical dimensions. */
const round = (mm: number): number => Math.round(mm * 10) / 10

/**
 * Document shapes worth measuring: one and two panels are partial sheets, the recorded panel count
 * is the full sheet, and one more than that produces a full sheet followed by a trailing partial.
 */
const PANEL_COUNTS = [1, 2, contract.panelsPerPage, contract.panelsPerPage + 1]

/**
 * Panel breaks, not text volume, decide the panel count here. The geometry under test is physical,
 * so nothing in this document may depend on how a font happens to render on the running machine.
 */
const panelBreakDocument = (
  panelCount: number,
  typography: Typography = 'latin',
): TodoDocument => ({
  version: 1,
  date: '2026-01-01',
  showDate: true,
  showPanelNumbers: true,
  typography,
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

interface MeasuredBox {
  widthMm: number
  heightMm: number
  offsetLeftMm: number
}

interface MeasuredSheet {
  transform: string
  widthMm: number
  heightMm: number
  panels: MeasuredBox[]
}

interface Paper {
  widthMm: number
  heightMm: number
}

interface Measurement {
  sheets: MeasuredSheet[]
  paper: Paper[]
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

/**
 * Every measurement is taken once, up front, and each test is a pure assertion over the result.
 * Browser work inside a test body would be swallowed by the `fails` markers below, which turn any
 * rejection into a pass — a navigation error or a missing `/MediaBox` would then read as the known
 * contract violation. Collecting here means such a failure aborts the whole suite instead.
 */
describe('printed page geometry', () => {
  let server: ViteDevServer
  let browser: Browser
  let page: Page

  const measured = new Map<number, Measurement>()
  let printMediaSheets: MeasuredSheet[] = []
  let sheetsAfterRestore: MeasuredSheet[] = []
  let moon: Measurement | null = null
  let moonGlyphsUnderPrintMedia = 0

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
  const measurePrintedPaper = async (): Promise<Paper[]> => {
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

  const render = async (
    appUrl: string,
    panelCount: number,
    typography: Typography = 'latin',
  ): Promise<void> => {
    await page.goto(appUrl, { waitUntil: 'networkidle0' })
    await page.evaluate(
      (key: string, document: string) => window.localStorage.setItem(key, document),
      STORAGE_KEY,
      JSON.stringify(panelBreakDocument(panelCount, typography)),
    )
    await page.reload({ waitUntil: 'networkidle0' })
    await page.waitForSelector('.print-page')
  }

  const forShape = (panelCount: number): Measurement => {
    const result = measured.get(panelCount)
    if (!result) throw new Error(`No measurement was collected for ${panelCount} panels`)
    return result
  }

  beforeAll(async () => {
    server = await createServer({ server: { port: 0 }, logLevel: 'silent' })
    await server.listen()
    const appUrl = server.resolvedUrls?.local[0]
    if (!appUrl) throw new Error('The Vite dev server reported no local URL')

    browser = await launchBrowser()
    page = await browser.newPage()
    // Wide enough that the preview renders at scale 1; expectUnscaled proves it did.
    await page.setViewport({ width: 2600, height: 1600, deviceScaleFactor: 1 })

    for (const panelCount of PANEL_COUNTS) {
      await render(appUrl, panelCount)
      measured.set(panelCount, { sheets: await measureSheets(), paper: await measurePrintedPaper() })
    }

    // `@media print` in src/styles/print.css re-declares .print-page and .print-panel, so the
    // screen measurement cannot speak for what a printer receives.
    await render(appUrl, contract.panelsPerPage)
    await page.emulateMediaType('print')
    try {
      printMediaSheets = await measureSheets()
    } finally {
      // `undefined`, not `null`: Puppeteer types the parameter as `string | undefined`.
      await page.emulateMediaType(undefined)
    }
    sheetsAfterRestore = await measureSheets()

    // The Moon typography setting replaces list content with SVG glyphs. Measuring the same
    // document shape with it on is what proves the physical contract is a property of the layout
    // rather than of the typeface the content happens to use.
    await render(appUrl, contract.panelsPerPage, 'moon')
    await page.emulateMediaType('print')
    try {
      moonGlyphsUnderPrintMedia = await page.evaluate(
        () => window.document.querySelectorAll('.print-panel .moon-word').length,
      )
    } finally {
      await page.emulateMediaType(undefined)
    }
    moon = { sheets: await measureSheets(), paper: await measurePrintedPaper() }
  }, 300_000)

  afterAll(async () => {
    await browser?.close()
    await server?.close()
  })

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

  it('states a contract whose panels tile the sheet', () => {
    expect(contract.panelsPerPage * contract.panelWidthMm).toBe(contract.pageWidthMm)
    expect(contract.panelHeightMm).toBe(contract.pageHeightMm)
  })

  it('measured every document shape', () => {
    expect([...measured.keys()].sort((a, b) => a - b)).toEqual([...PANEL_COUNTS].sort((a, b) => a - b))
    PANEL_COUNTS.forEach((panelCount) => {
      const { sheets, paper } = forShape(panelCount)
      expect(sheets).toHaveLength(Math.ceil(panelCount / contract.panelsPerPage))
      expect(paper).toHaveLength(sheets.length)
    })
    expect(printMediaSheets.length).toBeGreaterThan(0)
  })

  it('keeps the printed geometry identical when the document uses Moon typography', () => {
    const measuredMoon = moon
    if (!measuredMoon) throw new Error('No Moon-typography measurement was collected')
    const latin = forShape(contract.panelsPerPage)

    expectUnscaled(measuredMoon.sheets)
    expectSequentialPanels(measuredMoon.sheets)
    expect(measuredMoon.sheets).toEqual(latin.sheets)
    expect(measuredMoon.paper).toEqual(latin.paper)
  })

  it('keeps the Moon glyphs in the panels the printer receives', () => {
    // The print stylesheet hides the editor and the measurement layer; the glyphs are document
    // content, so they have to survive into the printed panels.
    expect(moonGlyphsUnderPrintMedia).toBeGreaterThan(0)
  })

  it('renders one sheet of sequential panels at the recorded millimetre sizes', () => {
    const { sheets } = forShape(contract.panelsPerPage)

    expectUnscaled(sheets)
    expectSequentialPanels(sheets)
    expect(sheets[0].panels).toHaveLength(contract.panelsPerPage)
    expect(sheets[0].widthMm).toBeCloseTo(contract.pageWidthMm, 1)
    expect(sheets[0].heightMm).toBeCloseTo(contract.pageHeightMm, 1)
    sheets[0].panels.forEach((panel) => {
      expect(panel.heightMm).toBeCloseTo(contract.panelHeightMm, 1)
    })
  })

  it.each(PANEL_COUNTS)('renders %i panels as sequential 99mm slots of full-height paper', (panelCount) => {
    const { sheets, paper } = forShape(panelCount)

    expectUnscaled(sheets)
    expectSequentialPanels(sheets)
    sheets.forEach((sheet) => {
      expect(sheet.heightMm).toBeCloseTo(contract.pageHeightMm, 1)
    })
    // Half a millimetre: the PDF writes points rounded to two decimals, so an exact millimetre
    // comparison would fail on the rounding rather than on the geometry.
    //
    // Every sheet's paper is pinned positively, including the partial ones the contract does not
    // sanction: its width must be its slot count times the recorded panel width. That number comes
    // from `AGENTS.md`, so this rejects any drift in a partial sheet's paper — a one-panel sheet
    // printing 50mm instead of 99mm fails here — while the separate question of whether a partial
    // sheet may exist at all stays with #2 below.
    paper.forEach((sheet, index) => {
      expect(sheet.heightMm).toBeCloseTo(contract.pageHeightMm, 0)
      expect(sheet.widthMm).toBeCloseTo(sheets[index].panels.length * contract.panelWidthMm, 0)
    })
  })

  it('prints a full sheet at the recorded physical size', () => {
    const { paper } = forShape(contract.panelsPerPage)

    expect(paper).toHaveLength(1)
    expect(paper[0].widthMm).toBeCloseTo(contract.pageWidthMm, 0)
    expect(paper[0].heightMm).toBeCloseTo(contract.pageHeightMm, 0)
  })

  it('declares the print-media panel clamp #34 recorded, and no other', () => {
    // The ceiling is contract-owned: whatever the stylesheet declares, it may not let a panel grow
    // past the paper.
    expect(clamp.maxHeightMm).toBe(contract.panelHeightMm)

    // The floor is pinned to the exact value #34 documents. This is not a permitted band — nothing
    // here tolerates a range. It is a lock: the floor disagrees with the contract by 1mm today, and
    // any movement in either direction fails, so the stylesheet cannot drift while the rendered box
    // is checked against it. Deriving the accepted floor from the same declaration would be
    // circular, passing for a panel collapsed to 1mm. When #34 lands, this value and the `fails`
    // test below collapse into one contract assertion.
    expect(clamp.minHeightMm).toBe(FLOOR_RECORDED_ON_34_MM)
    expect(clamp.minHeightMm).toBeLessThanOrEqual(clamp.maxHeightMm)
  })

  it('keeps that geometry under print media, where the stylesheet overrides it', () => {
    expectUnscaled(printMediaSheets)
    expectSequentialPanels(printMediaSheets)
    expect(printMediaSheets[0].panels).toHaveLength(contract.panelsPerPage)
    expect(printMediaSheets[0].widthMm).toBeCloseTo(contract.pageWidthMm, 1)

    // The rendered box must equal what the stylesheet declares, and the declaration itself is
    // pinned above, so together these reject both a rendering regression and a silent edit to the
    // clamp. Whether the declared floor may sit below the contract at all is #34's question.
    printMediaSheets[0].panels.forEach((panel) => {
      expect(panel.heightMm).toBeCloseTo(clamp.minHeightMm, 1)
      expect(panel.heightMm).toBeLessThanOrEqual(clamp.maxHeightMm + EPSILON_MM)
    })
    expect(printMediaSheets[0].heightMm).toBeCloseTo(clamp.minHeightMm, 1)
    expect(printMediaSheets[0].heightMm).toBeLessThanOrEqual(clamp.maxHeightMm + EPSILON_MM)
  })

  it('lifts the print emulation afterwards', () => {
    expect(sheetsAfterRestore[0].heightMm).toBeCloseTo(contract.pageHeightMm, 1)
  })

  /**
   * The contract for the printed panel height. `print.css` clamps a panel to `min-height: 209mm`
   * under `@media print`, so it renders 1mm short of the recorded 210mm while the paper stays
   * 210mm. #34 owns whether the contract or the clamp is authoritative.
   *
   * Marked `fails` because it does not hold yet. The body is one pure comparison of two parsed
   * numbers — there is no I/O to swallow, so the only thing it can report is that mismatch, and
   * vitest fails the test the moment it stops mismatching.
   */
  it.fails('clamps a printed panel to the full recorded height (blocked by #34)', () => {
    expect(clamp.minHeightMm).toBe(contract.panelHeightMm)
  })

  /**
   * The contract assertion the acceptance criterion asks for: every sheet a document produces is
   * the recorded page size with the recorded number of panel slots.
   *
   * Marked `fails` because it does not hold yet. `PrintPreview` assigns `@page page-1` and `page-2`
   * named sizes, so partial and trailing sheets print 99mm and 198mm paper — the open defect #2,
   * which #18 is scoped out of fixing (`Verification only. No change to pagination behaviour, the
   * editor, or the print stylesheet.`).
   *
   * What is written here is the contract, not the defect: nothing records 99mm or 198mm as
   * acceptable. The body is a pure comparison over measurements already collected in `beforeAll`,
   * so no browser error can be mistaken for the known violation, and it compares whole aggregates
   * rather than looping, so every shape is exercised rather than stopping at the first mismatch.
   */
  it.fails('prints every sheet at the recorded page size with the recorded panel slots (blocked by #2)', () => {
    const sheetWidths = PANEL_COUNTS.flatMap((n) => forShape(n).sheets.map((s) => round(s.widthMm)))
    const slotCounts = PANEL_COUNTS.flatMap((n) => forShape(n).sheets.map((s) => s.panels.length))
    const paperWidths = PANEL_COUNTS.flatMap((n) => forShape(n).paper.map((s) => round(s.widthMm)))

    expect(sheetWidths).toEqual(sheetWidths.map(() => contract.pageWidthMm))
    expect(slotCounts).toEqual(slotCounts.map(() => contract.panelsPerPage))
    expect(paperWidths).toEqual(paperWidths.map(() => contract.pageWidthMm))
  })
})
