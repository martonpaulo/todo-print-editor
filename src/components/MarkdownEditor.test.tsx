import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
})
