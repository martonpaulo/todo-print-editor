import { useEffect, useRef } from 'react'
import { COPY } from '../copy'
import {
  continueMarkdownAtSelection,
  normalizeMarkdownSource,
} from '../domain/markdown'
import type { MarkdownError } from '../domain/types'
import { Icon } from './Icon'

interface MarkdownEditorProps {
  value: string
  errors: MarkdownError[]
  onChange: (value: string) => void
}

export const MarkdownEditor = ({ value, errors, onChange }: MarkdownEditorProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [value])

  const handleBlur = (event: React.FocusEvent<HTMLTextAreaElement>) => {
    const source = event.target.value
    const normalized = normalizeMarkdownSource(source)
    if (normalized !== source) onChange(normalized)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return

    const textarea = event.currentTarget
    const edit = continueMarkdownAtSelection(
      textarea.value,
      textarea.selectionStart,
      textarea.selectionEnd,
    )
    if (!edit) return

    event.preventDefault()
    onChange(edit.source)
    requestAnimationFrame(() => {
      if (!textareaRef.current) return
      textareaRef.current.selectionStart = edit.selectionStart
      textareaRef.current.selectionEnd = edit.selectionEnd
    })
  }

  return (
    <div className="markdown-editor">
      <label className="sr-only" htmlFor="markdown-source">
        {COPY.markdownLabel}
      </label>
      <textarea
        ref={textareaRef}
        id="markdown-source"
        className="markdown-editor__textarea"
        value={value}
        aria-invalid={errors.length > 0}
        aria-describedby="markdown-errors"
        onChange={(event) => onChange(event.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        spellCheck
      />

      <div id="markdown-errors" aria-live="polite">
        {errors.length > 0 && (
          <div className="inline-message inline-message--warning">
            <Icon name="warning" size={18} />
            <div>
              <strong>{COPY.markdownInvalid}</strong>
              <ul>
                {errors.map((error) => (
                  <li key={`${error.line}-${error.message}`}>
                    Line {error.line}: {error.message}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
