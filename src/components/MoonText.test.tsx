import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MoonText } from './MoonText'

describe('MoonText', () => {
  it('renders a fixed-ratio monospaced SVG while preserving the accessible source', () => {
    const { container } = render(<MoonText text="AI" />)
    const word = container.querySelector('.moon-word')

    expect(screen.getByText('AI')).toHaveClass('sr-only')
    expect(word).toHaveAttribute('viewBox', '0 0 176 100')
    expect(word?.getAttribute('style')).toBe('width: 1.584em; height: 0.9em;')
    expect(word?.querySelectorAll(':scope > g')).toHaveLength(2)
  })
})
