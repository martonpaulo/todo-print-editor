import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { COPY } from './copy'

describe('App', () => {
  // The test environment does not implement matchMedia, which PrintPreview
  // queries to skip measurement while the print stylesheet is active.
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    cleanup()
    localStorage.clear()
  })

  it('names the editor and preview regions from the centralized copy', () => {
    render(<App />)

    expect(screen.getByRole('region', { name: COPY.editorRegion })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: COPY.previewRegion })).toBeInTheDocument()
  })
})
