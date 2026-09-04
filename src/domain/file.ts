import { serializeMarkdown } from './markdown'
import type { TodoDocument } from './types'

/**
 * Taking a document out of the browser, and bringing one back in.
 *
 * The file is an export, never a second source of truth: `localStorage` stays canonical, and an
 * import is an ordinary document edit the history can undo. The Markdown written here is exactly
 * the source the Markdown view shows, so a round trip through a file changes nothing the editor
 * would not have changed itself.
 */

export const MARKDOWN_MIME_TYPE = 'text/markdown'

/**
 * What the file picker offers. The extension is listed beside the media type because Chromium
 * reports no media type for `.md` on several platforms, and a media type alone would then hide
 * every exported file from the picker.
 */
export const MARKDOWN_FILE_ACCEPT = '.md,text/markdown'

/**
 * The document date names the file, so exports of successive days sort by name and never
 * overwrite each other. The date is stored whether or not it is printed, so a document with the
 * date hidden still gets a stable name instead of an undated one.
 */
export const markdownFileName = (document: TodoDocument): string => `todo-${document.date}.md`

/** The exported bytes: the editor's own Markdown source, newline-terminated as text files are. */
export const markdownFileContent = (document: TodoDocument): string => {
  const source = serializeMarkdown(document)
  return source ? `${source}\n` : ''
}

/**
 * Hands the text to the browser as a download. The object URL owns a copy of the blob until it is
 * revoked, so it is released on the next frame — immediately after the click, Chromium may not
 * have started reading it yet.
 */
export const downloadTextFile = (name: string, text: string, mimeType: string): void => {
  const url = URL.createObjectURL(new Blob([text], { type: `${mimeType};charset=utf-8` }))
  const link = window.document.createElement('a')
  link.href = url
  link.download = name
  link.rel = 'noopener'
  window.document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * Reads a chosen file as text. A file the browser cannot read — removed, unreadable, or denied
 * between the choice and the read — rejects, and the caller reports it rather than replacing the
 * document with nothing.
 */
export const readTextFile = (file: Blob): Promise<string> => file.text()
