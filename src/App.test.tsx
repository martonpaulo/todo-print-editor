import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
    vi.restoreAllMocks()
    cleanup()
    localStorage.clear()
  })

  it('names the editor and preview regions from the centralized copy', () => {
    render(<App />)

    expect(screen.getByRole('region', { name: COPY.editorRegion })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: COPY.previewRegion })).toBeInTheDocument()
  })

  it('describes the print action with the print-dialog guidance', async () => {
    // jsdom reports every box as zero, so the layout never finishes measuring and
    // the action would keep its preparing label. Panels large enough for every
    // list put the action in its printable state, where the label is visible.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const height = this instanceof HTMLElement && this.dataset.measureList !== undefined ? 100 : 900
      return { ...new DOMRect(), height, width: height } as DOMRect
    })

    render(<App />)

    const printButton = await screen.findByRole('button', { name: COPY.print })
    const hint = screen.getByText(COPY.printDialogHint)

    // The action names only the format, while the settings the browser owns stay
    // in the description so the accessible name does not grow to a paragraph.
    expect(printButton).toHaveAccessibleDescription(COPY.printDialogHint)
    expect(printButton.getAttribute('aria-describedby')).toBe(hint.id)

    // Both live inside the screen-only toolbar, so the print stylesheet hides them.
    expect(hint.closest('.screen-only')).not.toBeNull()
    expect(printButton.closest('.screen-only')).not.toBeNull()
  })

  it('keeps the canonical document while an unsupported heading stands', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: COPY.markdownMode }))
    const textarea = screen.getByLabelText(COPY.markdownLabel) as HTMLTextAreaElement
    const validSource = textarea.value

    fireEvent.change(textarea, {
      target: { value: '### Personal\n- [ ] Call someone' },
    })

    expect(
      screen.getByText(COPY.markdownErrorLine(1, 'unsupported-heading')),
    ).toBeInTheDocument()

    // The visual editor stays unreachable while the source is invalid.
    fireEvent.click(screen.getByRole('button', { name: COPY.visualMode }))
    expect(screen.getByLabelText(COPY.markdownLabel)).toBeInTheDocument()

    // Restoring the valid source clears the error, and the canonical document is
    // still the one the rejected heading never replaced.
    fireEvent.change(textarea, { target: { value: validSource } })
    expect(
      screen.queryByText(COPY.markdownErrorLine(1, 'unsupported-heading')),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: COPY.visualMode }))
    const titles = screen
      .getAllByRole('textbox', { name: /^Title of / })
      .map((input) => (input as HTMLInputElement).value)
    expect(titles).toEqual([
      COPY.starter.priorities,
      COPY.starter.smallWins,
      COPY.starter.work,
      COPY.starter.personal,
    ])
  })
})
