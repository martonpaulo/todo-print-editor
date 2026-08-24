import { useCallback, useState } from 'react'
import { createStarterDocument } from '../domain/document'
import { decodeDocument } from '../domain/storage'
import type { TodoDocument } from '../domain/types'

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

  const setDocument = useCallback((nextDocument: TodoDocument) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextDocument))
      setState({ document: nextDocument, storageError: false })
    } catch {
      setState({ document: nextDocument, storageError: true })
    }
  }, [])

  return { ...state, setDocument }
}
