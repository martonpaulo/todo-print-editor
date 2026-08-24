# Todo Print Editor

Todo Print Editor is a local-first React editor for designing structured checklists and printing them as exact A4 landscape layouts.

## Who it is for

It is for someone who plans digitally but wants a clear, compact paper checklist without manually arranging columns in a document editor.

## The job

Create reusable todo lists quickly, see exactly how they will flow onto paper, and print them without clipped content or accidental list splits.

## What it does

- Keeps a visual editor and a supported Markdown subset synchronized.
- Lays out three `99mm × 210mm` panels on each `297mm × 210mm` A4 landscape page.
- Moves an entire list to the next panel when it does not fit; a list is never split.
- Blocks printing when one list is taller than an empty panel.
- Shows an optional `en-US` date on the first panel and optional numbering on every panel.
- Saves the document only in the current browser and restores it after reload.
- Opens the browser print dialog with print CSS for A4 landscape, zero page margins, and physical millimeter dimensions.

## Non-goals

- **Accounts, cloud sync, or collaboration:** document content must remain local and private.
- **Backend services or analytics:** they add data sharing and operations without helping the print workflow.
- **Multiple routes or a marketing site:** the editor is the whole product.
- **Search indexing:** the public URL is a utility surface, not discoverable content, so it uses `noindex` and a restrictive `robots.txt`.
- **General-purpose Markdown or rich text:** only dates, list headings, checklist items, and explicit panel breaks are supported so visual round-tripping stays predictable.
- **Automatic font scaling or list splitting:** both would hide layout problems and compromise the paper contract.
- **Public versions, tags, and releases:** validated `main` builds deploy continuously to GitHub Pages.

## Success

The product succeeds when a user can create or paste a checklist, reload without losing it, see atomic lists flow across panels, and print the same panel structure on A4 landscape at 100% scale. Physical printer output still depends on the browser and printer driver honoring A4, no margins, and 100% scale.

## Constraints

- React, one client-side route, and static GitHub Pages hosting.
- English (`en-US`) interface and date formatting.
- Monochrome interface and print output.
- No network request is needed after the static application loads.
- Browser storage is the canonical document store; measured pagination is a reconstructible projection.
