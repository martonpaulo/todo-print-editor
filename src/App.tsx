import { useCallback, useRef, useState, useEffect, type FocusEvent } from 'react'
import './styles/app.css'
import { COPY } from './copy'
import { MarkdownEditor } from './components/MarkdownEditor'
import { Icon } from './components/Icon'
import { PrintPreview, type LayoutStatus } from './components/PrintPreview'
import { StorageStatus } from './components/StorageStatus'
import { VisualEditor } from './components/VisualEditor'
import { listCardId } from './components/elementIds'
import { parseMarkdown, serializeMarkdown } from './domain/markdown'
import type { MarkdownError, TodoDocument } from './domain/types'
import { usePersistentDocument } from './hooks/usePersistentDocument'

type EditorMode = 'visual' | 'markdown'

// The print action names only the format; the dialog settings that preserve the
// layout stay in an adjacent hint the button points at, so the accessible name
// remains short while the guidance is still announced with the control.
const PRINT_HINT_ID = 'print-dialog-hint'

// Below the stacking breakpoint the editor and the preview are several viewport
// heights apart, so both regions are addressable targets the navigation moves
// focus between.
const EDITOR_REGION_ID = 'editor-region'
const PREVIEW_REGION_ID = 'preview-region'

// The toggle's own name is only the alphabet's name; what switching it does to the document, and
// which characters keep their Latin form, is carried in an adjacent description.
const MOON_HINT_ID = 'moon-typography-hint'

// jsdom, and any environment without a layout engine, leaves scrollIntoView
// undefined; focus() already scrolls, so the explicit call only refines where
// the target lands.
const revealElement = (element: HTMLElement | null) => {
  if (!element) return
  element.focus()
  element.scrollIntoView?.({ block: 'start' })
}

const INITIAL_LAYOUT_STATUS: LayoutStatus = {
  ready: false,
  overflowListIds: [],
  panelCount: 1,
  pageCount: 1,
}

const App = () => {
  const { document, status: storageStatus, setDocument, replaceStoredDocument, undo, redo } =
    usePersistentDocument()
  const [mode, setMode] = useState<EditorMode>('visual')
  const [markdown, setMarkdown] = useState(() => serializeMarkdown(document))
  const [markdownErrors, setMarkdownErrors] = useState<MarkdownError[]>([])
  const [layoutStatus, setLayoutStatus] = useState(INITIAL_LAYOUT_STATUS)
  // Returning from the preview lands on the control the user last edited rather
  // than on the top of a document that can be several screens tall.
  const lastEditedElement = useRef<HTMLElement | null>(null)

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

  const firstOverflowListId = layoutStatus.overflowListIds[0]

  // The card carries the list name and the local correction as its description,
  // so moving focus there announces both without a second live region.
  const goToOverflowList = () => {
    if (!firstOverflowListId) return
    revealElement(window.document.getElementById(listCardId(firstOverflowListId)))
  }

  const rememberEditedElement = (event: FocusEvent<HTMLDivElement>) => {
    lastEditedElement.current = event.target
  }

  const goToPreview = () => revealElement(window.document.getElementById(PREVIEW_REGION_ID))

  const backToEditor = () => {
    const remembered = lastEditedElement.current
    revealElement(
      remembered?.isConnected ? remembered : window.document.getElementById(EDITOR_REGION_ID),
    )
  }


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
        <section
          className="editor-pane screen-only"
          id={EDITOR_REGION_ID}
          tabIndex={-1}
          aria-label={COPY.editorRegion}
        >
          <StorageStatus
            status={storageStatus}
            hasUnsavedDraft={markdownErrors.length > 0}
            onReplaceStoredDocument={replaceStoredDocument}
          />

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

              <label className="toggle-control">
                <input
                  type="checkbox"
                  aria-describedby={MOON_HINT_ID}
                  checked={document.typography === 'moon'}
                  onChange={(event) =>
                    applyDocumentSettings({
                      ...document,
                      typography: event.target.checked ? 'moon' : 'latin',
                    })
                  }
                />
                <span className="toggle-control__track" aria-hidden="true" />
                <Icon name="moon" size={17} />
                <span>{COPY.moonTypography}</span>
              </label>
              <p className="sr-only" id={MOON_HINT_ID}>
                {COPY.moonTypographyHint}
              </p>

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
                aria-describedby={PRINT_HINT_ID}
                disabled={!canPrint}
                onClick={() => window.print()}
              >
                <Icon name="printer" />
                {printLabel}
              </button>

              {firstOverflowListId && mode === 'visual' && (
                <button className="secondary-button" type="button" onClick={goToOverflowList}>
                  <Icon name="warning" size={16} />
                  {COPY.goToOverflowList}
                </button>
              )}

              {/* Side by side the preview is already on screen; stacked, it sits
                  a whole editor below, so this jump is revealed by the same
                  media query that stacks the panes. */}
              <button className="secondary-button narrow-only" type="button" onClick={goToPreview}>
                <Icon name="panel" size={16} />
                {COPY.goToPreview}
              </button>

              <p className="print-dialog-hint" id={PRINT_HINT_ID}>
                {COPY.printDialogHint}
              </p>
            </div>
          </header>

          <div className="editor-scroll-region" onFocusCapture={rememberEditedElement}>
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

        <section
          className="preview-pane"
          id={PREVIEW_REGION_ID}
          tabIndex={-1}
          aria-label={COPY.previewRegion}
        >
          <button
            className="secondary-button narrow-only screen-only preview-pane__return"
            type="button"
            onClick={backToEditor}
          >
            <Icon name="arrow-up" size={16} />
            {COPY.backToEditor}
          </button>

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
