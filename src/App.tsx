import { useCallback, useRef, useState, useEffect, type ChangeEvent, type FocusEvent } from 'react'
import './styles/app.css'
import { COPY } from './copy'
import { MarkdownEditor } from './components/MarkdownEditor'
import { Icon } from './components/Icon'
import { PrintPreview, type LayoutStatus } from './components/PrintPreview'
import { StorageStatus } from './components/StorageStatus'
import { VisualEditor } from './components/VisualEditor'
import { listCardId } from './components/elementIds'
import {
  MARKDOWN_FILE_ACCEPT,
  MARKDOWN_MIME_TYPE,
  downloadTextFile,
  markdownFileContent,
  markdownFileName,
  readTextFile,
} from './domain/file'
import { parseMarkdown, serializeMarkdown } from './domain/markdown'
import type { MarkdownError, TodoDocument } from './domain/types'
import { usePersistentDocument, type DocumentEdit } from './hooks/usePersistentDocument'

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

// The rotation's name says what it does to the paper, not why anyone would want it; the printer
// behaviour it works around is carried in an adjacent description.
const ROTATE_PRINT_HINT_ID = 'rotate-print-hint'

/**
 * The portrait sheet, declared apart from `src/styles/print.css`. `@page` cannot be scoped by a
 * selector and does not read custom properties, so the only way to make the paper depend on a
 * document setting is to attach and detach the rule itself. It is appended last, after the
 * stylesheet's landscape `@page`, so it wins by cascade order while it is present, and it is removed
 * with the setting so the two are never both live.
 */
const ROTATED_PAGE_STYLE_ID = 'rotated-page-size'
const ROTATED_PAGE_RULE = '@page { size: A4 portrait; margin: 0; }'

// Importing replaces the whole document, so what the picker is about to do is described with the
// control rather than discovered afterwards.
const IMPORT_HINT_ID = 'import-markdown-hint'

/**
 * Why an import left the document unchanged. `null` is the ordinary state: nothing was imported,
 * or the last import succeeded.
 *
 * - `unreadable`: the browser could not read the chosen file at all.
 * - `invalid`: the file was read, but its Markdown does not parse. The source is loaded into the
 *   Markdown view so the numbered errors point at the lines that need fixing, and it is kept here
 *   so the status can be shown only while that exact source is still on screen. Reporting on
 *   `markdownErrors` instead would let the message return for a later, unrelated error the import
 *   had nothing to do with.
 */
type ImportFailure = { kind: 'unreadable' } | { kind: 'invalid'; source: string } | null

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

// The removal status names what was removed; the history owner carries only the
// kind and the subject, so the sentence is assembled here from centralized copy.
const removalMessage = (edit: DocumentEdit) => {
  if (edit.kind === 'task-removed') return COPY.removedTask(edit.subject)
  if (edit.kind === 'list-removed') return COPY.removedList(edit.subject)
  return COPY.removedPanelBreak
}

const App = () => {
  const {
    document,
    status: storageStatus,
    lastEdit,
    setDocument,
    replaceDocument,
    replaceStoredDocument,
    undo,
    redo,
  } = usePersistentDocument()
  const [mode, setMode] = useState<EditorMode>('visual')
  const [markdown, setMarkdown] = useState(() => serializeMarkdown(document))
  const [markdownErrors, setMarkdownErrors] = useState<MarkdownError[]>([])
  const [layoutStatus, setLayoutStatus] = useState(INITIAL_LAYOUT_STATUS)
  const [importFailure, setImportFailure] = useState<ImportFailure>(null)
  // Counts import selections so a read that resolves after a newer one can recognize itself as
  // stale. A ref, not state: nothing renders from it, and it must be current the moment an await
  // returns rather than at the next render.
  const importSelection = useRef(0)
  // Returning from the preview lands on the control the user last edited rather
  // than on the top of a document that can be several screens tall.
  const lastEditedElement = useRef<HTMLElement | null>(null)

  // History traversal happens entirely inside the hook, so the restored document
  // arrives as the next render rather than as a return value. This flag marks the
  // one render that must re-serialize the Markdown view; leaving it out of the
  // effect's condition would overwrite the source the user is currently typing.
  const replayedDocument = useRef(false)

  useEffect(() => {
    if (!replayedDocument.current) return
    replayedDocument.current = false
    setMarkdown(serializeMarkdown(document))
    setMarkdownErrors([])
  }, [document])

  const applyDocument = useCallback((nextDocument: TodoDocument, edit?: DocumentEdit) => {
    setDocument(nextDocument, edit ?? null)
    setMarkdown(serializeMarkdown(nextDocument))
    setMarkdownErrors([])
  }, [setDocument])

  const undoLastEdit = useCallback(() => {
    if (undo()) replayedDocument.current = true
  }, [undo])

  const redoLastEdit = useCallback(() => {
    if (redo()) replayedDocument.current = true
  }, [redo])

  // The status disappears with the removal it describes, so focus would fall to
  // the document body. The editor region is the nearest stable landing point the
  // restored content is inside of.
  const undoRemoval = () => {
    undoLastEdit()
    revealElement(window.document.getElementById(EDITOR_REGION_ID))
  }

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

  // The file is the source the Markdown view shows, not a fresh serialization of the document.
  // While a draft has errors the document is deliberately the last valid one, so writing it would
  // hand back an older file than the work on screen — which is the copy the storage guidance tells
  // the user to take out of the app. `markdown` tracks the document whenever the source parses, so
  // exporting from the visual editor is unaffected.
  const exportMarkdown = () => {
    downloadTextFile(markdownFileName(document), markdownFileContent(markdown), MARKDOWN_MIME_TYPE)
  }

  // An import is an ordinary Markdown change: the same parse decides whether the document is
  // replaced, so a file can never put content into the document that typing could not. It is not
  // a continuation of what the user was typing, though, so it takes an undo step of its own: the
  // control promises that undo restores what was here, and a neighbouring keystroke coalesced
  // into the same step would restore more than that.
  const importMarkdown = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target
    const file = input.files?.[0]
    // Choosing the same file twice must read it again, so the input never keeps a value.
    input.value = ''
    if (!file) return

    // Reads are asynchronous and can finish in any order, so a slow first choice must not land on
    // top of a quick second one. Only the newest selection may apply its result; every earlier
    // read is abandoned where it would otherwise write.
    const selection = (importSelection.current += 1)
    const superseded = () => selection !== importSelection.current

    let source: string
    try {
      source = await readTextFile(file)
    } catch {
      if (superseded()) return
      setImportFailure({ kind: 'unreadable' })
      return
    }

    if (superseded()) return

    setMarkdown(source)
    const result = parseMarkdown(source, document)
    setMarkdownErrors(result.errors)

    if (result.errors.length > 0) {
      setImportFailure({ kind: 'invalid', source })
      setMode('markdown')
      return
    }

    setImportFailure(null)
    replaceDocument(result.document)
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


  // The rotation is a property of the paper, not of anything the preview renders, so it reaches
  // print through the document element the print stylesheet keys on rather than through a prop.
  useEffect(() => {
    const root = window.document.documentElement
    if (!document.rotatePrint) return

    root.classList.add('print-rotated')
    const pageStyle = window.document.createElement('style')
    pageStyle.id = ROTATED_PAGE_STYLE_ID
    pageStyle.textContent = ROTATED_PAGE_RULE
    window.document.head.append(pageStyle)

    return () => {
      root.classList.remove('print-rotated')
      pageStyle.remove()
    }
  }, [document.rotatePrint])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement) return
      if (e.target instanceof HTMLInputElement && (e.target.type === 'text' || e.target.type === 'date' || e.target.type === 'number')) return

      if (e.metaKey || e.ctrlKey) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault()
          undoLastEdit()
        } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
          e.preventDefault()
          redoLastEdit()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undoLastEdit, redoLastEdit])

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

          {/* Removal is immediate and persisted, so the recovery action is on
              screen rather than only on a keyboard shortcut: the button is
              reachable by keyboard, pointer, and touch alike, and the status
              announces what was removed. */}
          {lastEdit && (
            <div className="removal-status screen-only" role="status">
              <Icon name="warning" size={16} />
              <span>{removalMessage(lastEdit)}</span>
              <button className="text-button" type="button" onClick={undoRemoval}>
                {COPY.undoRemoval}
              </button>
            </div>
          )}

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

              {/* The layout stays A4 landscape whatever this says: only the paper the finished
                  sheet is imaged onto turns, for printers that rotate landscape media themselves. */}
              <label className="toggle-control">
                <input
                  type="checkbox"
                  aria-describedby={ROTATE_PRINT_HINT_ID}
                  checked={document.rotatePrint === true}
                  onChange={(event) =>
                    applyDocumentSettings({ ...document, rotatePrint: event.target.checked })
                  }
                />
                <span className="toggle-control__track" aria-hidden="true" />
                <Icon name="rotate" size={17} />
                <span>{COPY.rotatePrint}</span>
              </label>
              <p className="sr-only" id={ROTATE_PRINT_HINT_ID}>
                {COPY.rotatePrintHint}
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

              {/* The file lives outside the browser, so exporting is offered whatever the
                  layout says: an oversized list blocks printing, never keeping a copy. */}
              <button className="secondary-button" type="button" onClick={exportMarkdown}>
                <Icon name="download" size={16} />
                {COPY.exportMarkdown}
              </button>

              {/* A label around a visually hidden file input keeps the native picker, its
                  keyboard focus, and its accessible name instead of re-implementing them. */}
              <label className="secondary-button file-input-control">
                <input
                  type="file"
                  accept={MARKDOWN_FILE_ACCEPT}
                  aria-describedby={IMPORT_HINT_ID}
                  onChange={importMarkdown}
                />
                <Icon name="upload" size={16} />
                <span>{COPY.importMarkdown}</span>
              </label>
              <p className="sr-only" id={IMPORT_HINT_ID}>
                {COPY.importMarkdownHint}
              </p>

              {/* The same dialog as Print A4, named for the file a user comes looking for: no
                  page can preselect its destination, so the name says the dialog opens rather
                  than promising a saved file. It obeys the same block, because a document that
                  cannot be laid out cannot be written to a file either. */}
              <button
                className="secondary-button"
                type="button"
                aria-describedby={PRINT_HINT_ID}
                disabled={!canPrint}
                onClick={() => window.print()}
              >
                <Icon name="file" size={16} />
                {COPY.savePdf}
              </button>

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
                {COPY.printDialogHint(document.rotatePrint === true)}
              </p>

              {/* An import that changed nothing must say so: the document on screen is still the
                  one that was there before the file was chosen. */}
              {importFailure?.kind === 'unreadable' && (
                <p className="import-status" role="status">
                  <Icon name="warning" size={16} />
                  <span>{COPY.importFailed}</span>
                </p>
              )}
              {/* Only while the rejected source is still the one on screen. The first edit to it
                  ends the statement's subject, and no later error can revive it. */}
              {importFailure?.kind === 'invalid' && markdown === importFailure.source && (
                <p className="import-status" role="status">
                  <Icon name="warning" size={16} />
                  <span>{COPY.importFailedWithErrors}</span>
                </p>
              )}
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
