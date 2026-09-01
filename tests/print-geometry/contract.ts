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
