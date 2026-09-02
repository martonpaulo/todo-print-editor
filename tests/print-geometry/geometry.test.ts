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
 * Document shapes worth measuring: one and two panels leave trailing filler slots, the recorded
 * panel count fills a sheet exactly, and one more than that produces a full sheet followed by a
 * sheet that is filler for all but its first slot.
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

/**
 * A single alphabetic run far wider than the 99 mm panel. Each Moon chunk is an atomic inline box, so
 * if the run were emitted as one element nothing could wrap it: it would extend past the panel, and
 * `overflow: visible` on `.print-panel` would paint it across the divider into the next one.
 */
const LONG_RUN = 'Supercalifragilistic'.repeat(10)

const checkedTaskDocument = (typography: Typography): TodoDocument => ({
  version: 1,
  date: '2026-01-01',
  showDate: false,
  showPanelNumbers: false,
  typography,
  blocks: [
    {
      kind: 'list',
      id: 'list-checked',
      title: 'Done',
      items: [{ id: 'item-checked', text: 'Buy milk today', checked: true }],
    },
  ],
})

const longRunDocument = (typography: Typography): TodoDocument => ({
  version: 1,
  date: '2026-01-01',
  showDate: false,
  showPanelNumbers: false,
  typography,
  blocks: [
    {
      kind: 'list',
      id: 'list-long',
      title: LONG_RUN,
      items: [{ id: 'item-long', text: LONG_RUN, checked: false }],
    },
  ],
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
  let longRunMoon = { overflowMm: 0, listHeightMm: 0 }
  let longRunLatin = { overflowMm: 0, listHeightMm: 0 }
  let latinStrike = { decoration: '', paintedMm: 0 }
  let moonStrike = { decoration: '', paintedMm: 0 }

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

  /**
   * How far the widest rendered content box reaches past its panel's content edge, in millimetres,
   * and how tall the list ended up. A wrapped run stays inside and grows downwards; an unbreakable
   * one escapes sideways while staying one line tall.
   */
  const measureLongRun = async (): Promise<{ overflowMm: number; listHeightMm: number }> =>
    page.evaluate(() => {
      // Scoped to the preview: `.measurement-layer` holds a second copy of every panel and list,
      // parked at `left: -200vw`, whose rects say nothing about what the sheet will look like.
      const panel = window.document.querySelector('.preview-stage .print-panel')
      const list = window.document.querySelector('.preview-stage .print-list')
      if (!panel || !list) throw new Error('The long-run document rendered no panel')

      const style = window.getComputedStyle(panel)
      const contentRight =
        panel.getBoundingClientRect().right - Number.parseFloat(style.paddingRight)
      const boxes = [...panel.querySelectorAll('.moon-word, .print-list__title, .print-task__text')]
      const worstRight = boxes.reduce(
        (worst, box) => Math.max(worst, box.getBoundingClientRect().right),
        0,
      )

      return {
        overflowPx: worstRight - contentRight,
        listHeightPx: list.getBoundingClientRect().height,
      }
    }).then(({ overflowPx, listHeightPx }) => ({
      overflowMm: pxToMm(overflowPx),
      listHeightMm: pxToMm(listHeightPx),
    }))

  const renderDocument = async (appUrl: string, document: TodoDocument): Promise<void> => {
    await page.goto(appUrl, { waitUntil: 'networkidle0' })
    await page.evaluate(
      (key: string, value: string) => window.localStorage.setItem(key, value),
      STORAGE_KEY,
      JSON.stringify(document),
    )
    await page.reload({ waitUntil: 'networkidle0' })
    await page.waitForSelector('.print-page')
  }

  /**
   * How a completed task is struck through: the text decoration the stylesheet applies, and the
   * height of any background the strike is painted with instead. A decoration is not propagated into
   * atomic inline boxes, so in Moon mode the first is inert and only the second reaches the words.
   */
  const measureStrike = async (): Promise<{ decoration: string; paintedMm: number }> =>
    page
      .evaluate(() => {
        const text = window.document.querySelector('.preview-stage .print-task__text--checked')
        if (!text) throw new Error('The checked-task document rendered no completed task')
        const painted = text.querySelector('.moon-text__glyphs') ?? text

        const textStyle = window.getComputedStyle(text)
        const paintedStyle = window.getComputedStyle(painted)
        const [, height = '0px'] = paintedStyle.backgroundSize.split(' ')

        return {
          decoration: textStyle.textDecorationLine,
          paintedPx: paintedStyle.backgroundImage === 'none' ? 0 : Number.parseFloat(height),
        }
      })
      .then(({ decoration, paintedPx }) => ({ decoration, paintedMm: pxToMm(paintedPx) }))

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

    await renderDocument(appUrl, longRunDocument('latin'))
    longRunLatin = await measureLongRun()
    await renderDocument(appUrl, longRunDocument('moon'))
    longRunMoon = await measureLongRun()

    await renderDocument(appUrl, checkedTaskDocument('latin'))
    latinStrike = await measureStrike()
    await renderDocument(appUrl, checkedTaskDocument('moon'))
    moonStrike = await measureStrike()
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

  it('wraps an alphabetic run wider than the panel instead of letting it escape', () => {
    // Latin is the reference: `overflow-wrap: anywhere` already keeps it inside the content box.
    expect(longRunLatin.overflowMm).toBeLessThanOrEqual(0.1)
    expect(longRunMoon.overflowMm).toBeLessThanOrEqual(0.1)
  })

  it('turns that run into height pagination can see', () => {
    // The panel is 99mm wide and the run is far longer, so a wrapped list must be many lines tall.
    // An unbreakable run would stay one line tall and print without ever tripping the overflow guard.
    expect(longRunMoon.listHeightMm).toBeGreaterThan(longRunLatin.listHeightMm / 2)
    expect(longRunMoon.listHeightMm).toBeGreaterThan(20)
  })

  it('strikes a completed task through in both typographies', () => {
    // Latin relies on the text decoration, which is all it needs.
    expect(latinStrike.decoration).toBe('line-through')

    // Moon cannot: CSS text decorations do not decorate atomic inline boxes, and every Moon word is
    // one (https://www.w3.org/TR/css-text-decor-3/#line-decoration), so a `line-through` here would
    // strike the spaces between the words and skip the words themselves. The strike has to be
    // painted, and this asserts that something paints it.
    expect(moonStrike.paintedMm).toBeGreaterThan(0)
    expect(moonStrike.decoration).toBe('none')
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

  it.each(PANEL_COUNTS)('renders %i panels as sequential slots of full-height paper', (panelCount) => {
    const { sheets, paper } = forShape(panelCount)

    expectUnscaled(sheets)
    expectSequentialPanels(sheets)
    sheets.forEach((sheet) => {
      expect(sheet.heightMm).toBeCloseTo(contract.pageHeightMm, 1)
    })
    // Half a millimetre: the PDF writes points rounded to two decimals, so an exact millimetre
    // comparison would fail on the rounding rather than on the geometry.
    //
    // Every sheet's paper is pinned to its slot count times the recorded panel width, a number that
    // comes from `AGENTS.md`. Since #2 every sheet carries the full slot count, so this is the
    // recorded page width for all of them; the aggregate check below states that directly.
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
   * the recorded page size with the recorded number of panel slots, trailing slots being blank
   * fillers rather than a narrower sheet. Enforcing since #2 removed the `@page page-1` and
   * `page-2` named sizes that made partial sheets print 99mm and 198mm paper.
   *
   * The body is a pure comparison over measurements already collected in `beforeAll`, so no browser
   * error can be reported as a geometry result, and it compares whole aggregates rather than
   * looping, so every shape is exercised rather than stopping at the first mismatch.
   */
  it('prints every sheet at the recorded page size with the recorded panel slots', () => {
    const shapes = PANEL_COUNTS.map((n) => forShape(n))
    const sheetWidths = shapes.flatMap((m) => m.sheets.map((s) => round(s.widthMm)))
    const slotCounts = shapes.flatMap((m) => m.sheets.map((s) => s.panels.length))
    const paperWidths = shapes.flatMap((m) => m.paper.map((s) => round(s.widthMm)))

    expect(sheetWidths).toEqual(sheetWidths.map(() => contract.pageWidthMm))
    expect(slotCounts).toEqual(slotCounts.map(() => contract.panelsPerPage))
    expect(paperWidths).toEqual(paperWidths.map(() => contract.pageWidthMm))
  })
})
