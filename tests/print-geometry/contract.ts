import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * The single sentence in `AGENTS.md` that records the physical print contract. The geometry check
 * measures against these numbers instead of repeating them, so a retuned contract cannot leave a
 * passing test asserting the previous paper size.
 */
const CONTRACT_PATTERN =
  /A printed page is A4 landscape \(`(\d+(?:\.\d+)?)mm × (\d+(?:\.\d+)?)mm`\) containing ([a-z]+|\d+) sequential `(\d+(?:\.\d+)?)mm × (\d+(?:\.\d+)?)mm` panels/

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
}

export interface PrintContract {
  pageWidthMm: number
  pageHeightMm: number
  panelsPerPage: number
  panelWidthMm: number
  panelHeightMm: number
}

const AGENTS_PATH = fileURLToPath(new URL('../../AGENTS.md', import.meta.url))

const parsePanelCount = (token: string): number => {
  const asNumber = NUMBER_WORDS[token] ?? Number(token)
  if (!Number.isInteger(asNumber) || asNumber < 1) {
    throw new Error(`AGENTS.md states an unreadable panel count: "${token}"`)
  }
  return asNumber
}

/**
 * Read the recorded contract. Throws rather than falling back when the sentence no longer matches:
 * a contract that moved must be re-read by a human, not guessed at by the check that guards it.
 */
export const readPrintContract = (): PrintContract => {
  const match = CONTRACT_PATTERN.exec(readFileSync(AGENTS_PATH, 'utf8'))
  if (!match) {
    throw new Error(
      `Could not find the printed-page contract in ${AGENTS_PATH}. ` +
        'Update tests/print-geometry/contract.ts to match its current wording.',
    )
  }

  return {
    pageWidthMm: Number(match[1]),
    pageHeightMm: Number(match[2]),
    panelsPerPage: parsePanelCount(match[3]),
    panelWidthMm: Number(match[4]),
    panelHeightMm: Number(match[5]),
  }
}

/**
 * The height clamp `src/styles/print.css` puts on a panel inside `@media print`. Parsed rather than
 * repeated for the same reason the contract above is: a band written into the test would be a
 * second, test-owned statement of a physical dimension that the stylesheet can silently move away
 * from.
 */
export interface PrintPanelClamp {
  minHeightMm: number
  maxHeightMm: number
}

/**
 * The band `AGENTS.md` records for a panel under `@media print`. Read from the contract for the same
 * reason the paper size is: the allowance below the paper is a product decision (#34), so the check
 * compares the stylesheet against the recorded sentence instead of against a number a test author
 * chose.
 */
const PRINT_CLAMP_PATTERN =
  /a printed panel is clamped to `(\d+(?:\.\d+)?)mm–(\d+(?:\.\d+)?)mm` tall/

export const readRecordedPanelClamp = (): PrintPanelClamp => {
  const match = PRINT_CLAMP_PATTERN.exec(readFileSync(AGENTS_PATH, 'utf8'))
  if (!match) {
    throw new Error(
      `Could not find the printed-panel clamp in ${AGENTS_PATH}. ` +
        'Update tests/print-geometry/contract.ts to match its current wording.',
    )
  }

  return { minHeightMm: Number(match[1]), maxHeightMm: Number(match[2]) }
}

const PRINT_CSS_PATH = fileURLToPath(new URL('../../src/styles/print.css', import.meta.url))

const PRINT_PANEL_RULE_PATTERN =
  /@media print\b[\s\S]*?\.print-panel\s*\{([\s\S]*?)\}/

const declaration = (block: string, property: string): number => {
  const match = new RegExp(`${property}\\s*:\\s*(\\d+(?:\\.\\d+)?)mm`).exec(block)
  if (!match) {
    throw new Error(
      `The @media print .print-panel rule in ${PRINT_CSS_PATH} declares no ${property} in mm. ` +
        'Update tests/print-geometry/contract.ts to match its current shape.',
    )
  }
  return Number(match[1])
}

export const readPrintPanelClamp = (): PrintPanelClamp => {
  const rule = PRINT_PANEL_RULE_PATTERN.exec(readFileSync(PRINT_CSS_PATH, 'utf8'))
  if (!rule) {
    throw new Error(
      `Could not find the @media print .print-panel rule in ${PRINT_CSS_PATH}. ` +
        'Update tests/print-geometry/contract.ts to match its current shape.',
    )
  }

  return {
    minHeightMm: declaration(rule[1], 'min-height'),
    maxHeightMm: declaration(rule[1], 'max-height'),
  }
}
