import { COPY } from '../copy'
import type { MarkdownError } from '../domain/types'
import { Icon } from './Icon'

interface MarkdownEditorProps {
  value: string
  errors: MarkdownError[]
  onChange: (value: string) => void
}

export const MarkdownEditor = ({ value, errors, onChange }: MarkdownEditorProps) => (
  <div className="markdown-editor">
    <label className="sr-only" htmlFor="markdown-source">
      {COPY.markdownLabel}
    </label>
    <textarea
      id="markdown-source"
      className="markdown-editor__textarea"
      value={value}
      aria-invalid={errors.length > 0}
      aria-describedby="markdown-help markdown-errors"
      onChange={(event) => onChange(event.target.value)}
      spellCheck
    />

    <div id="markdown-help" className="markdown-editor__help">
      <Icon name="code" size={16} />
      <span>{COPY.markdownHint}</span>
      <code>{COPY.markdownDateHint}</code>
    </div>

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
