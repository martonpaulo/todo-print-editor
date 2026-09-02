# Todo Print Editor

Design structured todo lists in a visual or Markdown editor, preview atomic `99mm × 210mm` panels live, and print three panels per A4 landscape page.

**Live app:** [martonpaulo.github.io/todo-print-editor](https://martonpaulo.github.io/todo-print-editor/)

## Highlights

- Visual and Markdown editing on one route
- Exact `297mm × 210mm` A4 landscape pages
- Three fixed `99mm × 210mm` panels per page
- Lists automatically move between panels but never split
- Overflow preflight blocks clipped printouts
- Optional first-panel date and panel numbering
- Optional Moon type typography, drawing list content in the 1845 geometric alphabet
- Browser-only persistence with no account, backend, analytics, or content upload
- Monochrome design tokens in `src/styles/tokens.css`

## Requirements

- Node.js 24 or a Vite 8-compatible Node.js release
- npm 11+
- A modern browser with `localStorage`, `ResizeObserver`, and print CSS support

## Setup

```bash
npm install
npm run dev
```

The development server prints its local URL in the terminal.

## Usage

### Visual editor

Edit list titles and tasks directly. Press Enter in a task to add the next one. Use **Add list** for another checklist and **Add panel** to force following content onto a fresh panel.

### Markdown editor

The supported subset is deliberately small:

```markdown
# 2026-08-24

## Morning
- [ ] Make coffee
- [x] Pack lunch

---

## Afternoon
- [ ] Call Alex
```

- `# YYYY-MM-DD` sets the optional document date.
- `## Title` starts a list.
- `- [ ]` and `- [x]` create todo items.
- `* [ ]` and `* [x]` are accepted on input and normalize to the canonical dash form.
- A plain `- Item` or `* Item` is accepted as an unchecked item.
- `---` forces a new panel.
- Unsupported lines are reported instead of silently discarded.

### Undo and redo

Structural edits, document settings, and Markdown commits share one document history for the
current tab.

- Press `Ctrl`/`Cmd` + `Z` to undo and `Ctrl`/`Cmd` + `Shift` + `Z` (or `Ctrl`/`Cmd` + `Y`) to redo.
  While the cursor is inside a text field the browser's own text undo keeps the shortcut, so typing
  is corrected where it happens.
- Removing a task, a list, or a panel break shows a status naming what was removed, next to an
  **Undo removal** button. The button is an ordinary focusable control, so keyboard, pointer, and
  touch users all recover the same way.
- Edits made less than 500 ms apart form one undo step, so typing is not undone character by
  character. Any edit made after an undo discards the abandoned redo branch.
- History keeps at most the 100 most recent steps; recording beyond that drops the oldest one.
- History lives in memory for this tab only. It is never stored, so reloading the page starts a new
  history over the saved document.

### Moon type

**Moon type** in the toolbar redraws list titles and task text with the geometric alphabet William
Moon published in 1845, on screen and in the printed page. It is a visual alternative typography,
not an accessibility feature: the glyphs are vector outlines, not tactile relief.

- The setting belongs to the document and is saved with it in this browser.
- Moon type is caseless and defines a glyph for each of the 26 Latin letters. Characters it does not
  cover — digits, punctuation, accented letters — keep their normal typeface, so dates and
  quantities stay legible.
- The editor's own input fields stay in the normal typeface, so the document remains editable.
- The underlying text is unchanged, so screen readers and copied text still read the Latin original.

The outlines are drawn from the published Grade 1 shape descriptions and are authored in
`src/domain/moon.ts` rather than loaded from a font, so the repository ships no third-party
typography asset.

### Printing

Choose **Print A4**, then verify these values in the browser or system print dialog:

- Paper: A4
- Orientation: landscape
- Margins: none
- Scale: 100%
- Headers and footers: off

The application defines physical millimeter dimensions and `@page { size: A4 landscape; margin: 0; }`, but web applications cannot force printer-driver settings. A printer that cannot print edge-to-edge may still impose a hardware margin.

## Design tokens

All reusable visual and physical layout values live in `src/styles/tokens.css`. The print contract is grouped under **Physical print tokens**. Change those values carefully because they affect pagination measurements and paper output together.

## Validation

```bash
npm run lint
npm test
npm run test:print
npm run build
npm run check
```

Tests cover Markdown conversion, persisted-data validation, and atomic pagination. Pixel snapshots are intentionally omitted because they do not prove physical print dimensions.

`npm run test:print` is the printed-page geometry check. It serves the app, drives it in headless Chrome, and measures the rendered sheet and its panels in millimetres against the printed-page contract recorded in `AGENTS.md`, which it parses rather than repeats. It also generates a PDF through the browser's own print path and measures the declared page box. It needs a browser, so it is kept out of `npm test`; `npm run check` runs it. The first run downloads Chrome into Puppeteer's cache if `npm install` did not already provision it.

`npm run profile` drives a production build in a headless Chromium and reports the editing-latency profile. `docs/performance.md` records the supported document scale, the budget, and the measured results.

## Privacy and security

Todo content is stored only in this browser under `localStorage`. The app has no backend, account system, analytics, or content API. Clearing site data removes the saved document.

The editor states whether the document on screen is the one the browser holds. When a write is refused, the draft stays editable and is marked as not saved, so it can be copied out of the Markdown view before the tab closes. When stored content cannot be read, the editor shows a starter draft, saves nothing, and keeps the unreadable value until you choose to replace it.

## Deployment

Pull requests run lint, tests, and a production build. A validated push to `main` uploads `dist/` and deploys it through GitHub Pages using the repository's native `GITHUB_TOKEN`.

## Limitations

- Only the documented Markdown subset round-trips to the visual model.
- Content does not sync between browsers or devices.
- Undo history is per tab, is not stored, and keeps at most 100 steps.
- A single list cannot exceed one panel; shorten it before printing.
- Editing stays inside one frame up to 25 lists of 10 tasks; larger documents keep working but feel progressively slower. See `docs/performance.md`.
- Exact physical output depends on 100% print scale and printer-driver behavior.
- The public utility opts out of search indexing, but `noindex` is not access control.

## License

[MIT](LICENSE) © 2026 martonpaulo
