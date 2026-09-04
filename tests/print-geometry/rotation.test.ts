import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Browser, type Page } from 'puppeteer'
import { createServer, type ViteDevServer } from 'vite'
import { launchBrowser, waitForPrintMedia } from './browser'
import { STORAGE_KEY } from '../../src/hooks/usePersistentDocument'
import type { TodoDocument } from '../../src/domain/types'
import { readPrintContract, readRecordedPanelClamp } from './contract'

/**
 * The opt-in print rotation (#54) turns the finished sheet onto portrait paper for printers that
 * rotate landscape media on their own. Nothing about the document changes, so what has to be proven
 * is physical: the paper turns, the panels inside it keep the recorded millimetre sizes, and the
 * same document still prints on one sheet. What cannot be proven here is the reason the setting
 * exists — the driver behaviour it works around is not reproducible in Chromium, and only the
 * owner's own printer can confirm the misprint is gone.
 */
const contract = readPrintContract()
const recordedClamp = readRecordedPanelClamp()

const PX_PER_INCH = 96
const POINTS_PER_INCH = 72
const MM_PER_INCH = 25.4

/** Float slack for a measured millimetre, not a permitted geometric deviation. */
const EPSILON_MM = 0.05

const pxToMm = (px: number): number => (px * MM_PER_INCH) / PX_PER_INCH
const pointsToMm = (points: number): number => (points * MM_PER_INCH) / POINTS_PER_INCH

/** One full sheet: the shape whose slots are all real panels, so nothing is a blank filler. */
const document = (rotatePrint: boolean): TodoDocument => ({
  version: 1,
  date: '2026-01-01',
  showDate: true,
  showPanelNumbers: true,
  typography: 'latin',
  rotatePrint,
  blocks: Array.from({ length: contract.panelsPerPage }, (_, index) => index).flatMap((index) => [
    ...(index === 0 ? [] : ([{ kind: 'panel-break', id: `break-${index}` }] as const)),
    {
      kind: 'list',
      id: `list-${index + 1}`,
      title: `Panel ${index + 1}`,
      items: [{ id: `item-${index + 1}`, text: 'A task', checked: false }],
    } as const,
  ]),
})

interface Paper {
  widthMm: number
  heightMm: number
}

interface PrintedSheet {
  /** The 2×2 part of the sheet's transform matrix, which is where a quarter turn shows up. */
  matrix: { a: number; b: number; c: number; d: number }
  /** The axis-aligned box the turned sheet paints into. */
  paintedWidthMm: number
  paintedHeightMm: number
  /** Each panel's own layout box, which a transform on an ancestor does not touch. */
  panels: Array<{ widthMm: number; heightMm: number }>
  toolbarDisplay: string
}

describe('rotated print geometry', () => {
  let server: ViteDevServer
  let browser: Browser
  let page: Page

  let rotatedPaper: Paper[] = []
  let unrotatedPaper: Paper[] = []
  let rotatedSheet: PrintedSheet | null = null
  let previewBoxes: { shell: { widthPx: number; heightPx: number }; sheet: { widthPx: number; heightPx: number } } | null =
    null

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

  const measureSheet = async (): Promise<PrintedSheet> => {
    const raw = await page.evaluate(() => {
      const sheet = window.document.querySelector('.print-page')
      const toolbar = window.document.querySelector('.document-toolbar')
      if (!(sheet instanceof HTMLElement)) throw new Error('The rotated document rendered no sheet')
      if (!(toolbar instanceof HTMLElement)) throw new Error('The editor rendered no toolbar')

      const matrix = new DOMMatrixReadOnly(window.getComputedStyle(sheet).transform)
      const painted = sheet.getBoundingClientRect()

      return {
        matrix: { a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d },
        paintedWidth: painted.width,
        paintedHeight: painted.height,
        panels: [...sheet.querySelectorAll<HTMLElement>('.print-panel')].map((panel) => ({
          width: panel.offsetWidth,
          height: panel.offsetHeight,
        })),
        toolbarDisplay: window.getComputedStyle(toolbar).display,
      }
    })

    return {
      matrix: raw.matrix,
      paintedWidthMm: pxToMm(raw.paintedWidth),
      paintedHeightMm: pxToMm(raw.paintedHeight),
      panels: raw.panels.map((panel) => ({
        widthMm: pxToMm(panel.width),
        heightMm: pxToMm(panel.height),
      })),
      toolbarDisplay: raw.toolbarDisplay,
    }
  }

  /**
   * The on-screen preview, which shows the paper the print dialog will produce. The shell is the
   * space the sheet occupies in the flow; the sheet keeps its landscape box and is turned into that
   * space by a transform, so the two boxes must agree for the preview to be honest about the
   * rotation.
   */
  const measurePreview = async () =>
    page.evaluate(() => {
      const shell = window.document.querySelector('.preview-page-shell')
      const sheet = window.document.querySelector('.print-page')
      if (!(shell instanceof HTMLElement)) throw new Error('The preview rendered no sheet shell')
      if (!(sheet instanceof HTMLElement)) throw new Error('The preview rendered no sheet')

      const shellBox = shell.getBoundingClientRect()
      const sheetBox = sheet.getBoundingClientRect()
      return {
        shell: { widthPx: shellBox.width, heightPx: shellBox.height },
        sheet: { widthPx: sheetBox.width, heightPx: sheetBox.height },
      }
    })

  const render = async (appUrl: string, rotatePrint: boolean): Promise<void> => {
    await page.goto(appUrl, { waitUntil: 'networkidle0' })
    await page.evaluate(
      (key: string, value: string) => window.localStorage.setItem(key, value),
      STORAGE_KEY,
      JSON.stringify(document(rotatePrint)),
    )
    await page.reload({ waitUntil: 'networkidle0' })
    await page.waitForSelector('.print-page')
  }

  beforeAll(async () => {
    server = await createServer({ server: { port: 0 }, logLevel: 'silent' })
    await server.listen()
    const appUrl = server.resolvedUrls?.local[0]
    if (!appUrl) throw new Error('The Vite dev server reported no local URL')

    browser = await launchBrowser()
    page = await browser.newPage()
    await page.setViewport({ width: 2600, height: 1600, deviceScaleFactor: 1 })

    // The control: the same document with the setting off, measured in the same session, so the
    // comparison below is between two settings rather than between two test runs.
    await render(appUrl, false)
    unrotatedPaper = await measurePrintedPaper()

    await render(appUrl, true)
    previewBoxes = await measurePreview()
    rotatedPaper = await measurePrintedPaper()
    await page.emulateMediaType('print')
    try {
      await waitForPrintMedia(page)

      rotatedSheet = await measureSheet()
    } finally {
      // `undefined`, not `null`: Puppeteer types the parameter as `string | undefined`.
      await page.emulateMediaType(undefined)
    }
  }, 300_000)

  afterAll(async () => {
    await browser?.close()
    await server?.close()
  })

  it('prints the rotated document on one sheet of portrait paper', () => {
    // Half a millimetre of slack: the PDF writes points rounded to two decimals.
    expect(rotatedPaper).toHaveLength(1)
    expect(rotatedPaper[0].widthMm).toBeCloseTo(contract.pageHeightMm, 0)
    expect(rotatedPaper[0].heightMm).toBeCloseTo(contract.pageWidthMm, 0)
  })

  it('leaves the landscape sheet exactly as it was when the setting is off', () => {
    expect(unrotatedPaper).toHaveLength(1)
    expect(unrotatedPaper[0].widthMm).toBeCloseTo(contract.pageWidthMm, 0)
    expect(unrotatedPaper[0].heightMm).toBeCloseTo(contract.pageHeightMm, 0)
  })

  it('turns the sheet a quarter turn rather than laying the panels out differently', () => {
    const sheet = rotatedSheet
    if (!sheet) throw new Error('No rotated sheet was measured')

    // rotate(90deg) is matrix(0, 1, -1, 0): the x axis maps onto the y axis.
    expect(sheet.matrix.a).toBeCloseTo(0, 3)
    expect(sheet.matrix.b).toBeCloseTo(1, 3)
    expect(sheet.matrix.c).toBeCloseTo(-1, 3)
    expect(sheet.matrix.d).toBeCloseTo(0, 3)
  })

  it('keeps every panel at the recorded millimetre size inside the turned sheet', () => {
    const sheet = rotatedSheet
    if (!sheet) throw new Error('No rotated sheet was measured')

    expect(sheet.panels).toHaveLength(contract.panelsPerPage)
    sheet.panels.forEach((panel) => {
      expect(panel.widthMm).toBeCloseTo(contract.panelWidthMm, 1)
      expect(panel.heightMm).toBeGreaterThanOrEqual(recordedClamp.minHeightMm - EPSILON_MM)
      expect(panel.heightMm).toBeLessThanOrEqual(recordedClamp.maxHeightMm + EPSILON_MM)
    })
  })

  it('paints the turned sheet inside the portrait paper', () => {
    const sheet = rotatedSheet
    if (!sheet) throw new Error('No rotated sheet was measured')

    // Turned, the sheet's height becomes its printed width and its width its printed height, so
    // what has to fit across the portrait paper is the panel clamp rather than the full 210mm.
    expect(sheet.paintedWidthMm).toBeLessThanOrEqual(contract.pageHeightMm + EPSILON_MM)
    expect(sheet.paintedHeightMm).toBeCloseTo(contract.pageWidthMm, 1)
  })

  /**
   * Acceptance criterion 3 asks that the preview reflect the configured state. Whether it *looks*
   * right is the human check the issue records; this is the part a machine can settle — the drawn
   * sheet is turned, and the space it reserves in the preview flow is turned with it.
   */
  it('previews the turned sheet on screen, in the space it reserves', () => {
    const boxes = previewBoxes
    if (!boxes) throw new Error('No preview boxes were measured')

    expect(boxes.sheet.heightPx).toBeGreaterThan(boxes.sheet.widthPx)
    // Sub-pixel slack: both boxes come from the engine's own layout and transform arithmetic.
    expect(boxes.shell.widthPx).toBeCloseTo(boxes.sheet.widthPx, 0)
    expect(boxes.shell.heightPx).toBeCloseTo(boxes.sheet.heightPx, 0)
  })

  it('keeps the editor controls off the rotated paper', () => {
    const sheet = rotatedSheet
    if (!sheet) throw new Error('No rotated sheet was measured')

    expect(sheet.toolbarDisplay).toBe('none')
  })
})
