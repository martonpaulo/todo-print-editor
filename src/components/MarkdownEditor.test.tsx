import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { COPY } from '../copy'
import { MarkdownEditor } from './MarkdownEditor'

const getTextarea = (): HTMLTextAreaElement =>
  screen.getByRole('textbox', { name: 'Markdown source' }) as HTMLTextAreaElement

describe('MarkdownEditor', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('continues a non-empty task instead of turning its suffix into a heading', () => {
    const onChange = vi.fn()
    const source = '## List\n- [ ] Task'

    render(<MarkdownEditor value={source} errors={[]} onChange={onChange} />)

    const textarea = getTextarea()
    const textStart = source.indexOf('Task')
    textarea.setSelectionRange(textStart, textStart)
    fireEvent.keyDown(textarea, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledWith('## List\n- [ ] \n- [ ] Task')
  })

  it('recognizes a complete empty checklist even when the caret is inside its marker', () => {
    const onChange = vi.fn()
    const source = '## List\n- [ ] '

    render(<MarkdownEditor value={source} errors={[]} onChange={onChange} />)

    const textarea = getTextarea()
    textarea.setSelectionRange(11, 11)
    fireEvent.keyDown(textarea, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledWith('## List\n\n## ')
  })

  it('restores the selection returned by the domain continuation helper', () => {
    const frameCallbacks: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frameCallbacks.push(callback)
      return frameCallbacks.length
    })

    const onChange = vi.fn()
    const source = '## List\n- [ ] Task'
    const { rerender } = render(
      <MarkdownEditor value={source} errors={[]} onChange={onChange} />,
    )
    const textarea = getTextarea()
    textarea.setSelectionRange(source.length, source.length)

    fireEvent.keyDown(textarea, { key: 'Enter' })
    const nextSource = '## List\n- [ ] Task\n- [ ] '
    rerender(<MarkdownEditor value={nextSource} errors={[]} onChange={onChange} />)
    act(() => frameCallbacks.shift()?.(0))

    expect(textarea.selectionStart).toBe(nextSource.length)
    expect(textarea.selectionEnd).toBe(nextSource.length)
  })

  it('leaves selected text to native Enter behavior', () => {
    const onChange = vi.fn()
    const source = '## List\n- [ ] Task'

    render(<MarkdownEditor value={source} errors={[]} onChange={onChange} />)

    const textarea = getTextarea()
    textarea.setSelectionRange(14, 18)
    fireEvent.keyDown(textarea, { key: 'Enter' })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('normalizes supported Markdown to canonical dash syntax on blur', () => {
    const onChange = vi.fn()
    const source = '##   List\n* [X] Done'

    render(<MarkdownEditor value={source} errors={[]} onChange={onChange} />)

    fireEvent.blur(getTextarea())

    expect(onChange).toHaveBeenCalledWith('## List\n- [x] Done\n')
  })

  it('shows the Markdown help and describes the textarea with it when there are no errors', () => {
    render(<MarkdownEditor value="" errors={[]} onChange={vi.fn()} />)

    const help = screen.getByText(COPY.markdownHelp)

    expect(help).toBeVisible()
    expect(help).toHaveAttribute('id', 'markdown-help')
    expect(getTextarea()).toHaveAttribute('aria-describedby', 'markdown-help')
  })

  it('adds the live error region to the description while keeping the help', () => {
    render(
      <MarkdownEditor
        value={'## List\nThis would be lost'}
        errors={[{ line: 2, code: 'unrecognized-line' }]}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByText(COPY.markdownHelp)).toBeVisible()
    expect(getTextarea()).toHaveAttribute(
      'aria-describedby',
      'markdown-help markdown-errors',
    )
  })

  it('renders one centralized line-specific message per error', () => {
    render(
      <MarkdownEditor
        value={'# nope\n- [ ] Orphan'}
        errors={[
          { line: 1, code: 'invalid-date' },
          { line: 2, code: 'task-without-list' },
        ]}
        onChange={vi.fn()}
      />,
    )

    expect(
      screen.getByText(COPY.markdownErrorLine(1, 'invalid-date')),
    ).toBeInTheDocument()
    expect(
      screen.getByText(COPY.markdownErrorLine(2, 'task-without-list')),
    ).toBeInTheDocument()
  })

  it('keeps the static help outside the live region so edits announce errors only', () => {
    const { rerender } = render(
      <MarkdownEditor value="" errors={[]} onChange={vi.fn()} />,
    )

    const liveRegion = document.getElementById('markdown-errors') as HTMLElement
    expect(liveRegion).toHaveAttribute('aria-live', 'polite')
    expect(liveRegion).not.toHaveTextContent(COPY.markdownHelp)

    rerender(
      <MarkdownEditor
        value="oops"
        errors={[{ line: 1, code: 'unrecognized-line' }]}
        onChange={vi.fn()}
      />,
    )

    expect(liveRegion).toHaveTextContent(
      COPY.markdownErrorLine(1, 'unrecognized-line'),
    )
    expect(liveRegion).not.toHaveTextContent(COPY.markdownHelp)
  })
})

