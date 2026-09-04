import type { MarkdownErrorCode } from './domain/types'

const MARKDOWN_ERROR_MESSAGES = {
  'duplicate-date': 'Use only one document date.',
  'invalid-date': 'Use an ISO date such as “# 2026-08-24”.',
  'task-without-list': 'Add a “## List title” before its tasks.',
  'unsupported-heading': 'Use exactly two hashes and a space, as in “## List title”.',
  'unrecognized-line': 'Use checklist items such as “- [ ] Task”.',
} satisfies Record<MarkdownErrorCode, string>

export const COPY = {
  appName: 'Todo Print Editor',
  appTagline: 'A calm workspace for paper plans.',
  localBadge: 'Local · private',
  savedLocally: 'Saved in this browser',
  saveFailed: 'Not saved in this browser',
  // A failed write leaves the only copy of the work in this tab, so the guidance
  // names the two actions that keep it: do not close the tab, and take the
  // Markdown out of the app.
  saveFailedDescription:
    'This browser refused to store your document. Keep this tab open, and copy your work from the Markdown view before closing it.',
  // An invalid Markdown source is never parsed into the document, so what is on
  // screen is newer than what is stored even though nothing failed.
  draftNotSavedDescription:
    'The Markdown source has errors, so this draft is not stored. Fix the errors, or copy the source, before closing the tab.',
  loadFailedTitle: 'Could not read your saved document',
  // The unreadable value is still the user's only stored copy, so the message
  // says both that nothing is being saved and that nothing has been destroyed.
  loadFailedDescription:
    'The document stored in this browser is unreadable, so a starter document is shown instead. Nothing is being saved, and the stored content is kept until you replace it. Copy this draft from the Markdown view first if you want to keep it.',
  replaceStoredDocument: 'Replace the stored document',
  // Overwriting the unreadable stored value is the one destructive action no
  // undo reaches, because the document history never held the copy it
  // discards. It is therefore the one that most needs to ask first.
  confirmReplaceStoredDocument: 'Replace the stored document?',
  confirmReplacement: 'Replace',
  cancelReplacement: 'Keep',
  cancelReplaceStoredDocument: 'Keep the stored document',
  visualMode: 'Visual',
  markdownMode: 'Markdown',
  editorMode: 'Editor mode',
  documentSettings: 'Document settings',
  firstPanelDate: 'Date on first panel',
  chooseDate: 'Choose document date',
  panelNumbers: 'Panel numbers',
  moonTypography: 'Moon type',
  moonTypographyHint:
    'Draws list titles and tasks with the geometric Moon type alphabet, on screen and in print. Letters without a Moon glyph, such as digits, stay in the normal typeface.',
  print: 'Print A4',
  // The same dialog produces both outputs: paper when a printer is the destination, a file when
  // “Save as PDF” is. One hint therefore describes both actions instead of repeating the settings.
  savePdf: 'Save as PDF',
  printDialogHint:
    'In the print dialog, choose A4 landscape, no margins, 100% scale, and turn off headers and footers. To save a file instead, choose “Save as PDF” as the destination. Printers without edge-to-edge support may still add a margin.',
  exportMarkdown: 'Export Markdown',
  importMarkdown: 'Import Markdown',
  // Importing replaces the whole document, so the control says so before the picker opens. The
  // replacement is a recorded edit, so the sentence also names the action that reverses it.
  importMarkdownHint:
    'Replaces the current document with the contents of a Markdown file. Undo restores what was here.',
  importFailed: 'Could not read that file. Choose a Markdown (.md) file saved from this editor.',
  importFailedWithErrors:
    'That file was read, but its Markdown has errors. The document is unchanged until they are fixed.',
  preparingPrint: 'Preparing layout…',
  printBlocked: 'Resolve issues to print',
  printBlockedTitle: 'Printing is blocked',
  printBlockedDescription:
    'Return to the editor and resolve layout overflow or Markdown errors before printing.',
  editorTitle: 'Build your lists',
  editorRegion: 'Editor',
  previewTitle: 'Print preview',
  previewRegion: 'Preview',
  addList: 'Add list',
  addPanel: 'Add panel',
  addTask: 'Add task',
  taskPlaceholder: 'Write a task…',
  untitledList: 'Untitled list',
  removeList: 'Remove list',
  removeTask: 'Remove task',
  moveListUp: 'Move list up',
  moveListDown: 'Move list down',
  panelBreak: 'New panel',
  panelBreakDescription: 'Everything below starts on a fresh 99 × 210 mm panel.',
  removePanelBreak: 'Remove panel break',
  // Removal is the one editor action that destroys content in a single click,
  // so it is announced with what was removed and paired with a recovery action
  // that does not depend on knowing a keyboard shortcut.
  undoRemoval: 'Undo removal',
  removedPanelBreak: 'Panel break removed.',
  // Removing a list, or a task that still holds text, destroys written content
  // in one click, so the control asks in place before the document changes. The
  // question replaces the control it belongs to, which keeps the confirmation
  // beside its target instead of in a dialog that moves focus out of the list.
  // An empty task has nothing to lose, so it is removed without the question.
  confirmRemoveList: 'Remove this list?',
  confirmRemoveTask: 'Remove this task?',
  confirmRemoval: 'Remove',
  cancelRemoval: 'Keep',
  markdownLabel: 'Markdown source',
  markdownHelp:
    'Use optional ## headings for list titles, - [ ] for tasks, # YYYY-MM-DD for the optional date, and --- to start a new panel.',
  markdownInvalid: 'Previewing the last valid version',
  overflowTitle: 'One list is too tall for a panel.',
  overflowDescription: 'Shorten the highlighted list before printing. Lists are never split.',
  // The banner explains the document as a whole; this sentence repeats the same
  // rule beside the list it applies to, so recovery never depends on the dashed
  // border, on color, or on reaching the preview.
  listOverflow: 'This list is too tall for one panel. Shorten it before printing.',
  goToOverflowList: 'Go to the oversized list',
  goToPreview: 'View print preview',
  backToEditor: 'Back to the editor',
  emptyPanel: 'Empty panel',
  panel: 'Panel',
  list: 'List',
  checkedTask: 'Completed task',
  uncheckedTask: 'Open task',

  starter: {
    priorities: 'Top priorities',
    priorityItems: ['Write the three must-dos', 'Protect one focus block', 'Close the loop'],
    smallWins: 'Small wins',
    smallWinItems: ['Send the quick reply', 'Put one thing away'],
    work: 'Work',
    workItems: ['Prepare the first draft', 'Review open decisions', 'Plan tomorrow'],
    personal: 'Personal',
    personalItems: ['Pick up groceries', 'Take a proper break', 'Call someone you miss'],
  },
  listNumber: (number: number, total: number) => `List ${number} / ${total}`,
  panelNumber: (current: number, total: number) => `Panel ${current} / ${total}`,

  // Repeated list and task controls must name their target, so every accessible
  // name is built from one context string that always carries the current
  // position. The position keeps names unique when two lists or tasks share the
  // same text, and stands alone while the text is still empty.
  listContext: (position: number, title: string) => {
    const trimmed = title.trim()
    return trimmed ? `List ${position}: ${trimmed}` : `List ${position}`
  },
  taskContext: (position: number, text: string) => {
    const trimmed = text.trim()
    return trimmed ? `Task ${position}: ${trimmed}` : `Task ${position}`
  },

  listTitleLabel: (list: string) => `Title of ${list}`,
  moveListUpLabel: (list: string) => `Move ${list} up`,
  moveListDownLabel: (list: string) => `Move ${list} down`,
  removeListLabel: (list: string) => `Remove ${list}`,
  confirmRemoveListLabel: (list: string) => `Confirm removing ${list}`,
  cancelRemoveListLabel: (list: string) => `Keep ${list}`,
  addTaskLabel: (list: string) => `Add task to ${list}`,

  removedTask: (task: string) => `${task} removed.`,
  removedList: (list: string) => `${list} removed.`,

  taskTextLabel: (task: string, list: string) => `${task} in ${list}`,
  taskCompleteLabel: (task: string, list: string) => `Mark ${task} in ${list} complete`,
  removeTaskLabel: (task: string, list: string) => `Remove ${task} from ${list}`,
  confirmRemoveTaskLabel: (task: string, list: string) => `Confirm removing ${task} from ${list}`,
  cancelRemoveTaskLabel: (task: string, list: string) => `Keep ${task} in ${list}`,

  markdownErrors: MARKDOWN_ERROR_MESSAGES,

  markdownErrorLine: (line: number, code: MarkdownErrorCode) =>
    `Line ${line}: ${MARKDOWN_ERROR_MESSAGES[code]}`,
} as const
