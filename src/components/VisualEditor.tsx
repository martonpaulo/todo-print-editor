import { useState, type KeyboardEvent } from 'react'
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

// A confirmation replaces the control that opened it, so declining has to put
// focus back on an element that exists again only after the next render. The
// id is derived from the same target the pending removal names.
type PendingRemoval = { kind: 'list' | 'task'; id: string }

const removeControlId = ({ kind, id }: PendingRemoval) => `remove-${kind}-${id}`

// Removing the last list leaves nothing in the stack to hold focus, so the
// action that rebuilds one is the landing point.
const ADD_LIST_ID = 'add-list'

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
  //
  // Only one removal is ever awaiting confirmation: opening a second question
  // answers the first with a decline, which is what the user is doing by
  // reaching for another control instead of this one.
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null)

  const apply = (next: TodoDocument, edit?: DocumentEdit) => {
    setPendingRemoval(null)
    if (next === document) return
    onChange(next, edit)
  }

  const isConfirming = (kind: PendingRemoval['kind'], id: string) =>
    pendingRemoval?.kind === kind && pendingRemoval.id === id

  const cancelRemoval = (target: PendingRemoval) => {
    setPendingRemoval(null)
    focusElement(removeControlId(target))
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

  // A confirmed removal unmounts the button that was holding focus, so the
  // caret lands on the neighbouring list the way a removed task lands on its
  // neighbouring row. Only lists carry a title field, so the panel breaks
  // between them are not candidates.
  const deleteList = (blockId: string, subject: string) => {
    const lists = document.blocks.filter((block) => block.kind === 'list')
    const removedIndex = lists.findIndex((block) => block.id === blockId)
    const neighbour = lists[removedIndex + 1] ?? lists[removedIndex - 1]

    apply(removeBlock(document, blockId), { kind: 'list-removed', subject })
    focusElement(neighbour ? `title-${neighbour.id}` : ADD_LIST_ID)
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
                  {isConfirming('list', block.id) ? (
                    <div className="confirm-action" role="group" aria-label={COPY.confirmRemoveList}>
                      <span className="confirm-action__question">{COPY.confirmRemoveList}</span>
                      <button
                        className="confirm-action__accept"
                        type="button"
                        // The question replaces the control that raised it, so
                        // focus follows it rather than falling to the body.
                        autoFocus
                        aria-label={COPY.confirmRemoveListLabel(listContext)}
                        onClick={() => deleteList(block.id, listContext)}
                      >
                        {COPY.confirmRemoval}
                      </button>
                      <button
                        className="confirm-action__decline"
                        type="button"
                        aria-label={COPY.cancelRemoveListLabel(listContext)}
                        onClick={() => cancelRemoval({ kind: 'list', id: block.id })}
                      >
                        {COPY.cancelRemoval}
                      </button>
                    </div>
                  ) : (
                    <>
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
                        id={removeControlId({ kind: 'list', id: block.id })}
                        className="icon-button"
                        type="button"
                        aria-label={COPY.removeListLabel(listContext)}
                        title={COPY.removeList}
                        onClick={() => setPendingRemoval({ kind: 'list', id: block.id })}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </>
                  )}
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
                      {isConfirming('task', item.id) ? (
                        <div
                          className="confirm-action"
                          role="group"
                          aria-label={COPY.confirmRemoveTask}
                        >
                          <span className="confirm-action__question">
                            {COPY.confirmRemoveTask}
                          </span>
                          <button
                            className="confirm-action__accept"
                            type="button"
                            autoFocus
                            aria-label={COPY.confirmRemoveTaskLabel(taskContext, listContext)}
                            onClick={() =>
                              deleteItem(
                                block.id,
                                item.id,
                                taskContext,
                                block.items[itemIndex - 1]?.id ?? block.items[itemIndex + 1]?.id,
                              )
                            }
                          >
                            {COPY.confirmRemoval}
                          </button>
                          <button
                            className="confirm-action__decline"
                            type="button"
                            aria-label={COPY.cancelRemoveTaskLabel(taskContext, listContext)}
                            onClick={() => cancelRemoval({ kind: 'task', id: item.id })}
                          >
                            {COPY.cancelRemoval}
                          </button>
                        </div>
                      ) : (
                        <button
                          id={removeControlId({ kind: 'task', id: item.id })}
                          className="icon-button icon-button--quiet"
                          type="button"
                          aria-label={COPY.removeTaskLabel(taskContext, listContext)}
                          title={COPY.removeTask}
                          // A task that still holds text is written content, so
                          // its removal asks first. An empty task is not, and
                          // asking about it would put a question between the
                          // user and every discarded blank row.
                          onClick={() => {
                            if (item.text.trim()) {
                              setPendingRemoval({ kind: 'task', id: item.id })
                              return
                            }

                            deleteItem(
                              block.id,
                              item.id,
                              taskContext,
                              block.items[itemIndex - 1]?.id ?? block.items[itemIndex + 1]?.id,
                            )
                          }}
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      )}
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
          id={ADD_LIST_ID}
          className="secondary-button"
          type="button"
          onClick={() => apply(appendBlock(document, createList('')))}
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
