/**
 * Moon type: the geometric reading alphabet William Moon published in 1845. Grade 1 maps one Moon
 * character to one Latin letter, and every letter is a rotation or reflection of a small set of
 * primitives — straight line, oblique line, acute or right angle, semicircle, circle, zig-zag.
 *
 * The outlines below are authored here rather than vendored from a font. The 1845 alphabet itself is
 * long out of copyright, but no maintained Moon web font carries a licence clear enough to
 * redistribute, and a binary face cannot be reviewed in a diff. Authoring the paths keeps the asset
 * under this project's own licence, adds no dependency, and prints at exact geometry at any size.
 *
 * Each glyph records the published shape description it was drawn from, so a fidelity correction is
 * a one-line edit against a citable source:
 * https://en.wikipedia.org/wiki/Moon_type and https://fakoo.de/en/moon.html
 */

/**
 * Glyphs are drawn in a band 100 units tall whose bottom edge is the text baseline, so a rendered
 * word sits on the surrounding line box without a vertical offset. Horizontal units share the same
 * scale, which is why `advance` is comparable to `MOON_BAND_HEIGHT`.
 */
export const MOON_BAND_HEIGHT = 100

/** Stroke width of every drawn glyph. Moon type is deliberately bold. */
export const MOON_STROKE_WIDTH = 9

// The drawing frame. Insets leave room for the stroke's round caps on all four sides.
const TOP = 16
const BOTTOM = 84
const MIDDLE = (TOP + BOTTOM) / 2
const LEFT = 8
const RIGHT = 56
const CENTER = (LEFT + RIGHT) / 2

/** Trailing side bearing: the advance is the drawing frame plus one gap between letters. */
const LETTER_ADVANCE = RIGHT + 18
const RADIUS = (BOTTOM - TOP) / 2
/** Radius of the semicircles that open up or down, bounded by the frame's width rather than its height. */
const WIDE_RADIUS = (RIGHT - LEFT) / 2

/** Arc between two points on a vertical line, bulging left (`sweep` 0) or right (`sweep` 1). */
const verticalArc = (x: number, fromY: number, toY: number, sweep: 0 | 1): string => {
  const radius = Math.abs(toY - fromY) / 2
  return `M${x},${fromY}A${radius},${radius} 0 0 ${sweep} ${x},${toY}`
}

/** Arc between two points on a horizontal line, bulging up (`sweep` 1) or down (`sweep` 0). */
const horizontalArc = (y: number, fromX: number, toX: number, sweep: 0 | 1): string => {
  const radius = Math.abs(toX - fromX) / 2
  return `M${fromX},${y}A${radius},${radius} 0 0 ${sweep} ${toX},${y}`
}

export interface MoonStroke {
  /** SVG path data in the 100-unit band described above. */
  d: string
  /** Filled rather than stroked. Only the letter H uses this. */
  filled?: boolean
}

export interface MoonGlyph {
  /** The Latin letter this glyph stands for, kept for tests and debugging. */
  letter: string
  /** Horizontal space the glyph occupies, in band units. */
  advance: number
  strokes: MoonStroke[]
}

const glyph = (letter: string, d: string | MoonStroke[], advance = LETTER_ADVANCE): MoonGlyph => ({
  letter,
  advance,
  strokes: typeof d === 'string' ? [{ d }] : d,
})

// The small circle of H, and its filled half. "Half filled" is the one description that does not
// determine the drawing: which half is solid is not stated, so the left half is filled and recorded
// here as an assumption rather than a reading of the source.
const H_RADIUS = (BOTTOM - MIDDLE) / 1.6
const H_CENTER_X = CENTER
const H_CENTER_Y = MIDDLE
const circlePath = (cx: number, cy: number, r: number): string =>
  `M${cx},${cy - r}A${r},${r} 0 1 1 ${cx},${cy + r}A${r},${r} 0 1 1 ${cx},${cy - r}Z`

/**
 * Grade 1, one glyph per Latin letter. Moon is caseless, so lookup upper-cases first.
 */
const MOON_ALPHABET: Record<string, MoonGlyph> = {
  // "two straight lines form an open angle" — the downward-opening angle, distinct from V.
  A: glyph('A', `M${LEFT},${BOTTOM}L${CENTER},${TOP}L${RIGHT},${BOTTOM}`),
  // "vertical straight line followed by a bow below right"
  B: glyph('B', [
    { d: `M${LEFT},${TOP}L${LEFT},${BOTTOM}` },
    { d: verticalArc(LEFT, MIDDLE, BOTTOM, 1) },
  ]),
  // "semicircle, opening on the right"
  C: glyph('C', verticalArc(RIGHT, TOP, BOTTOM, 0)),
  // "semicircle, opening on the left"
  D: glyph('D', verticalArc(LEFT, TOP, BOTTOM, 1)),
  // "vertical and horizontal straight lines form an angle open to the bottom right"
  E: glyph('E', `M${RIGHT},${TOP}L${LEFT},${TOP}L${LEFT},${BOTTOM}`),
  // "vertical straight line followed by a bow on the top right (walking stick)"
  F: glyph('F', [
    { d: `M${LEFT},${TOP}L${LEFT},${BOTTOM}` },
    { d: verticalArc(LEFT, TOP, MIDDLE, 1) },
  ]),
  // "vertical straight line followed by a bow at the top left"
  G: glyph('G', [
    { d: `M${RIGHT},${TOP}L${RIGHT},${BOTTOM}` },
    { d: verticalArc(RIGHT, TOP, MIDDLE, 0) },
  ]),
  // "small full circle, half filled"
  H: glyph('H', [
    { d: circlePath(H_CENTER_X, H_CENTER_Y, H_RADIUS) },
    {
      d:
        `M${H_CENTER_X},${H_CENTER_Y - H_RADIUS}` +
        `A${H_RADIUS},${H_RADIUS} 0 0 0 ${H_CENTER_X},${H_CENTER_Y + H_RADIUS}Z`,
      filled: true,
    },
  ]),
  // "a vertical straight line"
  I: glyph('I', `M${CENTER},${TOP}L${CENTER},${BOTTOM}`),
  // "vertical straight line followed by a curve at the bottom left"
  J: glyph('J', [
    { d: `M${RIGHT},${TOP}L${RIGHT},${BOTTOM}` },
    { d: verticalArc(RIGHT, MIDDLE, BOTTOM, 0) },
  ]),
  // "two straight lines form an angle open to the right"
  K: glyph('K', `M${RIGHT},${TOP}L${LEFT},${MIDDLE}L${RIGHT},${BOTTOM}`),
  // "vertical and horizontal lines form an angle open to the right", the remaining corner once E, M
  // and Y have taken the other three quadrants.
  L: glyph('L', `M${LEFT},${TOP}L${LEFT},${BOTTOM}L${RIGHT},${BOTTOM}`),
  // "vertical and horizontal lines form an angle open to the left below"
  M: glyph('M', `M${LEFT},${TOP}L${RIGHT},${TOP}L${RIGHT},${BOTTOM}`),
  // "vertical zig-zag line starting at the bottom left and ending at the top right"
  N: glyph('N', `M${LEFT},${BOTTOM}L${LEFT},${TOP}L${RIGHT},${BOTTOM}L${RIGHT},${TOP}`),
  // "full circle"
  O: glyph('O', circlePath(CENTER, MIDDLE, RADIUS)),
  // "horizontal straight line with a small acute angle upwards at the left end"
  P: glyph('P', `M${LEFT + RADIUS},${TOP}L${LEFT},${BOTTOM}L${RIGHT},${BOTTOM}`),
  // "horizontal straight line with a small acute angle upwards at the right end"
  Q: glyph('Q', `M${LEFT},${BOTTOM}L${RIGHT},${BOTTOM}L${RIGHT - RADIUS},${TOP}`),
  // "oblique line from top left to bottom right"
  R: glyph('R', `M${LEFT},${TOP}L${RIGHT},${BOTTOM}`),
  // "oblique line from bottom left to top right"
  S: glyph('S', `M${LEFT},${BOTTOM}L${RIGHT},${TOP}`),
  // "a horizontal straight line"
  T: glyph('T', `M${LEFT},${MIDDLE}L${RIGHT},${MIDDLE}`),
  // "semicircle, opening at the top"
  U: glyph('U', horizontalArc(MIDDLE - WIDE_RADIUS / 2, LEFT, RIGHT, 0)),
  // "two straight lines form an upwardly open angle"
  V: glyph('V', `M${LEFT},${TOP}L${CENTER},${BOTTOM}L${RIGHT},${TOP}`),
  // "semicircle, opening at the bottom"
  W: glyph('W', horizontalArc(MIDDLE + WIDE_RADIUS / 2, LEFT, RIGHT, 1)),
  // "two straight lines form an angle open to the left"
  X: glyph('X', `M${LEFT},${TOP}L${RIGHT},${MIDDLE}L${LEFT},${BOTTOM}`),
  // "vertical and horizontal lines form an angle open to the left above"
  Y: glyph('Y', `M${LEFT},${BOTTOM}L${RIGHT},${BOTTOM}L${RIGHT},${TOP}`),
  // "horizontal zig-zag line beginning at top left and ending at bottom right"
  Z: glyph('Z', `M${LEFT},${TOP}L${RIGHT},${TOP}L${LEFT},${BOTTOM}L${RIGHT},${BOTTOM}`),
}

export const MOON_LETTERS = Object.keys(MOON_ALPHABET)

/**
 * The Moon glyph for one character, or `null` when Grade 1 defines none. Grade 1 is caseless and
 * covers only the 26 letters: its digits are the first ten letters behind a separate "number start"
 * marker, which this product does not use.
 */
export const getMoonGlyph = (character: string): MoonGlyph | null =>
  MOON_ALPHABET[character.toUpperCase()] ?? null

export interface MoonWordSegment {
  kind: 'moon'
  /** The Latin source of this word, preserved so assistive technology still reads the real text. */
  source: string
  glyphs: MoonGlyph[]
  /** Total width of the word in band units. */
  advance: number
}

export interface PlainSegment {
  kind: 'plain'
  text: string
}

export type MoonSegment = MoonWordSegment | PlainSegment

const toWordSegment = (source: string): MoonWordSegment => {
  const glyphs = [...source].map((character) => getMoonGlyph(character)).filter(
    (candidate): candidate is MoonGlyph => candidate !== null,
  )
  return {
    kind: 'moon',
    source,
    glyphs,
    advance: glyphs.reduce((total, current) => total + current.advance, 0),
  }
}

/**
 * Split text into runs that Moon can draw and runs it cannot. A run of letters becomes one word
 * segment, drawn as a single `<svg>`; everything else — whitespace, digits, punctuation — stays a
 * plain segment rendered in the surrounding Latin font. That fallback is lossless, so dates and
 * quantities remain legible, and it keeps line breaking with the browser: word segments are
 * inline-block, so wrapping still happens at the plain whitespace between them.
 */
export const toMoonSegments = (text: string): MoonSegment[] => {
  const segments: MoonSegment[] = []
  let buffer = ''
  let bufferIsMoon = false

  const flush = () => {
    if (!buffer) return
    segments.push(bufferIsMoon ? toWordSegment(buffer) : { kind: 'plain', text: buffer })
    buffer = ''
  }

  for (const character of text) {
    const isMoon = getMoonGlyph(character) !== null
    if (buffer && isMoon !== bufferIsMoon) flush()
    bufferIsMoon = isMoon
    buffer += character
  }
  flush()

  return segments
}
