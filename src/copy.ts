import type { MarkdownErrorCode } from './domain/types'

const MARKDOWN_ERROR_MESSAGES = {
  'duplicate-date': 'Use only one document date.',
  'invalid-date': 'Use an ISO date such as “# 2026-08-24”.',
  'task-without-list': 'Add a “## List title” before its tasks.',
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
  print: 'Print',
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
  listTitle: 'List title',
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

  taskCompleteLabel: (task: string) => `Mark “${task || 'Untitled task'}” complete`,

  markdownErrors: MARKDOWN_ERROR_MESSAGES,

  markdownErrorLine: (line: number, code: MarkdownErrorCode) =>
    `Line ${line}: ${MARKDOWN_ERROR_MESSAGES[code]}`,
} as const
