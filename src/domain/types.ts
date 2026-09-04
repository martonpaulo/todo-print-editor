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

/**
 * How rendered document content is drawn. `moon` replaces list titles and task text with the
 * geometric Moon type glyphs owned by `domain/moon.ts`; the editor's own inputs stay Latin so the
 * document remains editable.
 */
export type Typography = 'latin' | 'moon'

export interface TodoDocument {
  version: 1
  date: string
  showDate: boolean
  showPanelNumbers: boolean
  typography: Typography
  /**
   * Whether the printed sheet is imaged onto portrait paper, turned a quarter turn. A transport
   * workaround for drivers that rotate or rescale landscape media on their own, not a second
   * supported orientation: the document, its pagination and its layout stay A4 landscape, and only
   * the paper the same sheet lands on turns. Optional because documents were persisted before it
   * existed; absent reads as off.
   */
  rotatePrint?: boolean
  blocks: DocumentBlock[]
}

export type MarkdownErrorCode =
  | 'duplicate-date'
  | 'invalid-date'
  | 'task-without-list'
  | 'unsupported-heading'
  | 'unrecognized-line'

export interface MarkdownError {
  line: number
  code: MarkdownErrorCode
}

export interface MarkdownParseResult {
  document: TodoDocument
  errors: MarkdownError[]
}

export const isListBlock = (block: DocumentBlock): block is ListBlock =>
  block.kind === 'list'
