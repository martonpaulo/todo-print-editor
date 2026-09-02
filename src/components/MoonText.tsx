import { Fragment, memo } from 'react'
import {
  MOON_BAND_HEIGHT,
  MOON_STROKE_WIDTH,
  toMoonSegments,
  type MoonWordSegment,
} from '../domain/moon'

/**
 * Cap height of a Moon word relative to the surrounding font size. Moon glyphs carry no ascenders or
 * descenders, so they are set slightly below the em box to sit like upper-case Latin text.
 */
const CAP_HEIGHT_EM = 0.74

/**
 * One `<svg>` per word rather than per character or per whole run: a per-character element multiplies
 * DOM nodes on the measured editing hot path (see `docs/performance.md`), and a per-run element would
 * have to reimplement line breaking inside the fixed 99 mm panel. Per word, the browser still wraps at
 * the plain whitespace between the inline-block words.
 */
const MoonWord = ({ segment }: { segment: MoonWordSegment }) => {
  const width = (segment.advance / MOON_BAND_HEIGHT) * CAP_HEIGHT_EM
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
      style={{ width: `${width}em`, height: `${CAP_HEIGHT_EM}em` }}
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
          <MoonWord key={index} segment={segment} />
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        ),
      )}
    </span>
  </span>
))
MoonText.displayName = 'MoonText'
