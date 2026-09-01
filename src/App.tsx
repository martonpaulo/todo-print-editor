import { useCallback, useState, useEffect } from 'react'
import './styles/app.css'
import { COPY } from './copy'
import { MarkdownEditor } from './components/MarkdownEditor'
import { Icon } from './components/Icon'
import { PrintPreview, type LayoutStatus } from './components/PrintPreview'
import { VisualEditor } from './components/VisualEditor'
import { parseMarkdown, serializeMarkdown } from './domain/markdown'
import type { MarkdownError, TodoDocument } from './domain/types'
import { usePersistentDocument } from './hooks/usePersistentDocument'

type EditorMode = 'visual' | 'markdown'

const INITIAL_LAYOUT_STATUS: LayoutStatus = {
  ready: false,
  overflowListIds: [],
  panelCount: 1,
  pageCount: 1,
}

const App = () => {
  const { document, setDocument, undo, redo } = usePersistentDocument()
  const [mode, setMode] = useState<EditorMode>('visual')
  const [markdown, setMarkdown] = useState(() => serializeMarkdown(document))
  const [markdownErrors, setMarkdownErrors] = useState<MarkdownError[]>([])
  const [layoutStatus, setLayoutStatus] = useState(INITIAL_LAYOUT_STATUS)

  const applyDocument = useCallback((nextDocument: TodoDocument) => {
    setDocument(nextDocument)
    setMarkdown(serializeMarkdown(nextDocument))
    setMarkdownErrors([])
  }, [setDocument])

  const applyDocumentSettings = (nextDocument: TodoDocument) => {
    setDocument(nextDocument)
    if (markdownErrors.length === 0) setMarkdown(serializeMarkdown(nextDocument))
  }

  const changeMarkdown = (source: string) => {
    setMarkdown(source)
    const result = parseMarkdown(source, document)
    setMarkdownErrors(result.errors)
    if (result.errors.length === 0) setDocument(result.document)
  }

  const changeMode = (nextMode: EditorMode) => {
    if (nextMode === 'visual' && markdownErrors.length > 0) return
    if (nextMode === 'markdown') setMarkdown(serializeMarkdown(document))
    setMode(nextMode)
  }

  const handleLayoutStatusChange = useCallback((status: LayoutStatus) => {
    setLayoutStatus(status)
  }, [])

  const canPrint =
    layoutStatus.ready &&
    layoutStatus.overflowListIds.length === 0 &&
    markdownErrors.length === 0
  const printLabel = !layoutStatus.ready
    ? COPY.preparingPrint
    : canPrint
      ? COPY.print
      : COPY.printBlocked


  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement) return
      if (e.target instanceof HTMLInputElement && (e.target.type === 'text' || e.target.type === 'date' || e.target.type === 'number')) return

      if (e.metaKey || e.ctrlKey) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault()
          const prev = undo()
          if (prev) applyDocument(prev)
        } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
          e.preventDefault()
          const next = redo()
          if (next) applyDocument(next)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo, applyDocument])

  return (
    <div className={`app-shell${canPrint ? '' : ' app-shell--print-blocked'}`}>
      <main className="workspace">
        <section className="editor-pane screen-only" aria-label={COPY.editorRegion}>
          <header className="document-toolbar screen-only" aria-label={COPY.documentSettings}>
            <div className="toolbar-group">
              <label className="toggle-control">
                <input
                  type="checkbox"
                  checked={document.showDate}
                  onChange={(event) =>
                    applyDocumentSettings({ ...document, showDate: event.target.checked })
                  }
                />
                <span className="toggle-control__track" aria-hidden="true" />
                <Icon name="calendar" size={17} />
                <span>{COPY.firstPanelDate}</span>
              </label>

              <label className={`date-control${document.showDate ? '' : ' date-control--disabled'}`}>
                <span className="sr-only">{COPY.chooseDate}</span>
                <input
                  type="date"
                  value={document.date}
                  disabled={!document.showDate}
                  onChange={(event) => {
                    const date = event.target.value
                    applyDocumentSettings(
                      date ? { ...document, date } : { ...document, showDate: false },
                    )
                  }}
                />
              </label>
            </div>

            <div className="toolbar-group toolbar-group--end">
              <label className="toggle-control">
                <input
                  type="checkbox"
                  checked={document.showPanelNumbers}
                  onChange={(event) =>
                    applyDocumentSettings({ ...document, showPanelNumbers: event.target.checked })
                  }
                />
                <span className="toggle-control__track" aria-hidden="true" />
                <Icon name="panel" size={17} />
                <span>{COPY.panelNumbers}</span>
              </label>

              

              <div className="mode-switcher" role="group" aria-label={COPY.editorMode}>
                <button
                  type="button"
                  aria-pressed={mode === 'visual'}
                  disabled={markdownErrors.length > 0}
                  className={mode === 'visual' ? 'mode-switcher__button is-active' : 'mode-switcher__button'}
                  onClick={() => changeMode('visual')}
                >
                  <Icon name="list" size={16} />
                  {COPY.visualMode}
                </button>
                <button
                  type="button"
                  aria-pressed={mode === 'markdown'}
                  className={mode === 'markdown' ? 'mode-switcher__button is-active' : 'mode-switcher__button'}
                  onClick={() => changeMode('markdown')}
                >
                  <Icon name="code" size={16} />
                  {COPY.markdownMode}
                </button>
              </div>

              <button
                className="primary-button"
                type="button"
                disabled={!canPrint}
                onClick={() => window.print()}
              >
                <Icon name="printer" />
                {printLabel}
              </button>
            </div>
          </header>

          <div className="editor-scroll-region">
            {mode === 'visual' ? (
              <VisualEditor
                document={document}
                overflowListIds={layoutStatus.overflowListIds}
                onChange={applyDocument}
              />
            ) : (
              <MarkdownEditor
                value={markdown}
                errors={markdownErrors}
                onChange={changeMarkdown}
              />
            )}
          </div>
        </section>

        <section className="preview-pane" aria-label={COPY.previewRegion}>

          {layoutStatus.overflowListIds.length > 0 && (
            <div className="overflow-banner screen-only" role="alert">
              <Icon name="warning" />
              <div>
                <strong>{COPY.overflowTitle}</strong>
                <span>{COPY.overflowDescription}</span>
              </div>
            </div>
          )}

          <PrintPreview
            document={document}
            onLayoutStatusChange={handleLayoutStatusChange}
          />
        </section>
      </main>

      <section className="print-blocker" aria-labelledby="print-blocker-title">
        <h1 id="print-blocker-title">{COPY.printBlockedTitle}</h1>
        <p>{COPY.printBlockedDescription}</p>
      </section>
    </div>
  )
}

export default App
