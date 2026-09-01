import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { COPY } from '../copy'
import type { TodoDocument } from '../domain/types'
import { VisualEditor } from './VisualEditor'

const buildDocument = (): TodoDocument => ({
  version: 1,
  date: '2026-01-01',
  showDate: true,
  showPanelNumbers: true,
  blocks: [
    {
      id: 'list-a',
      kind: 'list',
      title: 'Work',
      items: [
        { id: 'item-a1', text: 'Draft', checked: false },
        { id: 'item-a2', text: '', checked: false },
      ],
    },
    {
      id: 'list-b',
      kind: 'list',
      // The duplicate title proves the position keeps the names distinct.
      title: 'Work',
      items: [{ id: 'item-b1', text: 'Draft', checked: true }],
    },
    {
      id: 'list-c',
      kind: 'list',
      title: '   ',
      items: [{ id: 'item-c1', text: 'Only task', checked: false }],
    },
  ],
})

const renderEditor = (document = buildDocument()) => {
  const onChange = vi.fn()
  render(<VisualEditor document={document} overflowListIds={[]} onChange={onChange} />)
  return { document, onChange }
}

describe('VisualEditor accessible names', () => {
  afterEach(cleanup)

  it('names every list section by position, including duplicate and empty titles', () => {
    renderEditor()

    expect(screen.getByRole('region', { name: 'List 1: Work' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'List 2: Work' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'List 3' })).toBeInTheDocument()
  })

  it('gives every repeated list control the affected list as context', () => {
    renderEditor()

    expect(screen.getByRole('textbox', { name: 'Title of List 2: Work' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Move List 2: Work up' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Move List 2: Work down' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove List 2: Work' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add task to List 2: Work' })).toBeInTheDocument()
  })

  it('gives every task control both task and list context, with a position fallback', () => {
    renderEditor()

    expect(
      screen.getByRole('textbox', { name: 'Task 1: Draft in List 1: Work' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('checkbox', { name: 'Mark Task 1: Draft in List 1: Work complete' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Remove Task 1: Draft from List 1: Work' }),
    ).toBeInTheDocument()

    // The same task text in another list stays distinguishable.
    expect(
      screen.getByRole('checkbox', { name: 'Mark Task 1: Draft in List 2: Work complete' }),
    ).toBeInTheDocument()

    // An empty task falls back to its position instead of an empty name.
    expect(screen.getByRole('textbox', { name: 'Task 2 in List 1: Work' })).toBeInTheDocument()
  })

  it('keeps the first list move-up and last block move-down buttons disabled', () => {
    renderEditor()

    expect(screen.getByRole('button', { name: 'Move List 1: Work up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move List 3 down' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move List 2: Work up' })).toBeEnabled()
  })

  it('keeps focus on the edited title while its contextual name changes', async () => {
    const user = userEvent.setup()
    const document = buildDocument()
    const onChange = vi.fn()
    const { rerender } = render(
      <VisualEditor document={document} overflowListIds={[]} onChange={onChange} />,
    )

    const title = screen.getByRole('textbox', { name: 'Title of List 1: Work' })
    await user.click(title)
    await user.keyboard('s')

    expect(onChange).toHaveBeenCalled()
    const next = onChange.mock.calls.at(-1)?.[0] as TodoDocument
    rerender(<VisualEditor document={next} overflowListIds={[]} onChange={onChange} />)

    const renamed = screen.getByRole('textbox', { name: /^Title of List 1: /u })
    expect(renamed).toHaveFocus()
    expect(renamed).toBe(title)
  })
})

describe('VisualEditor checkbox target', () => {
  afterEach(cleanup)

  it('toggles the checkbox from its dedicated row-height label', async () => {
    const user = userEvent.setup()
    const { onChange } = renderEditor()

    const checkbox = screen.getByRole('checkbox', {
      name: 'Mark Task 1: Draft in List 1: Work complete',
    })
    const target = checkbox.closest('label')
    expect(target).toHaveClass('task-editor-row__checkbox-label')

    await user.click(target as HTMLLabelElement)

    const next = onChange.mock.calls.at(-1)?.[0] as TodoDocument
    const list = next.blocks[0]
    expect(list.kind === 'list' && list.items[0]).toMatchObject({
      id: 'item-a1',
      checked: true,
    })
  })

  it('leaves the task text field and remove button outside the checkbox target', async () => {
    const user = userEvent.setup()
    const { onChange } = renderEditor()

    const text = screen.getByRole('textbox', { name: 'Task 1: Draft in List 1: Work' })
    expect(text.closest('label')).toBeNull()
    await user.click(text)
    expect(text).toHaveFocus()
    expect(onChange).not.toHaveBeenCalled()

    const remove = screen.getByRole('button', { name: 'Remove Task 1: Draft from List 1: Work' })
    expect(remove.closest('label')).toBeNull()
    await user.click(remove)

    const next = onChange.mock.calls.at(-1)?.[0] as TodoDocument
    const list = next.blocks[0]
    expect(list.kind === 'list' && list.items.map((item) => item.id)).toEqual(['item-a2'])
  })
})

describe('centralized contextual copy', () => {
  it('falls back to positions for blank titles and tasks', () => {
    expect(COPY.listContext(4, '  ')).toBe('List 4')
    expect(COPY.taskContext(2, '')).toBe('Task 2')
    expect(COPY.listContext(1, ' Work ')).toBe('List 1: Work')
    expect(COPY.taskContext(3, ' Draft ')).toBe('Task 3: Draft')
  })
})
