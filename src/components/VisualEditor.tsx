import type { KeyboardEvent } from 'react'
import { COPY } from '../copy'
import { createList, createPanelBreak, createTodoItem } from '../domain/document'
import type { ListBlock, TodoDocument, TodoItem } from '../domain/types'
import { Icon } from './Icon'

interface VisualEditorProps {
  document: TodoDocument
  overflowListIds: string[]
  onChange: (document: TodoDocument) => void
}

const focusElement = (elementId: string) => {
  requestAnimationFrame(() => {
    document.getElementById(elementId)?.focus()
  })
}

const focusItem = (itemId: string) => focusElement(`item-${itemId}`)

export const VisualEditor = ({
  document,
  overflowListIds,
  onChange,
}: VisualEditorProps) => {
  const updateBlock = (blockId: string, update: (block: ListBlock) => ListBlock) => {
    onChange({
      ...document,
      blocks: document.blocks.map((block) =>
        block.id === blockId && block.kind === 'list' ? update(block) : block,
      ),
    })
  }

  const removeBlock = (blockId: string) => {
    onChange({
      ...document,
      blocks: document.blocks.filter((block) => block.id !== blockId),
    })
  }

  const moveBlock = (blockId: string, direction: -1 | 1) => {
    const index = document.blocks.findIndex((block) => block.id === blockId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= document.blocks.length) return

    const blocks = [...document.blocks]
    ;[blocks[index], blocks[target]] = [blocks[target], blocks[index]]
    onChange({ ...document, blocks })
  }

  const updateItem = (listId: string, itemId: string, update: (item: TodoItem) => TodoItem) => {
    updateBlock(listId, (list) => ({
      ...list,
      items: list.items.map((item) => (item.id === itemId ? update(item) : item)),
    }))
  }

  const addItemAfter = (listId: string, itemId?: string) => {
    const item = createTodoItem()
    updateBlock(listId, (list) => {
      const index = itemId ? list.items.findIndex((entry) => entry.id === itemId) + 1 : list.items.length
      const items = [...list.items]
      items.splice(index, 0, item)
      return { ...list, items }
    })
    focusItem(item.id)
  }

  const removeItem = (listId: string, itemId: string, focusId?: string) => {
    updateBlock(listId, (list) => ({
      ...list,
      items: list.items.filter((item) => item.id !== itemId),
    }))
    focusElement(focusId ? `item-${focusId}` : `add-task-${listId}`)
  }

  const listNumbers = new Map(
    document.blocks
      .filter((block) => block.kind === 'list')
      .map((block, index) => [block.id, index + 1]),
  )

  return (
    <div className="visual-editor">
      <div className="block-stack">
        {document.blocks.map((block, blockIndex) => {
          if (block.kind === 'panel-break') {
            return (
              <div className="panel-break-card" key={block.id}>
                <div className="panel-break-card__rule" />
                <div className="panel-break-card__content">
                  <Icon name="panel" />
                  <div>
                    <strong>{COPY.panelBreak}</strong>
                    <span>{COPY.panelBreakDescription}</span>
                  </div>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={COPY.removePanelBreak}
                    title={COPY.removePanelBreak}
                    onClick={() => removeBlock(block.id)}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
                <div className="panel-break-card__rule" />
              </div>
            )
          }

          const currentListNumber = listNumbers.get(block.id) ?? 1
          const listContext = COPY.listContext(currentListNumber, block.title)
          const isOverflowing = overflowListIds.includes(block.id)

          return (
            <section
              className={`list-card${isOverflowing ? ' list-card--overflow' : ''}`}
              key={block.id}
              aria-label={listContext}
            >
              <header className="list-card__header">
                <span className="eyebrow">{COPY.listNumber(currentListNumber, listNumbers.size)}</span>
                <div className="list-card__actions">
                  <button
                    className="icon-button"
                    type="button"
                    disabled={blockIndex === 0}
                    aria-label={COPY.moveListUpLabel(listContext)}
                    title={COPY.moveListUp}
                    onClick={() => moveBlock(block.id, -1)}
                  >
                    <Icon name="arrow-up" size={16} />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    disabled={blockIndex === document.blocks.length - 1}
                    aria-label={COPY.moveListDownLabel(listContext)}
                    title={COPY.moveListDown}
                    onClick={() => moveBlock(block.id, 1)}
                  >
                    <Icon name="arrow-down" size={16} />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={COPY.removeListLabel(listContext)}
                    title={COPY.removeList}
                    onClick={() => removeBlock(block.id)}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              </header>

              <label className="sr-only" htmlFor={`title-${block.id}`}>
                {COPY.listTitleLabel(listContext)}
              </label>
              <input
                id={`title-${block.id}`}
                className="list-card__title-input"
                value={block.title}
                placeholder={COPY.untitledList}
                onChange={(event) =>
                  updateBlock(block.id, (list) => ({ ...list, title: event.target.value }))
                }
              />

              <div className="task-editor-list">
                {block.items.map((item, itemIndex) => {
                  const taskContext = COPY.taskContext(itemIndex + 1, item.text)

                  return (
                    <div className="task-editor-row" key={item.id}>
                      {/* The label wraps the checkbox alone so the row-height hit
                          target never swallows pointer events meant for the text
                          field or the remove button. */}
                      <label className="task-editor-row__checkbox-label">
                        <input
                          className="task-editor-row__checkbox"
                          type="checkbox"
                          checked={item.checked}
                          onChange={(event) =>
                            updateItem(block.id, item.id, (entry) => ({
                              ...entry,
                              checked: event.target.checked,
                            }))
                          }
                        />
                        <span className="sr-only">
                          {COPY.taskCompleteLabel(taskContext, listContext)}
                        </span>
                      </label>
                      <label className="sr-only" htmlFor={`item-${item.id}`}>
                        {COPY.taskTextLabel(taskContext, listContext)}
                      </label>
                      <input
                        id={`item-${item.id}`}
                        className="task-editor-row__input"
                        value={item.text}
                        placeholder={COPY.taskPlaceholder}
                        onChange={(event) =>
                          updateItem(block.id, item.id, (entry) => ({
                            ...entry,
                            text: event.target.value,
                          }))
                        }
                        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            addItemAfter(block.id, item.id)
                          }

                          if (event.key === 'Backspace' && !item.text && block.items.length > 1) {
                            event.preventDefault()
                            removeItem(
                              block.id,
                              item.id,
                              block.items[itemIndex - 1]?.id ?? block.items[itemIndex + 1]?.id,
                            )
                          }
                        }}
                      />
                      <button
                        className="icon-button icon-button--quiet"
                        type="button"
                        aria-label={COPY.removeTaskLabel(taskContext, listContext)}
                        title={COPY.removeTask}
                        onClick={() =>
                          removeItem(
                            block.id,
                            item.id,
                            block.items[itemIndex - 1]?.id ?? block.items[itemIndex + 1]?.id,
                          )
                        }
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                  )
                })}
              </div>

              <button
                id={`add-task-${block.id}`}
                className="text-button"
                type="button"
                aria-label={COPY.addTaskLabel(listContext)}
                onClick={() => addItemAfter(block.id)}
              >
                <Icon name="plus" size={16} />
                {COPY.addTask}
              </button>
            </section>
          )
        })}
      </div>

      <div className="editor-add-actions">
        <button
          className="secondary-button"
          type="button"
          onClick={() => onChange({ ...document, blocks: [...document.blocks, createList()] })}
        >
          <Icon name="plus" />
          {COPY.addList}
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => onChange({ ...document, blocks: [...document.blocks, createPanelBreak()] })}
        >
          <Icon name="panel" />
          {COPY.addPanel}
        </button>
      </div>
    </div>
  )
}
