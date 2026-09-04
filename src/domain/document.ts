import type {
  DocumentBlock,
  ListBlock,
  PanelBreakBlock,
  TodoDocument,
  TodoItem,
} from './types'

export const createId = (prefix: string): string => {
  const value = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
  return `${prefix}-${value}`
}

export const getLocalIsoDate = (date = new Date()): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const createTodoItem = (text = ''): TodoItem => ({
  id: createId('item'),
  text,
  checked: false,
})

// Structural factories carry no wording: callers choose the persisted title, including an empty
// title for an untitled list, so `src/copy.ts` never participates in building the model. `items`
// defaults to one empty task because an editable list always has a row.
export const createList = (title: string, items: readonly string[] = ['']): ListBlock => ({
  id: createId('list'),
  kind: 'list',
  title,
  items: items.map(createTodoItem),
})

export const createPanelBreak = (): PanelBreakBlock => ({
  id: createId('break'),
  kind: 'panel-break',
})

export const createDocument = (blocks: DocumentBlock[]): TodoDocument => ({
  version: 1,
  date: getLocalIsoDate(),
  showDate: true,
  showPanelNumbers: true,
  typography: 'latin',
  rotatePrint: false,
  blocks,
})
