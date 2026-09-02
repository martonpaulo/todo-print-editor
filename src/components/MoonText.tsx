import { Fragment, memo } from 'react'
import {
  MOON_BAND_HEIGHT,
  MOON_STROKE_WIDTH,
  toMoonSegments,
  type MoonWordSegment,
} from '../domain/moon'

/**
 * Height of the complete Moon drawing band relative to the surrounding font size. The geometry is
 * inset within the band, so a 0.9-em viewport gives the visible strokes a Latin-like cap height.
 */
const BAND_HEIGHT_EM = 0.9

/**
 * Zero-width space. An `<svg>` is an atomic inline box, so no `overflow-wrap` or `word-break` value
 * can split one; between two of them, this is what gives the browser somewhere to wrap. It adds no
 * width, so a run that fits is laid out exactly as if it were one element.
 */
const BREAK_OPPORTUNITY = '\u200b'

/**
 * One `<svg>` per word — bounded by `MOON_MAX_RUN_GLYPHS` — rather than per character or per whole
 * run: a per-character element multiplies DOM nodes on the measured editing hot path (see
 * `docs/performance.md`), and a per-run element would have to reimplement line breaking inside the
 * fixed 99 mm panel. The browser wraps at the plain whitespace between words, and inside a long run
 * at the zero-width opportunities between its chunks.
 */
const MoonWord = ({ segment }: { segment: MoonWordSegment }) => {
  const width = (segment.advance / MOON_BAND_HEIGHT) * BAND_HEIGHT_EM
  // Each glyph is drawn at its own origin, so the word is composed by advancing along the baseline.
  const offsets = segment.glyphs.reduce<number[]>(
    (positions, glyph) => [...positions, positions[positions.length - 1] + glyph.advance],
    [0],
  )

  return (
    <svg
      aria-hidden="true"
      className="moon-word"
      focusable="false"
      viewBox={`0 0 ${segment.advance} ${MOON_BAND_HEIGHT}`}
      style={{ width: `${width}em`, height: `${BAND_HEIGHT_EM}em` }}
      preserveAspectRatio="xMidYMid meet"
    >
      {segment.glyphs.map((glyph, index) => (
        <g key={`${glyph.letter}-${index}`} transform={`translate(${offsets[index]} 0)`}>
          {glyph.strokes.map((stroke, strokeIndex) => (
            <path
              key={strokeIndex}
              d={stroke.d}
              fill={stroke.filled ? 'currentColor' : 'none'}
              stroke={stroke.filled ? 'none' : 'currentColor'}
              strokeWidth={stroke.filled ? undefined : MOON_STROKE_WIDTH}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </g>
      ))}
    </svg>
  )
}

/**
 * Render `text` as Moon type. The Latin source is kept in a visually hidden span so the accessible
 * name of a task or list title is identical whichever typography the document uses — the glyphs are
 * a visual cipher, not a change to what the document says.
 */
export const MoonText = memo(({ text }: { text: string }) => (
  <span className="moon-text">
    <span className="sr-only">{text}</span>
    <span aria-hidden="true" className="moon-text__glyphs">
      {toMoonSegments(text).map((segment, index) =>
        segment.kind === 'moon' ? (
          <Fragment key={index}>
            {segment.continuesRun && BREAK_OPPORTUNITY}
            <MoonWord segment={segment} />
          </Fragment>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        ),
      )}
    </span>
  </span>
))
MoonText.displayName = 'MoonText'
