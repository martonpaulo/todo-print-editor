import { useRef, useEffect } from 'react'
import { COPY } from '../copy'
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
    const fixed = source
      .replace(/[ 	]+$/gm, '')
      .replace(/^(##?)[ 	]+/gm, '$1 ')
      .replace(/^([ 	]*[-*])[ 	]*\[([ xX]?)\][ 	]*(.*)$/gm, (_, bullet, state, text) => {
        const isChecked = state.toLowerCase() === 'x'
        return `${bullet} [${isChecked ? 'x' : ' '}] ${text}`
      })
      .replace(/^([ 	]*[-*])[ 	]+(?!\[)(.*)$/gm, '$1 [ ] $2')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    
    // Add a trailing newline if document is not empty
    const final = fixed ? `${fixed}\n` : ''
    
    if (final !== source) {
      onChange(final)
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      const textarea = event.currentTarget
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      
      // Only trigger smart enter if there is no text selected
      if (start !== end) return

      const source = textarea.value
      const beforeCursor = source.substring(0, start)
      const afterCursor = source.substring(start)
      const lastNewlineIndex = beforeCursor.lastIndexOf('\n')
      const currentLineText = beforeCursor.substring(lastNewlineIndex + 1)
      
      // Case 1: Empty checkbox line
      if (/^[ \t]*[-*][ \t]+\[[ xX]\][ \t]*$/.test(currentLineText)) {
        event.preventDefault()
        const replaceLength = currentLineText.length
        const newValue = beforeCursor.substring(0, beforeCursor.length - replaceLength) + '\n## ' + afterCursor
        onChange(newValue)
        
        const newCursorPos = start - replaceLength + '\n## '.length
        requestAnimationFrame(() => {
          if (textareaRef.current) {
            textareaRef.current.selectionStart = newCursorPos
            textareaRef.current.selectionEnd = newCursorPos
          }
        })
        return
      }
      
      // Case 2: Non-empty checkbox line
      const checkboxMatch = currentLineText.match(/^([ \t]*[-*][ \t]+\[[ xX]\][ \t]*)(.*)$/)
      if (checkboxMatch) {
        event.preventDefault()
        const indentMatch = checkboxMatch[1].match(/^[ \t]*/)
        const indent = indentMatch ? indentMatch[0] : ''
        const prefix = `\n${indent}- [ ] `
        const newValue = beforeCursor + prefix + afterCursor
        onChange(newValue)
        
        const newCursorPos = start + prefix.length
        requestAnimationFrame(() => {
          if (textareaRef.current) {
            textareaRef.current.selectionStart = newCursorPos
            textareaRef.current.selectionEnd = newCursorPos
          }
        })
        return
      }
    }
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
