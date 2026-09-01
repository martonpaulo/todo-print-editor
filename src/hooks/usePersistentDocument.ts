import { useCallback, useState, useRef } from 'react'
import { createStarterDocument } from '../domain/document'
import { decodeDocument } from '../domain/storage'
import type { TodoDocument } from '../domain/types'
import { recordProfileSample } from '../profiling'

const STORAGE_KEY = 'todo-print-editor.document.v1'

interface DocumentState {
  document: TodoDocument
  storageError: boolean
}

const readDocument = (): DocumentState => {
  if (typeof window === 'undefined') {
    return { document: createStarterDocument(), storageError: false }
  }

  try {
    const source = window.localStorage.getItem(STORAGE_KEY)
    if (!source) return { document: createStarterDocument(), storageError: false }

    const document = decodeDocument(JSON.parse(source))
    return document
      ? { document, storageError: false }
      : { document: createStarterDocument(), storageError: true }
  } catch {
    return { document: createStarterDocument(), storageError: true }
  }
}

export const usePersistentDocument = () => {
  const [state, setState] = useState<DocumentState>(readDocument)
  
  const history = useRef({
    past: [] as TodoDocument[],
    present: state.document,
    future: [] as TodoDocument[]
  })
  
  const lastUpdate = useRef<number>(0)

  const setDocument = useCallback((nextDocument: TodoDocument) => {
    try {
      const persistenceStart = performance.now()
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextDocument))
      recordProfileSample('persistence', performance.now() - persistenceStart)
      
      const now = Date.now()
      // Merge states if updated within 500ms
      if (now - lastUpdate.current < 500) {
        history.current.present = nextDocument
      } else {
        history.current.past.push(history.current.present)
        history.current.present = nextDocument
        history.current.future = []
      }
      lastUpdate.current = now

      setState({ document: nextDocument, storageError: false })
    } catch {
      setState({ document: nextDocument, storageError: true })
    }
  }, [])

  const undo = useCallback(() => {
    if (history.current.past.length === 0) return null
    const previous = history.current.past.pop()!
    history.current.future.push(history.current.present)
    history.current.present = previous
    return previous
  }, [])

  const redo = useCallback(() => {
    if (history.current.future.length === 0) return null
    const next = history.current.future.pop()!
    history.current.past.push(history.current.present)
    history.current.present = next
    return next
  }, [])

  return { ...state, setDocument, undo, redo }
}
