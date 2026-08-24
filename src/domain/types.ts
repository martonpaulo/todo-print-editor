export interface TodoItem {
  id: string
  text: string
  checked: boolean
}

export interface ListBlock {
  id: string
  kind: 'list'
  title: string
  items: TodoItem[]
}

export interface PanelBreakBlock {
  id: string
  kind: 'panel-break'
}

export type DocumentBlock = ListBlock | PanelBreakBlock

export interface TodoDocument {
  version: 1
  date: string
  showDate: boolean
  showPanelNumbers: boolean
  blocks: DocumentBlock[]
}

export interface MarkdownError {
  line: number
  message: string
}

export interface MarkdownParseResult {
  document: TodoDocument
  errors: MarkdownError[]
}

export const isListBlock = (block: DocumentBlock): block is ListBlock =>
  block.kind === 'list'
