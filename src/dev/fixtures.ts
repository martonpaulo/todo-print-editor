import type { ListBlock, TodoDocument, TodoItem } from '../domain/types'

/**
 * Deterministic generated documents for the performance harness.
 *
 * Identifiers and text are derived from the position alone, so two runs at the
 * same scale produce byte-identical documents and no personal document data can
 * reach a fixture.
 */

const TITLE_WORDS = [
  'Inbox',
  'Focus',
  'Errands',
  'Reading',
  'Shipping',
  'Follow-ups',
  'Backlog',
  'Review',
  'Planning',
  'Weekly',
] as const

const TASK_WORDS = [
  'draft',
  'review',
  'ship',
  'measure',
  'refine',
  'archive',
  'schedule',
  'confirm',
  'reply to',
  'prepare',
] as const

const TASK_OBJECTS = [
  'the print layout',
  'the panel budget',
  'the weekly notes',
  'the reading list',
  'the pagination pass',
  'the storage contract',
  'the markdown source',
  'the visual editor',
  'the paper stock',
  'the printer profile',
] as const

export interface ProfileDocumentOptions {
  /** Number of list blocks. */
  lists: number
  /** Tasks inside every list. */
  tasksPerList: number
}

const createFixtureItem = (listIndex: number, itemIndex: number): TodoItem => ({
  id: `item-${listIndex}-${itemIndex}`,
  text: `${TASK_WORDS[(listIndex + itemIndex) % TASK_WORDS.length]} ${
    TASK_OBJECTS[(listIndex * 3 + itemIndex) % TASK_OBJECTS.length]
  }`,
  checked: (listIndex + itemIndex) % 7 === 0,
})

const createFixtureList = (listIndex: number, tasksPerList: number): ListBlock => ({
  id: `list-${listIndex}`,
  kind: 'list',
  title: `${TITLE_WORDS[listIndex % TITLE_WORDS.length]} ${listIndex + 1}`,
  items: Array.from({ length: tasksPerList }, (_, itemIndex) =>
    createFixtureItem(listIndex, itemIndex),
  ),
})

export const createProfileDocument = ({
  lists,
  tasksPerList,
}: ProfileDocumentOptions): TodoDocument => ({
  version: 1,
  date: '2026-01-05',
  showDate: true,
  showPanelNumbers: true,
  typography: 'latin',
  blocks: Array.from({ length: lists }, (_, listIndex) =>
    createFixtureList(listIndex, tasksPerList),
  ),
})
