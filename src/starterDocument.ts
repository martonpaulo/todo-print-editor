import { COPY } from './copy'
import { createDocument, createList, createPanelBreak } from './domain/document'
import type { TodoDocument } from './domain/types'

/**
 * The composition boundary between the two owners the starter document needs: `src/domain/document`
 * owns the structure of a persisted document, and `src/copy` owns every visible word. Neither
 * imports the other, so starter wording changes here and nowhere in the document model.
 */
export const createStarterDocument = (): TodoDocument =>
  createDocument([
    createList(COPY.starter.priorities, COPY.starter.priorityItems),
    createList(COPY.starter.smallWins, COPY.starter.smallWinItems),
    createPanelBreak(),
    createList(COPY.starter.work, COPY.starter.workItems),
    createPanelBreak(),
    createList(COPY.starter.personal, COPY.starter.personalItems),
  ])
