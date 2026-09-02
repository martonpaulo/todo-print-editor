import { COPY } from '../copy'
import type { ListBlock, PanelBreakBlock, TodoDocument, TodoItem } from './types'

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

export const createList = (
  title: string = COPY.untitledList,
  items: string[] = [''],
): ListBlock => ({
  id: createId('list'),
  kind: 'list',
  title,
  items: items.map(createTodoItem),
})

export const createPanelBreak = (): PanelBreakBlock => ({
  id: createId('break'),
  kind: 'panel-break',
})

export const createStarterDocument = (): TodoDocument => ({
  version: 1,
  date: getLocalIsoDate(),
  showDate: true,
  showPanelNumbers: true,
  typography: 'latin',
  blocks: [
    createList(COPY.starter.priorities, [...COPY.starter.priorityItems]),
    createList(COPY.starter.smallWins, [...COPY.starter.smallWinItems]),
    createPanelBreak(),
    createList(COPY.starter.work, [...COPY.starter.workItems]),
    createPanelBreak(),
    createList(COPY.starter.personal, [...COPY.starter.personalItems]),
  ],
})
