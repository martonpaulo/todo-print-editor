import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StorageStatus } from './StorageStatus'
import { COPY } from '../copy'

afterEach(cleanup)

describe('StorageStatus', () => {
  it('reports the saved state in a polite live region', () => {
    render(<StorageStatus status="saved" onReplaceStoredDocument={vi.fn()} />)

    expect(screen.getByRole('status')).toHaveTextContent(COPY.savedLocally)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(COPY.saveFailedDescription)).not.toBeInTheDocument()
  })

  it('marks a failed write as unsaved and says how to keep the work', () => {
    render(<StorageStatus status="write-failed" onReplaceStoredDocument={vi.fn()} />)

    expect(screen.getByRole('status')).toHaveTextContent(COPY.saveFailed)
    expect(screen.getByText(COPY.saveFailedDescription)).toBeInTheDocument()
    // A failed write needs no recovery decision; the draft is still the newest copy.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('announces a load failure assertively, takes focus, and offers the explicit replacement', async () => {
    const onReplaceStoredDocument = vi.fn()
    render(<StorageStatus status="load-failed" onReplaceStoredDocument={onReplaceStoredDocument} />)

    const recovery = screen.getByRole('alert')
    expect(recovery).toHaveAccessibleName(COPY.loadFailedTitle)
    expect(recovery).toHaveTextContent(COPY.loadFailedDescription)
    expect(recovery).toHaveFocus()

    // The load failure must not read as saved either.
    expect(screen.getByRole('status')).toHaveTextContent(COPY.saveFailed)

    await userEvent.click(screen.getByRole('button', { name: COPY.replaceStoredDocument }))
    expect(onReplaceStoredDocument).toHaveBeenCalledTimes(1)
  })

  it('stays out of the printed page', () => {
    const { container } = render(<StorageStatus status="saved" onReplaceStoredDocument={vi.fn()} />)

    expect(container.querySelector('.storage-status')).toHaveClass('screen-only')
  })
})
