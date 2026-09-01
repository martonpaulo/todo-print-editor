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

## Deployment

Pull requests run lint, tests, and a production build. A validated push to `main` uploads `dist/` and deploys it through GitHub Pages using the repository's native `GITHUB_TOKEN`.

## Limitations

- Only the documented Markdown subset round-trips to the visual model.
- Content does not sync between browsers or devices.
- A single list cannot exceed one panel; shorten it before printing.
- Editing stays inside one frame up to 25 lists of 10 tasks; larger documents keep working but feel progressively slower. See `docs/performance.md`.
- Exact physical output depends on 100% print scale and printer-driver behavior.
- The public utility opts out of search indexing, but `noindex` is not access control.

## License

[MIT](LICENSE) © 2026 martonpaulo
