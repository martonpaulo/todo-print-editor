import { describe, expect, it } from 'vitest'
import { MOON_LETTERS, MOON_MAX_RUN_GLYPHS, getMoonGlyph, toMoonSegments } from './moon.ts'

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
    // `ø` and `ß` are letters that do not canonically decompose to one of the 26, so accent
    // stripping cannot reach a glyph for them.
    for (const character of ['1', '-', ' ', '/', 'ø', 'ß', '—']) {
      expect(getMoonGlyph(character), character).toBeNull()
    }
  })

  // Grade 1 has no accents, so an accented letter is read as its base letter.
  it('draws an accented letter as its base letter', () => {
    const accents: Record<string, string> = {
      á: 'A',
      ã: 'A',
      À: 'A',
      ç: 'C',
      é: 'E',
      Ê: 'E',
      í: 'I',
      ñ: 'N',
      ô: 'O',
      ú: 'U',
      ü: 'U',
    }

    for (const [accented, base] of Object.entries(accents)) {
      expect(getMoonGlyph(accented), accented).toBe(getMoonGlyph(base))
    }
  })

  it('draws an accented letter written in decomposed form too', () => {
    expect(getMoonGlyph('e\u0301')).toBe(getMoonGlyph('E'))
  })

  it('has no glyph for a standalone combining mark', () => {
    expect(getMoonGlyph('\u0301')).toBeNull()
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

  // An accented letter used to have no glyph, so it opened a plain segment and split the word it
  // belonged to into alternating Moon and Latin pieces.
  describe('accented words', () => {
    const composed = 'Dúvidas'
    const decomposed = composed.normalize('NFD')

    it('keeps an accented word one uninterrupted Moon run', () => {
      for (const word of [composed, decomposed]) {
        const segments = toMoonSegments(word)

        // Bounded chunks may still split the run, but nothing in it falls back to Latin.
        expect(new Set(segments.map((segment) => segment.kind)), word).toEqual(new Set(['moon']))
        expect(
          segments.flatMap((segment) =>
            segment.kind === 'moon' ? segment.glyphs.map((glyph) => glyph.letter) : [],
          ),
          word,
        ).toEqual(['D', 'U', 'V', 'I', 'D', 'A', 'S'])
      }
    })

    it('reads the same whichever normal form the text is written in', () => {
      expect(decomposed).not.toBe(composed)
      const glyphsOf = (word: string) =>
        toMoonSegments(word).flatMap((segment) =>
          segment.kind === 'moon' ? segment.glyphs.map((glyph) => glyph.letter) : [],
        )

      expect(glyphsOf(decomposed)).toEqual(glyphsOf(composed))
    })

    it('loses no character of an accented source', () => {
      for (const word of [`${composed} — 2 itens`, decomposed]) {
        const rebuilt = toMoonSegments(word)
          .map((segment) => (segment.kind === 'moon' ? segment.source : segment.text))
          .join('')

        expect(rebuilt, word).toBe(word)
      }
    })

    it('still falls back to plain text around the accented word', () => {
      expect(
        toMoonSegments('Programação: 2').map((segment) =>
          segment.kind === 'moon' ? ['moon', segment.source] : ['plain', segment.text],
        ),
      ).toEqual([
        ['moon', 'Progra'],
        ['moon', 'mação'],
        ['plain', ': 2'],
      ])
    })
  })

  it('returns nothing for empty text', () => {
    expect(toMoonSegments('')).toEqual([])
  })

  // An `<svg>` is an atomic inline box that no CSS wrapping property can split, so a whole run in one
  // element would run past the panel while pagination, which measures height, saw one unwrapped line
  // and still allowed printing. Bounded chunks are what restore both the wrap and the measurement.
  describe('bounded break opportunities', () => {
    const longRun = 'A'.repeat(MOON_MAX_RUN_GLYPHS * 4 + 3)

    it('never emits a chunk wider than the bound', () => {
      for (const segment of toMoonSegments(`${longRun} ${longRun}`)) {
        if (segment.kind === 'moon') {
          expect(segment.glyphs.length).toBeLessThanOrEqual(MOON_MAX_RUN_GLYPHS)
        }
      }
    })

    it('splits a long run into chunks that reconstruct it exactly', () => {
      const chunks = toMoonSegments(longRun)

      expect(chunks).toHaveLength(Math.ceil(longRun.length / MOON_MAX_RUN_GLYPHS))
      expect(chunks.map((segment) => (segment.kind === 'moon' ? segment.source : '')).join('')).toBe(
        longRun,
      )
    })

    it('marks every chunk after the first as continuing its run', () => {
      const chunks = toMoonSegments(longRun)

      expect(chunks.map((segment) => segment.kind === 'moon' && segment.continuesRun)).toEqual([
        false,
        ...Array(chunks.length - 1).fill(true),
      ])
    })

    it('leaves a word within the bound as one unbroken chunk', () => {
      const short = 'A'.repeat(MOON_MAX_RUN_GLYPHS)
      const chunks = toMoonSegments(short)

      expect(chunks).toHaveLength(1)
      expect(chunks[0].kind === 'moon' && chunks[0].continuesRun).toBe(false)
    })

    it('starts a fresh run after unmapped characters', () => {
      expect(
        toMoonSegments('ab 12 cd').map((segment) =>
          segment.kind === 'moon' ? segment.continuesRun : 'plain',
        ),
      ).toEqual([false, 'plain', false])
    })
  })
})
