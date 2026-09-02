import { useEffect, useRef } from 'react'
import { COPY } from '../copy'
import { Icon } from './Icon'
import type { PersistenceStatus } from '../hooks/usePersistentDocument'

interface StorageStatusProps {
  status: PersistenceStatus
  onReplaceStoredDocument: () => void
}

/**
 * The single place that says whether the visible document is the one browser
 * storage holds. It is screen-only: a printed page carries no editor state.
 */
export const StorageStatus = ({ status, onReplaceStoredDocument }: StorageStatusProps) => {
  const recoveryRef = useRef<HTMLDivElement | null>(null)

  // A load failure is the one state the user must act on before the document is
  // stored again, so the recovery region takes focus once, when it appears.
  useEffect(() => {
    if (status === 'load-failed') recoveryRef.current?.focus()
  }, [status])

  const saved = status === 'saved'

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

      {status === 'write-failed' && (
        <p className="storage-status__detail">{COPY.saveFailedDescription}</p>
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
            <button className="secondary-button" type="button" onClick={onReplaceStoredDocument}>
              {COPY.replaceStoredDocument}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
