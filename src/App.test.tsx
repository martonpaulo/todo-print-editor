import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { COPY } from './copy'
import { STORAGE_KEY } from './hooks/usePersistentDocument'

// jsdom reports every box as zero, so the layout never finishes measuring and the
// print action would keep its preparing label. Measured lists taller than a panel
// put the document in its blocked state; shorter ones make it printable.
const stubLayout = ({ listHeight, panelHeight }: { listHeight: number; panelHeight: number }) => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const measured =
      this instanceof HTMLElement && this.dataset.measureList !== undefined ? listHeight : panelHeight
    return { ...new DOMRect(), height: measured, width: measured } as DOMRect
  })
}

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
    stubLayout({ listHeight: 100, panelHeight: 900 })

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

  it('leads from the blocked print action to the first oversized list', async () => {
    const user = userEvent.setup()
    // Every list is taller than a panel, so printing is blocked and the first
    // list is the recovery target.
    stubLayout({ listHeight: 2000, panelHeight: 900 })

    render(<App />)

    const blockedPrint = await screen.findByRole('button', { name: COPY.printBlocked })
    expect(blockedPrint).toBeDisabled()

    // The recovery path is a labelled control beside the blocked action, not the
    // dashed border or the banner several screens below.
    await user.click(screen.getByRole('button', { name: COPY.goToOverflowList }))

    const firstList = screen.getByRole('region', { name: `List 1: ${COPY.starter.priorities}` })
    // Focus lands on the affected list, which announces its own name and the
    // correction that applies to it.
    expect(firstList).toHaveFocus()
    expect(firstList).toHaveAccessibleDescription(COPY.listOverflow)
  })

  it('offers no jump while every list fits', async () => {
    stubLayout({ listHeight: 100, panelHeight: 900 })

    render(<App />)

    await screen.findByRole('button', { name: COPY.print })
    expect(screen.queryByRole('button', { name: COPY.goToOverflowList })).not.toBeInTheDocument()
  })

  it('moves to the preview and back to the last edited control', async () => {
    const user = userEvent.setup()
    render(<App />)

    const title = screen.getByRole('textbox', { name: `Title of List 2: ${COPY.starter.smallWins}` })
    await user.click(title)

    await user.click(screen.getByRole('button', { name: COPY.goToPreview }))
    expect(screen.getByRole('region', { name: COPY.previewRegion })).toHaveFocus()

    // Returning lands on the control the user left, not on the top of a document
    // that is several screens tall once the panes are stacked.
    await user.click(screen.getByRole('button', { name: COPY.backToEditor }))
    expect(title).toHaveFocus()
  })

  it('marks the stacked-layout navigation as revealed only at the breakpoint', () => {
    render(<App />)

    // The breakpoint itself stays in CSS: both controls carry the class that is
    // hidden by default and revealed inside the block stacking the panes, so the
    // side-by-side layout is untouched.
    expect(screen.getByRole('button', { name: COPY.goToPreview })).toHaveClass('narrow-only')

    const back = screen.getByRole('button', { name: COPY.backToEditor })
    expect(back).toHaveClass('narrow-only')
    // It lives in the preview pane, so it also has to stay out of print output.
    expect(back).toHaveClass('screen-only')
  })

  it('switches the previewed document to Moon type and back', async () => {
    const user = userEvent.setup()
    render(<App />)

    const preview = screen.getByRole('region', { name: COPY.previewRegion })
    const toggle = screen.getByRole('checkbox', { name: COPY.moonTypography })
    expect(preview.querySelector('.moon-word')).toBeNull()

    await user.click(toggle)
    expect(preview.querySelector('.moon-word')).not.toBeNull()
    // The glyphs are a visual cipher, so what the document says is unchanged: the Latin text is
    // still there for assistive technology, and the panel number stays in the normal typeface.
    expect(preview).toHaveTextContent(COPY.starter.priorities)

    await user.click(toggle)
    expect(preview.querySelector('.moon-word')).toBeNull()
  })

  it('persists the Moon type setting with the document', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('checkbox', { name: COPY.moonTypography }))

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    expect(stored.typography).toBe('moon')

    cleanup()
    render(<App />)
    expect(screen.getByRole('checkbox', { name: COPY.moonTypography })).toBeChecked()
  })

  it('keeps completed tasks marked as completed in Moon type', async () => {
    const user = userEvent.setup()
    render(<App />)

    const preview = screen.getByRole('region', { name: COPY.previewRegion })
    const [task] = screen.getAllByRole('checkbox', { name: /^Mark Task 1/ })
    await user.click(task)
    await user.click(screen.getByRole('checkbox', { name: COPY.moonTypography }))

    // A CSS text decoration is not propagated into atomic inline boxes, and every Moon word is one,
    // so the completed state has to be drawn a second way. The stylesheet keys that off this class.
    const struck = preview.querySelector('.print-task__text--checked')
    expect(struck).not.toBeNull()
    expect(struck).toHaveClass('print-task__text--moon')
    expect(struck!.querySelector('.moon-word')).not.toBeNull()
  })

  it('describes what the Moon type toggle changes', () => {
    render(<App />)

    expect(screen.getByRole('checkbox', { name: COPY.moonTypography })).toHaveAccessibleDescription(
      COPY.moonTypographyHint,
    )
  })

  it('marks the document unsaved when the browser refuses the write, then clears it once a write succeeds', async () => {
    const user = userEvent.setup()
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    render(<App />)

    const title = screen.getByRole('textbox', { name: `Title of List 1: ${COPY.starter.priorities}` })
    await user.type(title, '!')

    // The edit is still on screen, and the status says it is not stored.
    expect(title).toHaveValue(`${COPY.starter.priorities}!`)
    expect(screen.getByRole('status')).toHaveTextContent(COPY.saveFailed)
    expect(screen.getByText(COPY.saveFailedDescription)).toBeInTheDocument()

    setItem.mockRestore()
    await user.type(title, '?')

    expect(screen.getByRole('status')).toHaveTextContent(COPY.savedLocally)
    expect(screen.queryByText(COPY.saveFailedDescription)).not.toBeInTheDocument()
  })

  it('keeps unreadable stored content until the user replaces it explicitly', async () => {
    const user = userEvent.setup()
    localStorage.setItem(STORAGE_KEY, '{ not a document')

    render(<App />)

    // The preview's overflow banner is also an alert, so the recovery region is
    // addressed by its own name.
    expect(screen.getByRole('alert', { name: COPY.loadFailedTitle })).toHaveTextContent(
      COPY.loadFailedDescription,
    )

    // Editing continues, but the unreadable value is the user's only stored copy.
    const title = screen.getByRole('textbox', { name: `Title of List 1: ${COPY.starter.priorities}` })
    await user.type(title, '!')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('{ not a document')

    await user.click(screen.getByRole('button', { name: COPY.replaceStoredDocument }))

    expect(
      screen.queryByRole('alert', { name: COPY.loadFailedTitle }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(COPY.savedLocally)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).blocks[0].title).toBe(
      `${COPY.starter.priorities}!`,
    )
  })

  it('stops claiming a save while an invalid Markdown draft is unparsed', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: COPY.markdownMode }))
    const source = screen.getByRole('textbox', { name: COPY.markdownLabel })
    await user.type(source, '\n# not-a-date')

    // The draft never reached the document, so storage cannot hold it.
    expect(screen.getByRole('status')).toHaveTextContent(COPY.saveFailed)
    expect(screen.getByText(COPY.draftNotSavedDescription)).toBeInTheDocument()

    // Removing the invalid line lets the document accept the source again.
    await user.clear(source)
    await user.type(source, '## Kept list')

    expect(screen.getByRole('status')).toHaveTextContent(COPY.savedLocally)
    expect(screen.queryByText(COPY.draftNotSavedDescription)).not.toBeInTheDocument()
  })

  it('recovers a removed task through the visible Undo action', async () => {
    const user = userEvent.setup()
    render(<App />)

    const listContext = COPY.listContext(1, COPY.starter.priorities)
    const taskContext = COPY.taskContext(1, COPY.starter.priorityItems[0])
    await user.click(
      screen.getByRole('button', { name: COPY.removeTaskLabel(taskContext, listContext) }),
    )

    expect(
      screen.queryByRole('textbox', { name: `${taskContext} in ${listContext}` }),
    ).not.toBeInTheDocument()

    // The status names what was removed, and the recovery action sits with it
    // rather than only behind a keyboard shortcut.
    const undoAction = screen.getByRole('button', { name: COPY.undoRemoval })
    expect(screen.getByText(COPY.removedTask(taskContext))).toBeInTheDocument()

    // A pointer or touch user reaches the same control every keyboard user does.
    undoAction.focus()
    expect(undoAction).toHaveFocus()

    await user.click(undoAction)

    expect(
      screen.getByRole('textbox', { name: `${taskContext} in ${listContext}` }),
    ).toBeInTheDocument()
    // The action disappears with the removal it reversed, so focus lands on the
    // region the restored task is inside of instead of on the document body.
    expect(screen.queryByRole('button', { name: COPY.undoRemoval })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: COPY.editorRegion })).toHaveFocus()
  })

  it('recovers a removed list through the same visible action', async () => {
    const user = userEvent.setup()
    render(<App />)

    const listContext = COPY.listContext(1, COPY.starter.priorities)
    await user.click(screen.getByRole('button', { name: COPY.removeListLabel(listContext) }))

    expect(screen.getByText(COPY.removedList(listContext))).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: COPY.undoRemoval }))

    expect(screen.getByRole('region', { name: listContext })).toBeInTheDocument()
  })

  it('undoes and redoes a removal from the keyboard outside a text field', async () => {
    const user = userEvent.setup()
    render(<App />)

    const listContext = COPY.listContext(1, COPY.starter.priorities)
    const taskContext = COPY.taskContext(1, COPY.starter.priorityItems[0])
    const taskName = `${taskContext} in ${listContext}`
    await user.click(
      screen.getByRole('button', { name: COPY.removeTaskLabel(taskContext, listContext) }),
    )

    // A delayed undo must still work, and must leave the reverted document
    // available to redo rather than consuming its own branch.
    fireEvent.keyDown(window.document.body, { key: 'z', ctrlKey: true })
    expect(screen.getByRole('textbox', { name: taskName })).toBeInTheDocument()

    fireEvent.keyDown(window.document.body, { key: 'z', ctrlKey: true, shiftKey: true })
    expect(screen.queryByRole('textbox', { name: taskName })).not.toBeInTheDocument()

    // The redone document is not a new edit, so one more undo returns to the
    // task rather than repeating the same step.
    fireEvent.keyDown(window.document.body, { key: 'z', ctrlKey: true })
    expect(screen.getByRole('textbox', { name: taskName })).toBeInTheDocument()
  })

  it('leaves the shortcut to the browser while a text field is being edited', async () => {
    const user = userEvent.setup()
    render(<App />)

    const listContext = COPY.listContext(1, COPY.starter.priorities)
    const taskContext = COPY.taskContext(1, COPY.starter.priorityItems[0])
    await user.click(
      screen.getByRole('button', { name: COPY.removeTaskLabel(taskContext, listContext) }),
    )

    const remainingTask = screen.getByRole('textbox', {
      name: `${COPY.taskContext(1, COPY.starter.priorityItems[1])} in ${listContext}`,
    })
    fireEvent.keyDown(remainingTask, { key: 'z', ctrlKey: true })

    // Native input undo owns the field; the document-level history stays put.
    expect(
      screen.queryByRole('textbox', { name: `${taskContext} in ${listContext}` }),
    ).not.toBeInTheDocument()
  })

  it('abandons the redo branch when an edit follows an undo', async () => {
    const user = userEvent.setup()
    render(<App />)

    const listContext = COPY.listContext(1, COPY.starter.priorities)
    const taskContext = COPY.taskContext(1, COPY.starter.priorityItems[0])
    const taskName = `${taskContext} in ${listContext}`
    await user.click(
      screen.getByRole('button', { name: COPY.removeTaskLabel(taskContext, listContext) }),
    )
    await user.click(screen.getByRole('button', { name: COPY.undoRemoval }))

    // A divergent edit made immediately after the undo, inside the coalescing
    // window, must not leave the abandoned removal reachable through redo.
    await user.click(screen.getByRole('button', { name: COPY.addTaskLabel(listContext) }))
    fireEvent.keyDown(window.document.body, { key: 'z', ctrlKey: true, shiftKey: true })

    expect(screen.getByRole('textbox', { name: taskName })).toBeInTheDocument()
  })

  it('restores a valid stored document without any recovery prompt', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        date: '2026-08-24',
        showDate: true,
        showPanelNumbers: true,
        blocks: [
          { id: 'list-1', kind: 'list', title: 'Restored', items: [] },
        ],
      }),
    )

    render(<App />)

    expect(
      screen.queryByRole('alert', { name: COPY.loadFailedTitle }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(COPY.savedLocally)
    expect(
      screen.getByRole('textbox', { name: 'Title of List 1: Restored' }),
    ).toHaveValue('Restored')
  })

})
