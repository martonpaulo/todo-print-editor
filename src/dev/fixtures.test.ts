import { describe, expect, it } from 'vitest'
import { isListBlock } from '../domain/types'
import { createProfileDocument } from './fixtures'

describe('createProfileDocument', () => {
  it('generates the requested scale', () => {
    const document = createProfileDocument({ lists: 100, tasksPerList: 10 })

    expect(document.blocks).toHaveLength(100)
    expect(document.blocks.every(isListBlock)).toBe(true)
    expect(document.blocks.filter(isListBlock).every((list) => list.items.length === 10)).toBe(true)
  })

  it('is deterministic so two profile runs measure the same document', () => {
    const first = createProfileDocument({ lists: 10, tasksPerList: 10 })
    const second = createProfileDocument({ lists: 10, tasksPerList: 10 })

    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })

  it('uses unique identifiers across lists and tasks', () => {
    const document = createProfileDocument({ lists: 25, tasksPerList: 10 })
    const lists = document.blocks.filter(isListBlock)
    const ids = [...lists.map((list) => list.id), ...lists.flatMap((list) => list.items.map((item) => item.id))]

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('carries generated text only', () => {
    const document = createProfileDocument({ lists: 5, tasksPerList: 10 })
    const texts = document.blocks
      .filter(isListBlock)
      .flatMap((list) => list.items.map((item) => item.text))

    expect(texts.every((text) => /^[a-z ]+the [a-z ]+$/.test(text))).toBe(true)
  })
})
