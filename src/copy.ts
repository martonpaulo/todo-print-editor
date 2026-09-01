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
  saveFailed: 'Could not save in this browser',
  visualMode: 'Visual',
  markdownMode: 'Markdown',
  editorMode: 'Editor mode',
  documentSettings: 'Document settings',
  firstPanelDate: 'Date on first panel',
  chooseDate: 'Choose document date',
  panelNumbers: 'Panel numbers',
  print: 'Print A4',
  printDialogHint:
    'In the print dialog, choose A4 landscape, no margins, 100% scale, and turn off headers and footers. Printers without edge-to-edge support may still add a margin.',
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
  markdownLabel: 'Markdown source',
  markdownHelp:
    'Use ## for list titles, - [ ] for tasks, # YYYY-MM-DD for the optional date, and --- to start a new panel.',
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
  addTaskLabel: (list: string) => `Add task to ${list}`,

  taskTextLabel: (task: string, list: string) => `${task} in ${list}`,
  taskCompleteLabel: (task: string, list: string) => `Mark ${task} in ${list} complete`,
  removeTaskLabel: (task: string, list: string) => `Remove ${task} from ${list}`,

  markdownErrors: MARKDOWN_ERROR_MESSAGES,

  markdownErrorLine: (line: number, code: MarkdownErrorCode) =>
    `Line ${line}: ${MARKDOWN_ERROR_MESSAGES[code]}`,
} as const
