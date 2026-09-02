import { describe, expect, it } from 'vitest'
import { MOON_LETTERS, getMoonGlyph, toMoonSegments } from './moon.ts'

const LATIN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

describe('Moon type glyph table', () => {
  it('covers exactly the 26 letters of Grade 1', () => {
    expect(MOON_LETTERS).toEqual(LATIN_ALPHABET)
  })

  it('gives every letter a drawable glyph with a positive advance', () => {
    for (const letter of LATIN_ALPHABET) {
      const glyph = getMoonGlyph(letter)
      expect(glyph, letter).not.toBeNull()
      expect(glyph!.letter).toBe(letter)
      expect(glyph!.advance).toBeGreaterThan(0)
      expect(glyph!.strokes.length).toBeGreaterThan(0)
      for (const stroke of glyph!.strokes) {
        // Every path starts with an absolute move and carries at least one drawing command.
        expect(stroke.d, `${letter} path`).toMatch(/^M[\d.]+,[\d.]+[ALZ]/)
      }
    }
  })

  it('is caseless, as Moon type has no upper and lower case', () => {
    expect(getMoonGlyph('a')).toBe(getMoonGlyph('A'))
  })

  it('gives distinct outlines to every letter', () => {
    const outlines = LATIN_ALPHABET.map((letter) =>
      getMoonGlyph(letter)!.strokes.map((stroke) => stroke.d).join('|'),
    )
    expect(new Set(outlines).size).toBe(LATIN_ALPHABET.length)
  })

  it('has no glyph for characters outside the alphabet', () => {
    for (const character of ['1', '-', ' ', 'é', '/']) {
      expect(getMoonGlyph(character), character).toBeNull()
    }
  })
})

describe('toMoonSegments', () => {
  it('turns a run of letters into one word segment', () => {
    const segments = toMoonSegments('Plan')

    expect(segments).toHaveLength(1)
    expect(segments[0]).toMatchObject({ kind: 'moon', source: 'Plan' })
    expect(segments[0].kind === 'moon' && segments[0].glyphs.map((g) => g.letter)).toEqual([
      'P',
      'L',
      'A',
      'N',
    ])
  })

  it('sums the word advance from its glyphs', () => {
    const [segment] = toMoonSegments('AB')

    expect(segment.kind).toBe('moon')
    const expected = getMoonGlyph('A')!.advance + getMoonGlyph('B')!.advance
    expect(segment.kind === 'moon' && segment.advance).toBe(expected)
  })

  it('keeps whitespace and unmapped characters as plain runs, in order', () => {
    expect(toMoonSegments('Pay 12 bills!').map((segment) =>
      segment.kind === 'moon' ? ['moon', segment.source] : ['plain', segment.text],
    )).toEqual([
      ['moon', 'Pay'],
      ['plain', ' 12 '],
      ['moon', 'bills'],
      ['plain', '!'],
    ])
  })

  it('loses no character of the source', () => {
    const source = 'Call Ana at 09:30 — twice'
    const rebuilt = toMoonSegments(source)
      .map((segment) => (segment.kind === 'moon' ? segment.source : segment.text))
      .join('')

    expect(rebuilt).toBe(source)
  })

  it('returns nothing for empty text', () => {
    expect(toMoonSegments('')).toEqual([])
  })
})
