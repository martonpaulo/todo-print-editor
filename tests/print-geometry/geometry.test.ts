import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Browser, type Page } from 'puppeteer'
import { createServer, type ViteDevServer } from 'vite'
import { launchBrowser, waitForPrintMedia } from './browser'
import { STORAGE_KEY } from '../../src/hooks/usePersistentDocument'
import type { TodoDocument, Typography } from '../../src/domain/types'
import { readPrintContract, readPrintPanelClamp, readRecordedPanelClamp } from './contract'

const contract = readPrintContract()
const clamp = readPrintPanelClamp()
const recordedClamp = readRecordedPanelClamp()

/** CSS reference pixel, fixed by the CSS specification. */
const PX_PER_INCH = 96
/** PostScript point, the unit a PDF `/MediaBox` is written in. */
const POINTS_PER_INCH = 72
const MM_PER_INCH = 25.4

/** Float slack for a measured millimetre, not a permitted geometric deviation. */
const EPSILON_MM = 0.05

const pxToMm = (px: number): number => (px * MM_PER_INCH) / PX_PER_INCH

/**
 * Chromium stores a used length as a LayoutUnit, a fixed-point value quantised to 1/64 px, while a
 * painted shadow spread keeps its float. Two strokes resolved from one token can therefore differ
 * by up to one quantum. Not a permitted design tolerance: 1/64 px is ~0.004mm, four times finer
 * than a 600dpi printer dot, so anything within it prints as the same weight and anything beyond it
 * is a real divergence.
 */
const LAYOUT_UNIT_MM = pxToMm(1 / 64)
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
const MOON_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

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

const moonGeometryDocument: TodoDocument = {
  version: 1,
  date: '2026-01-01',
  showDate: false,
  showPanelNumbers: false,
  typography: 'moon',
  blocks: [
    {
      kind: 'list',
      id: 'list-moon-geometry',
      title: MOON_ALPHABET,
      items: [
        {
          id: 'item-moon-rhythm',
          text: 'CASA ACADEMIA ROTINA GINASIO CASA ACADEMIA ROTINA GINASIO',
          checked: false,
        },
      ],
    },
  ],
}

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

interface MoonGeometry {
  glyphBounds: Array<{
    letter: string
    minX: number
    minY: number
    maxX: number
    maxY: number
    advance: number
    bandHeight: number
  }>
  titleLineHeightRatio: number
  taskLineHeightRatio: number
  taskLineCount: number
  wordSpacingPx: number
}

/**
 * The used width of each stroke `--print-stroke-width` owns, in millimetres: the divider box, the
 * list rule and the checkbox frame. Equality here is the printed weight, and it does not follow
 * from the shared token alone — a `border` resolves the same declaration to a different used width
 * than painted ink does, which is how these three came to print at three weights (#32).
 */
interface StrokeWidths {
  dividerMm: number
  ruleMm: number
  checkboxMm: number
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
  let moonGeometry: MoonGeometry | null = null
  let strokes: StrokeWidths | null = null

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

  /**
   * The three strokes the print tokens declare as one weight, read as used widths rather than as
   * declarations: the divider is a pseudo-element, the list rule a filled block, and the checkbox a
   * border, so nothing but the resolved width compares them.
   */
  const measureStrokes = async (): Promise<StrokeWidths> =>
    page
      .evaluate(() => {
        const panel = window.document.querySelector(
          '.preview-stage .print-page > .print-panel:not(:last-child)',
        )
        const rule = window.document.querySelector('.preview-stage .print-list__rule')
        const checkbox = window.document.querySelector('.preview-stage .print-checkbox')
        if (!panel || !rule || !checkbox) {
          throw new Error('The stroke document rendered no divider, rule or checkbox')
        }

        return {
          dividerPx: Number.parseFloat(window.getComputedStyle(panel, '::after').width),
          rulePx: Number.parseFloat(window.getComputedStyle(rule).height),
          // `inset 0 0 0 <spread>`: the fourth length is the frame's width.
          checkboxPx: Number.parseFloat(
            window.getComputedStyle(checkbox).boxShadow.match(/(-?[\d.]+)px/g)?.[3] ?? 'NaN',
          ),
        }
      })
      .then(({ dividerPx, rulePx, checkboxPx }) => ({
        dividerMm: pxToMm(dividerPx),
        ruleMm: pxToMm(rulePx),
        checkboxMm: pxToMm(checkboxPx),
      }))

  const measureMoonGeometry = async (): Promise<MoonGeometry> =>
    page.evaluate((alphabet: string) => {
      const title = window.document.querySelector('.preview-stage .print-list__title .moon-text')
      const task = window.document.querySelector('.preview-stage .print-task__text--moon .moon-text')
      if (!title || !task) throw new Error('The Moon geometry document did not render its text')

      const groups = [...title.querySelectorAll<SVGGElement>('.moon-word g')]
      if (groups.length !== alphabet.length) {
        throw new Error(`Expected ${alphabet.length} Moon glyphs, rendered ${groups.length}`)
      }

      const glyphBounds = groups.map((group, index) => {
        const svg = group.closest('svg')
        if (!svg) throw new Error('A Moon glyph group has no SVG viewport')
        const groupCount = svg.querySelectorAll(':scope > g').length
        const advance = svg.viewBox.baseVal.width / groupCount
        const box = group.getBBox()
        const strokePadding = Math.max(
          0,
          ...[...group.querySelectorAll('path')].map((path) =>
            path.getAttribute('stroke') === 'none'
              ? 0
              : Number.parseFloat(path.getAttribute('stroke-width') ?? '0') / 2,
          ),
        )

        return {
          letter: alphabet[index],
          minX: box.x - strokePadding,
          minY: box.y - strokePadding,
          maxX: box.x + box.width + strokePadding,
          maxY: box.y + box.height + strokePadding,
          advance,
          bandHeight: svg.viewBox.baseVal.height,
        }
      })

      const lineHeightRatio = (element: Element): number => {
        const style = window.getComputedStyle(element)
        return Number.parseFloat(style.lineHeight) / Number.parseFloat(style.fontSize)
      }
      const taskStyle = window.getComputedStyle(task)
      const taskLineHeight = Number.parseFloat(taskStyle.lineHeight)
      const glyphStyle = window.getComputedStyle(task.querySelector('.moon-text__glyphs') ?? task)

      return {
        glyphBounds,
        titleLineHeightRatio: lineHeightRatio(title),
        taskLineHeightRatio: lineHeightRatio(task),
        taskLineCount: Math.round(task.getBoundingClientRect().height / taskLineHeight),
        wordSpacingPx:
          glyphStyle.wordSpacing === 'normal' ? 0 : Number.parseFloat(glyphStyle.wordSpacing),
      }
    }, MOON_ALPHABET)

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
      await waitForPrintMedia(page)

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
      await waitForPrintMedia(page)

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

    await renderDocument(appUrl, moonGeometryDocument)
    moonGeometry = await measureMoonGeometry()

    // A full sheet is the only shape that carries all three strokes at once: a partial sheet drops
    // the divider beside its fillers.
    await render(appUrl, contract.panelsPerPage)
    strokes = await measureStrokes()
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

  it('draws the panel divider, the list rule and the checkbox frame at one weight', () => {
    const measuredStrokes = strokes
    if (!measuredStrokes) throw new Error('No stroke widths were collected')

    expect(measuredStrokes.dividerMm).toBeGreaterThan(0)
    expect(Math.abs(measuredStrokes.ruleMm - measuredStrokes.dividerMm)).toBeLessThanOrEqual(
      LAYOUT_UNIT_MM,
    )
    expect(Math.abs(measuredStrokes.checkboxMm - measuredStrokes.dividerMm)).toBeLessThanOrEqual(
      LAYOUT_UNIT_MM,
    )
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

  it('keeps every Moon glyph inside its fixed SVG cell', () => {
    const geometry = moonGeometry
    if (!geometry) throw new Error('No Moon glyph geometry was collected')

    expect(geometry.glyphBounds).toHaveLength(MOON_ALPHABET.length)
    geometry.glyphBounds.forEach((bounds) => {
      expect(Number.isFinite(bounds.minX), `${bounds.letter} has a finite left bound`).toBe(true)
      expect(Number.isFinite(bounds.minY), `${bounds.letter} has a finite top bound`).toBe(true)
      expect(bounds.minX, `${bounds.letter} stays inside the left cell edge`).toBeGreaterThanOrEqual(
        0,
      )
      expect(bounds.minY, `${bounds.letter} stays inside the top band edge`).toBeGreaterThanOrEqual(
        0,
      )
      expect(bounds.maxX, `${bounds.letter} stays inside the right cell edge`).toBeLessThanOrEqual(
        bounds.advance,
      )
      expect(bounds.maxY, `${bounds.letter} stays inside the bottom band edge`).toBeLessThanOrEqual(
        bounds.bandHeight,
      )
    })
  })

  it('uses one Moon line-height and an explicit word gap in titles and tasks', () => {
    const geometry = moonGeometry
    if (!geometry) throw new Error('No Moon text rhythm was collected')

    expect(geometry.titleLineHeightRatio).toBeCloseTo(1.24, 1)
    expect(geometry.taskLineHeightRatio).toBeCloseTo(1.24, 1)
    expect(geometry.titleLineHeightRatio).toBeCloseTo(geometry.taskLineHeightRatio, 2)
    expect(geometry.taskLineCount).toBeGreaterThan(1)
    expect(geometry.wordSpacingPx).toBeGreaterThan(0)
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

  it('declares exactly the print-media panel clamp the contract records', () => {
    // Both ends come from `AGENTS.md`, so neither is a number this file chose. The ceiling is the
    // paper; the floor is the whole-pixel allowance #34 settled, below the paper on purpose because
    // Chromium fragments the sheet at 793px and a panel declared at the full height resolves above
    // that. Deriving the accepted floor from the stylesheet itself would be circular — it would
    // pass for a panel collapsed to 1mm — so the recorded sentence is the reference on both sides.
    expect(clamp.maxHeightMm).toBe(recordedClamp.maxHeightMm)
    expect(clamp.minHeightMm).toBe(recordedClamp.minHeightMm)
    expect(recordedClamp.maxHeightMm).toBe(contract.panelHeightMm)
    expect(recordedClamp.minHeightMm).toBeLessThan(recordedClamp.maxHeightMm)
  })

  it('keeps that geometry under print media, where the stylesheet overrides it', () => {
    expectUnscaled(printMediaSheets)
    expectSequentialPanels(printMediaSheets)
    expect(printMediaSheets[0].panels).toHaveLength(contract.panelsPerPage)
    expect(printMediaSheets[0].widthMm).toBeCloseTo(contract.pageWidthMm, 1)

    // The rendered box must sit inside the recorded band and equal what the stylesheet declares, so
    // together these reject a rendering regression, a silent edit to the clamp, and a band that
    // drifted away from the contract. The paper is unaffected either way: it stays the recorded
    // page height above, and the sheet-count assertions are what prove the allowance still keeps a
    // document off a second sheet.
    printMediaSheets[0].panels.forEach((panel) => {
      expect(panel.heightMm).toBeCloseTo(clamp.minHeightMm, 1)
      expect(panel.heightMm).toBeGreaterThanOrEqual(recordedClamp.minHeightMm - EPSILON_MM)
      expect(panel.heightMm).toBeLessThanOrEqual(recordedClamp.maxHeightMm + EPSILON_MM)
    })
    expect(printMediaSheets[0].heightMm).toBeCloseTo(clamp.minHeightMm, 1)
    expect(printMediaSheets[0].heightMm).toBeGreaterThanOrEqual(recordedClamp.minHeightMm - EPSILON_MM)
    expect(printMediaSheets[0].heightMm).toBeLessThanOrEqual(recordedClamp.maxHeightMm + EPSILON_MM)
  })

  it('lifts the print emulation afterwards', () => {
    expect(sheetsAfterRestore[0].heightMm).toBeCloseTo(contract.pageHeightMm, 1)
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
