import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MARKDOWN_MIME_TYPE,
  downloadTextFile,
  markdownFileContent,
  markdownFileName,
  readTextFile,
} from './file'
import { parseMarkdown, serializeMarkdown } from './markdown'
import type { TodoDocument } from './types'

const document: TodoDocument = {
  version: 1,
  date: '2026-08-24',
  showDate: true,
  showPanelNumbers: false,
  typography: 'latin',
  blocks: [
    {
      id: 'list-1',
      kind: 'list',
      title: 'Today',
      items: [
        { id: 'item-1', text: 'Write the draft', checked: false },
        { id: 'item-2', text: 'Send it', checked: true },
      ],
    },
  ],
}

describe('markdownFileName', () => {
  it('names the file after the document date', () => {
    expect(markdownFileName(document)).toBe('todo-2026-08-24.md')
  })

  it('names a file for a document whose date is hidden', () => {
    expect(markdownFileName({ ...document, showDate: false })).toBe('todo-2026-08-24.md')
  })
})

describe('markdownFileContent', () => {
  it('terminates the source with a newline, as text files are', () => {
    expect(markdownFileContent(serializeMarkdown(document))).toBe(
      '# 2026-08-24\n\n## Today\n- [ ] Write the draft\n- [x] Send it\n',
    )
  })

  it('adds no second newline to a source that already ends in one', () => {
    expect(markdownFileContent('## Today\n')).toBe('## Today\n')
  })

  it('writes nothing for an empty source rather than a lone newline', () => {
    expect(markdownFileContent('')).toBe('')
  })

  // The file is the work on screen. A source the editor accepts but would have written
  // differently must survive byte for byte, rather than being rewritten on the way out.
  it('writes a valid but non-canonical source exactly as it stands', () => {
    expect(markdownFileContent('## Today\n* [X] Send it')).toBe('## Today\n* [X] Send it\n')
  })

  // While a draft has errors the document is deliberately the last valid one, so the file must
  // come from the source instead: writing the document would hand back older work.
  it('writes a source the parser rejects, unchanged', () => {
    const invalid = '### Personal\n- [ ] Call someone'
    expect(parseMarkdown(invalid, document).errors).not.toEqual([])
    expect(markdownFileContent(invalid)).toBe('### Personal\n- [ ] Call someone\n')
  })

  it('parses back into the same document it was written from', () => {
    const { document: reparsed, errors } = parseMarkdown(
      markdownFileContent(serializeMarkdown(document)),
      document,
    )

    expect(errors).toEqual([])
    expect(reparsed).toEqual(document)
  })
})

describe('downloadTextFile', () => {
  const createObjectURL = vi.fn(() => 'blob:document')
  const revokeObjectURL = vi.fn()

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    createObjectURL.mockClear()
    revokeObjectURL.mockClear()
  })

  const stubObjectUrls = () => {
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
  }

  it('clicks a download link naming the file, then removes it', () => {
    stubObjectUrls()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    downloadTextFile('todo-2026-08-24.md', '# 2026-08-24\n', MARKDOWN_MIME_TYPE)

    expect(click).toHaveBeenCalledOnce()
    const link = click.mock.instances[0] as HTMLAnchorElement
    expect(link.download).toBe('todo-2026-08-24.md')
    expect(link.href).toBe('blob:document')
    expect(link.isConnected).toBe(false)
  })

  it('releases the object URL after the click', () => {
    vi.useFakeTimers()
    stubObjectUrls()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    downloadTextFile('todo-2026-08-24.md', '# 2026-08-24\n', MARKDOWN_MIME_TYPE)
    expect(revokeObjectURL).not.toHaveBeenCalled()

    vi.runAllTimers()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:document')
    vi.useRealTimers()
  })
})

describe('readTextFile', () => {
  it('reads the chosen file as text', async () => {
    const file = new File(['## Today\n- [ ] Write the draft\n'], 'todo.md', {
      type: MARKDOWN_MIME_TYPE,
    })

    await expect(readTextFile(file)).resolves.toBe('## Today\n- [ ] Write the draft\n')
  })

  it('rejects when the browser cannot read the file', async () => {
    const unreadable = { text: () => Promise.reject(new Error('not readable')) } as unknown as Blob

    await expect(readTextFile(unreadable)).rejects.toThrow('not readable')
  })
})
