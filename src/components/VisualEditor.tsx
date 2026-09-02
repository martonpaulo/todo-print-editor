import type { KeyboardEvent } from 'react'
import { COPY } from '../copy'
import { createList, createPanelBreak, createTodoItem } from '../domain/document'
import {
  appendBlock,
  insertItemAfter,
  moveBlock,
  removeBlock,
  removeItem,
  setItemChecked,
  updateItemText,
  updateListTitle,
} from '../domain/mutations'
import type { TodoDocument } from '../domain/types'
import type { DocumentEdit } from '../hooks/usePersistentDocument'
import { Icon } from './Icon'
import { listCardId, listOverflowNoteId } from './elementIds'

interface VisualEditorProps {
  document: TodoDocument
  overflowListIds: string[]
  onChange: (document: TodoDocument, edit?: DocumentEdit) => void
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
  // The domain owns the document rules; this component decides which rule an
  // event means, where focus lands afterwards, and suppresses a change that
  // rewrote nothing so the document history records only real edits. A
  // destructive rule also names what it removed, so the recovery affordance is
  // built from the same context string as the control's accessible name; this
  // component keeps no deletion buffer of its own.
  const apply = (next: TodoDocument, edit?: DocumentEdit) => {
    if (next === document) return
    onChange(next, edit)
  }

  const addItemAfter = (listId: string, itemId?: string) => {
    const item = createTodoItem()
    apply(insertItemAfter(document, listId, item, itemId))
    focusItem(item.id)
  }

  const deleteItem = (listId: string, itemId: string, subject: string, focusId?: string) => {
    apply(removeItem(document, listId, itemId), { kind: 'task-removed', subject })
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
                    onClick={() =>
                      apply(removeBlock(document, block.id), { kind: 'panel-break-removed' })
                    }
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
              id={listCardId(block.id)}
              aria-label={listContext}
              // An overflowing card is the target the blocked print action sends
              // the user to, so it must accept programmatic focus and announce
              // the local correction as its description.
              tabIndex={isOverflowing ? -1 : undefined}
              aria-describedby={isOverflowing ? listOverflowNoteId(block.id) : undefined}
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
                    onClick={() => apply(moveBlock(document, block.id, -1))}
                  >
                    <Icon name="arrow-up" size={16} />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    disabled={blockIndex === document.blocks.length - 1}
                    aria-label={COPY.moveListDownLabel(listContext)}
                    title={COPY.moveListDown}
                    onClick={() => apply(moveBlock(document, block.id, 1))}
                  >
                    <Icon name="arrow-down" size={16} />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={COPY.removeListLabel(listContext)}
                    title={COPY.removeList}
                    onClick={() =>
                      apply(removeBlock(document, block.id), {
                        kind: 'list-removed',
                        subject: listContext,
                      })
                    }
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              </header>

              {isOverflowing && (
                <p className="list-card__overflow-note" id={listOverflowNoteId(block.id)}>
                  <Icon name="warning" size={16} />
                  {COPY.listOverflow}
                </p>
              )}

              <label className="sr-only" htmlFor={`title-${block.id}`}>
                {COPY.listTitleLabel(listContext)}
              </label>
              <input
                id={`title-${block.id}`}
                className="list-card__title-input"
                value={block.title}
                placeholder={COPY.untitledList}
                onChange={(event) =>
                  apply(updateListTitle(document, block.id, event.target.value))
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
                            apply(setItemChecked(document, block.id, item.id, event.target.checked))
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
                          apply(updateItemText(document, block.id, item.id, event.target.value))
                        }
                        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            addItemAfter(block.id, item.id)
                          }

                          if (event.key === 'Backspace' && !item.text && block.items.length > 1) {
                            event.preventDefault()
                            deleteItem(
                              block.id,
                              item.id,
                              taskContext,
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
                          deleteItem(
                            block.id,
                            item.id,
                            taskContext,
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
          onClick={() => apply(appendBlock(document, createList()))}
        >
          <Icon name="plus" />
          {COPY.addList}
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => apply(appendBlock(document, createPanelBreak()))}
        >
          <Icon name="panel" />
          {COPY.addPanel}
        </button>
      </div>
    </div>
  )
}
