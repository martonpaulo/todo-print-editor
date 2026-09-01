# Editing performance: budget, supported scale, and how to reproduce it

This document records the measured cost of the synchronous editing hot path, the
document scale the editor supports, and the procedure that reproduces both. It is
the canonical owner of the performance budget; issue #5 established it.

## Supported document scale

**25 lists of 10 tasks (250 tasks) is the largest document the editor supports at
full editing responsiveness.**

The number is measured, not chosen. At 25 lists every profiled interaction keeps
its blocking main-thread work inside a single 60 Hz frame, so an edit paints on
the next frame. At 50 lists typing already blocks for more than one frame, and at
100 lists and above every interaction misses several frames.

Nothing enforces this limit, and nothing should without a separate product
decision: larger documents keep working and stay correct, they simply feel
progressively slower. Print pagination, persistence, and Markdown behavior are
unaffected by scale.

## Budget

| Metric | Budget | Where it is measured |
| --- | --- | --- |
| Blocking work per edit (p95) | < 16 ms at the supported maximum | `synchronousWorkP95` |
| React commit per edit (p95) | counted inside the blocking budget | `reactCommitP95` |
| Print measurement pass (p95) | < 4 ms — **not met, see below** | `printMeasurementP95` |
| Persistence per edit (p95) | < 1 ms at the supported maximum | `persistenceP95` |

Issue #5 proposed a p95 *edit-to-paint* budget of 16 ms. The profile shows that
metric cannot fall below one frame: a paint lands on the next vsync, so
edit-to-paint at the supported maximum sits at 17–20 ms even when the work
costs 5 ms. The budget therefore applies to **blocking work per edit**, which is
what the application controls, and edit-to-paint is recorded beside it as the
user-visible consequence. This is a recorded revision of the threshold's
denominator, not of its intent.

**The 4 ms print-measurement budget is not met at the supported maximum** — the
pass costs up to 8.4 ms p95 there. It is left as a recorded limit because the
budget that matters, total blocking work per edit, holds with margin (14.1 ms of
16 ms). Bringing the pass under 4 ms needs a per-list height cache keyed by list
content, which must preserve the print-layout contract owned by issue #2.

## Recorded results

Median of three runs, 25 measured iterations per interaction after 5 warm-up
iterations, headless Chromium 152 at a 1600×1000 viewport, production build,
`main` before and after the memoized print list.

Blocking work per edit, p95 milliseconds (before → after):

| Interaction | 10 lists | 25 lists | 50 lists | 100 lists |
| --- | --- | --- | --- | --- |
| Visual typing | 7.0 → 5.9 | 17.1 → **14.1** | 44.9 → 20.8 | 56.1 → 55.9 |
| Task checking | 5.8 → 5.2 | 16.7 → **10.3** | 32.0 → 15.5 | 38.7 → 30.6 |
| Reordering | 0.3 → 0.3 | 0.8 → **0.4** | 1.2 → 0.7 | 1.1 → 2.3 |
| Document settings | 7.9 → 4.5 | 18.2 → **9.7** | 33.5 → 17.7 | 76.5 → 38.8 |
| Markdown typing | 5.3 → 5.3 | 13.0 → **7.0** | 19.8 → 11.4 | 30.4 → 28.7 |

Reordering does its document work inside a click handler that React commits
after the handler returns, so its blocking figure is small while its commit and
measurement figures are the largest of the five.

React commit per edit, p95 milliseconds (before → after):

| Interaction | 10 lists | 25 lists | 50 lists | 100 lists |
| --- | --- | --- | --- | --- |
| Visual typing | 2.6 → 2.1 | 5.0 → 4.0 | 18.1 → 5.3 | 20.2 → 14.7 |
| Task checking | 2.6 → 2.0 | 5.7 → 3.2 | 13.5 → 5.2 | 24.1 → 11.0 |
| Reordering | 2.5 → 1.7 | 7.3 → 3.1 | 15.6 → 6.7 | 19.1 → 10.9 |
| Document settings | 3.3 → 1.8 | 7.7 → 2.9 | 13.9 → 5.3 | 30.3 → 14.9 |
| Markdown typing | 1.6 → 1.4 | 3.9 → 1.6 | 6.0 → 2.5 | 9.4 → 5.4 |

Print measurement pass, p95 milliseconds (before → after), 3 passes per edit and
4 for reordering:

| Interaction | 10 lists | 25 lists | 50 lists | 100 lists |
| --- | --- | --- | --- | --- |
| Visual typing | 3.8 → 2.4 | 9.2 → 8.4 | 22.0 → 13.2 | 29.9 → 33.1 |
| Task checking | 2.5 → 1.0 | 5.7 → 4.6 | 10.2 → 7.2 | 13.5 → 14.3 |
| Reordering | 5.2 → 3.6 | 16.0 → 9.3 | 28.8 → 17.6 | 42.8 → 32.5 |
| Document settings | 3.1 → 2.5 | 10.0 → 6.2 | 18.3 → 10.9 | 34.5 → 24.4 |
| Markdown typing | 2.6 → 2.6 | 6.3 → 4.0 | 11.1 → 6.9 | 15.6 → 15.7 |

Edit-to-paint, p95 milliseconds (before → after), including the wait for the next
vsync:

| Interaction | 10 lists | 25 lists | 50 lists | 100 lists |
| --- | --- | --- | --- | --- |
| Visual typing | 19.0 → 18.6 | 23.6 → 20.3 | 61.3 → 29.7 | 78.2 → 79.7 |
| Task checking | 17.9 → 17.4 | 21.2 → 18.0 | 43.2 → 20.8 | 56.6 → 41.9 |
| Reordering | 18.5 → 18.4 | 37.5 → 19.5 | 70.9 → 37.4 | 88.3 → 67.7 |
| Document settings | 19.0 → 15.9 | 36.3 → 17.3 | 59.3 → 32.0 | 114.5 → 64.7 |
| Markdown typing | 17.9 → 17.8 | 19.6 → 18.1 | 27.3 → 19.7 | 43.2 → 36.8 |

Persistence never approached its budget: JSON serialization plus the synchronous
`localStorage` write measured 0.1–0.2 ms up to 25 lists and 0.3–0.5 ms at 100
lists. No persistence change is justified by this profile, which also leaves the
durability contract owned by issue #1 untouched.

### Beyond the supported scale: 500 lists

Median of two runs at 500 lists of 10 tasks (5,000 tasks), which the acceptance
criteria required profiling and which is far past what the editor supports. Every
figure is p95 milliseconds, before → after:

| Metric | Visual typing | Task checking | Reordering | Settings | Markdown typing |
| --- | --- | --- | --- | --- | --- |
| Blocking work | 797 → 404 | 351 → 161 | 17.5 → 18.9 | 854 → 572 | 1058 → 702 |
| React commit | 311 → 159 | 244 → 124 | 282 → 200 | 433 → 221 | 216 → 61 |
| Print measurement | 497 → 215 | 55.8 → 13.8 | 463 → 327 | 411 → 361 | 670 → 596 |
| Edit-to-paint | 1295 → 602 | 794 → 344 | 1213 → 994 | 1385 → 955 | 1339 → 903 |
| Persistence | 5.4 → 2.7 | 3.1 → 3.3 | 4.5 → 5.4 | 5.6 → 6.0 | 7.3 → 4.5 |

Initial mount to a ready preview fell from 3,623 ms to 1,913 ms. The correction
roughly halves the cost at this scale but does not make it usable: editing a
5,000-task document still blocks for hundreds of milliseconds per keystroke.
Persistence stays under 8 ms even here, ten times below anything a user would
notice, which is why it needs no change.

## The correction this profile justified

`PrintList` in `src/components/PrintPreview.tsx` is memoized. Every list renders
twice — once in the hidden measurement layer and once in its panel — and an edit
replaces exactly one list object, so the bail-out reduces the DOM React rewrites
per keystroke from the whole document to one list. That shrinks both the commit
and the layout the measurement pass then has to force.

It is a pure rendering change: the same elements are produced from the same
props, so pagination inputs and print output are unchanged.

Optimizations the profile did **not** justify, and which are therefore not
implemented: coalescing or debouncing persistence, a measurement worker, print
virtualization, and any cache or timer beyond the memo above.

## Reproducing the profile

```bash
npm run profile
```

That builds the harness and prints one JSON report covering 10, 100, and 500
lists. Useful arguments:

```bash
npm run profile -- --scales 10,25,50,100 --iterations 25 --warmup 5 --repeats 3
```

- `--scales`: comma-separated list counts. `--tasks` sets tasks per list (10).
- `--iterations`: measured iterations per interaction; `--warmup` discards that
  many first.
- `--repeats`: page loads per scale, reduced to the per-metric median. Use at
  least 3: a single run on a busy machine varies by more than the effect sizes
  above.

Requirements and moving parts:

- A Chromium-family browser. The script looks for Chrome, Chromium, and Brave in
  their usual locations; set `CHROME_PATH` to point it elsewhere.
- `scripts/profile.mjs` starts `vite preview`, drives the browser over the
  DevTools protocol using Node's built-in `WebSocket`, and adds no dependency.
- `vite.profile.config.ts` builds `profile/index.html` into `.profile-dist`,
  separately from `npm run build`, so the deployed application keeps exactly one
  route and never ships harness code. It aliases `react-dom/client` to
  `react-dom/profiling` so `<Profiler>` reports commit durations in an otherwise
  production build.
- `src/dev/fixtures.ts` generates the documents. Text and identifiers derive from
  position alone, so runs are byte-identical and no personal document data can
  enter a fixture.
- `src/profiling.ts` is the seam the application itself reports through. It is
  inert until the harness installs a recorder, so a normal session pays one
  property read per sample and stores nothing.

The harness drives the real application with real DOM events: it seeds the
fixture into `localStorage`, mounts `App`, and then types into a task field,
toggles a task checkbox, moves a list down and back up, toggles a document
setting, and types into the Markdown editor. Every figure above therefore
includes the editor, the print preview, the measurement pass, pagination, and
persistence together.

Absolute numbers are machine-specific; the before/after comparison and the shape
of the growth curve are what transfer. Re-run the profile after any change to
the measurement seam in `PrintPreview`, the persistence path in
`usePersistentDocument`, or Markdown parsing, and update this document when the
supported scale or the budget moves.
