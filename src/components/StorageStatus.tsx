import { useEffect, useRef, useState } from 'react'
import { COPY } from '../copy'
import { Icon } from './Icon'
import type { PersistenceStatus } from '../hooks/usePersistentDocument'

interface StorageStatusProps {
  status: PersistenceStatus
  /**
   * An editor draft that the document model has not accepted yet, so it cannot
   * have been persisted whatever the storage state says. An invalid Markdown
   * source is the one source of this today.
   */
  hasUnsavedDraft: boolean
  onReplaceStoredDocument: () => void
}

/**
 * The single place that says whether the visible document is the one browser
 * storage holds. It is screen-only: a printed page carries no editor state.
 */
export const StorageStatus = ({
  status,
  hasUnsavedDraft,
  onReplaceStoredDocument,
}: StorageStatusProps) => {
  const recoveryRef = useRef<HTMLDivElement | null>(null)
  const replaceRef = useRef<HTMLButtonElement | null>(null)
  // Replacing the stored document destroys the only copy of it, so the action
  // asks in place before it runs.
  const [confirmingReplace, setConfirmingReplace] = useState(false)

  // A load failure is the one state the user must act on before the document is
  // stored again, so the recovery region takes focus once, when it appears.
  useEffect(() => {
    if (status === 'load-failed') recoveryRef.current?.focus()
  }, [status])

  // Nothing has been written yet, so there is nothing to claim in either
  // direction; the first write settles it within the same mount.
  if (status === 'unwritten') return null

  // A save is claimed only when storage holds the document *and* no editor draft
  // is waiting outside the model.
  const saved = status === 'saved' && !hasUnsavedDraft

  return (
    <div className="storage-status screen-only">
      {/* The text changes only when persistence changes, so the polite live
          region stays silent while the user types. */}
      <p
        className={`storage-status__state${saved ? '' : ' storage-status__state--failed'}`}
        role="status"
      >
        <Icon name={saved ? 'check' : 'warning'} size={16} />
        <span>{saved ? COPY.savedLocally : COPY.saveFailed}</span>
      </p>

      {/* A refused write is the more urgent of the two, so it keeps the detail
          line when an invalid draft is also open. */}
      {status === 'write-failed' && (
        <p className="storage-status__detail">{COPY.saveFailedDescription}</p>
      )}

      {status === 'saved' && hasUnsavedDraft && (
        <p className="storage-status__detail">{COPY.draftNotSavedDescription}</p>
      )}

      {status === 'load-failed' && (
        <div
          className="storage-status__recovery"
          role="alert"
          tabIndex={-1}
          ref={recoveryRef}
          aria-labelledby="storage-recovery-title"
        >
          <Icon name="warning" />
          <div>
            <strong id="storage-recovery-title">{COPY.loadFailedTitle}</strong>
            <span>{COPY.loadFailedDescription}</span>
            {confirmingReplace ? (
              <div
                className="confirm-action"
                role="group"
                aria-label={COPY.confirmReplaceStoredDocument}
              >
                <span className="confirm-action__question">
                  {COPY.confirmReplaceStoredDocument}
                </span>
                <button
                  className="confirm-action__accept"
                  type="button"
                  // The question replaces the control that raised it, so focus
                  // follows it rather than falling out of the alert.
                  autoFocus
                  onClick={() => {
                    setConfirmingReplace(false)
                    onReplaceStoredDocument()
                  }}
                >
                  {COPY.confirmReplacement}
                </button>
                <button
                  className="confirm-action__decline"
                  type="button"
                  aria-label={COPY.cancelReplaceStoredDocument}
                  onClick={() => {
                    setConfirmingReplace(false)
                    requestAnimationFrame(() => replaceRef.current?.focus())
                  }}
                >
                  {COPY.cancelReplacement}
                </button>
              </div>
            ) : (
              <button
                ref={replaceRef}
                className="secondary-button"
                type="button"
                onClick={() => setConfirmingReplace(true)}
              >
                {COPY.replaceStoredDocument}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
