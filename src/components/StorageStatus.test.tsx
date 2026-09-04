import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StorageStatus } from './StorageStatus'
import { COPY } from '../copy'
import type { PersistenceStatus } from '../hooks/usePersistentDocument'

// Replacing the stored document is the only thing that leaves the load-failed
// state, and it takes the whole recovery region with it. The real hook drives
// that transition, so the test has to drive it too: asserting that the callback
// ran says nothing about where focus is once the region is gone.
const Harness = ({ resultingStatus }: { resultingStatus: PersistenceStatus }) => {
  const [status, setStatus] = useState<PersistenceStatus>('load-failed')

  return (
    <StorageStatus
      status={status}
      hasUnsavedDraft={false}
      onReplaceStoredDocument={() => setStatus(resultingStatus)}
    />
  )
}

afterEach(cleanup)

describe('StorageStatus', () => {
  it('reports the saved state in a polite live region', () => {
    render(<StorageStatus status="saved" hasUnsavedDraft={false} onReplaceStoredDocument={vi.fn()} />)

    expect(screen.getByRole('status')).toHaveTextContent(COPY.savedLocally)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(COPY.saveFailedDescription)).not.toBeInTheDocument()
  })

  it('marks a failed write as unsaved and says how to keep the work', () => {
    render(<StorageStatus status="write-failed" hasUnsavedDraft={false} onReplaceStoredDocument={vi.fn()} />)

    expect(screen.getByRole('status')).toHaveTextContent(COPY.saveFailed)
    expect(screen.getByText(COPY.saveFailedDescription)).toBeInTheDocument()
    // A failed write needs no recovery decision; the draft is still the newest copy.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('announces a load failure assertively, takes focus, and offers the explicit replacement', async () => {
    const onReplaceStoredDocument = vi.fn()
    render(<StorageStatus status="load-failed" hasUnsavedDraft={false} onReplaceStoredDocument={onReplaceStoredDocument} />)

    const recovery = screen.getByRole('alert')
    expect(recovery).toHaveAccessibleName(COPY.loadFailedTitle)
    expect(recovery).toHaveTextContent(COPY.loadFailedDescription)
    expect(recovery).toHaveFocus()

    // The load failure must not read as saved either.
    expect(screen.getByRole('status')).toHaveTextContent(COPY.saveFailed)

    // Overwriting the stored copy is destructive and no undo reaches it, so it
    // asks before it runs.
    await userEvent.click(screen.getByRole('button', { name: COPY.replaceStoredDocument }))
    expect(onReplaceStoredDocument).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: COPY.cancelReplaceStoredDocument }))
    expect(onReplaceStoredDocument).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: COPY.replaceStoredDocument }))
    const confirm = screen.getByRole('button', { name: COPY.confirmReplacement })
    expect(confirm).toHaveFocus()
    await userEvent.click(confirm)
    expect(onReplaceStoredDocument).toHaveBeenCalledTimes(1)
  })

  it('hands focus to the resulting state line when the replacement completes', async () => {
    render(<Harness resultingStatus="saved" />)

    await userEvent.click(screen.getByRole('button', { name: COPY.replaceStoredDocument }))
    await userEvent.click(screen.getByRole('button', { name: COPY.confirmReplacement }))

    // The recovery region and the button that held focus are both gone, so the
    // state line the action produced is what receives it.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    const state = screen.getByRole('status')
    expect(state).toHaveTextContent(COPY.savedLocally)
    await waitFor(() => expect(state).toHaveFocus())
  })

  it('hands focus to the same line when the replacement is refused by storage', async () => {
    render(<Harness resultingStatus="write-failed" />)

    await userEvent.click(screen.getByRole('button', { name: COPY.replaceStoredDocument }))
    await userEvent.click(screen.getByRole('button', { name: COPY.confirmReplacement }))

    const state = screen.getByRole('status')
    expect(state).toHaveTextContent(COPY.saveFailed)
    expect(screen.getByText(COPY.saveFailedDescription)).toBeInTheDocument()
    await waitFor(() => expect(state).toHaveFocus())
  })

  it('keeps focus on the recovery action when the failure state survives', async () => {
    render(<Harness resultingStatus="load-failed" />)

    await userEvent.click(screen.getByRole('button', { name: COPY.replaceStoredDocument }))
    await userEvent.click(screen.getByRole('button', { name: COPY.confirmReplacement }))

    // The region is still on screen, so the control the user would reach for
    // next is the one they just used, not the state line behind it.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: COPY.replaceStoredDocument })).toHaveFocus(),
    )
  })

  it('claims no save while an editor draft is waiting outside the model', () => {
    render(<StorageStatus status="saved" hasUnsavedDraft onReplaceStoredDocument={vi.fn()} />)

    // Storage holds the last valid document, but the source on screen is newer.
    expect(screen.getByRole('status')).toHaveTextContent(COPY.saveFailed)
    expect(screen.getByText(COPY.draftNotSavedDescription)).toBeInTheDocument()
  })

  it('keeps the refused write as the reported cause when a draft is also open', () => {
    render(<StorageStatus status="write-failed" hasUnsavedDraft onReplaceStoredDocument={vi.fn()} />)

    expect(screen.getByText(COPY.saveFailedDescription)).toBeInTheDocument()
    expect(screen.queryByText(COPY.draftNotSavedDescription)).not.toBeInTheDocument()
  })

  it('claims nothing before the first write has been attempted', () => {
    const { container } = render(
      <StorageStatus status="unwritten" hasUnsavedDraft={false} onReplaceStoredDocument={vi.fn()} />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('stays out of the printed page', () => {
    const { container } = render(
      <StorageStatus status="saved" hasUnsavedDraft={false} onReplaceStoredDocument={vi.fn()} />,
    )

    expect(container.querySelector('.storage-status')).toHaveClass('screen-only')
  })
})
