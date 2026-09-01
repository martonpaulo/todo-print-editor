// The blocked print action reaches a list card from outside the editor, and the
// card describes itself with its own overflow note, so both element ids are
// derived in one place instead of being spelled out at each call site.
export const listCardId = (blockId: string) => `list-card-${blockId}`

export const listOverflowNoteId = (blockId: string) => `list-overflow-${blockId}`
