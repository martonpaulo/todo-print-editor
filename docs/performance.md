# Editing performance: budget, supported scale, and how to reproduce it

This document records the measured cost of the synchronous editing hot path, the
document scale the editor supports, and the procedure that reproduces both. It is
the canonical owner of the performance budget; issue #5 established it.

## Supported document scale

**25 lists of 10 tasks (250 tasks) is the largest document the editor supports at
full editing responsiveness.**

The number is measured, not chosen. At 25 lists every profiled interaction keeps
its instrumented per-edit work inside a single 60 Hz frame and paints within one
frame of the edit. At 50 lists typing, reordering, and settings changes all
exceed a frame of work, and at 100 lists and above every interaction misses
several frames.

Nothing enforces this limit, and nothing should without a separate product
decision: larger documents keep working and stay correct, they simply feel
progressively slower. Print pagination, persistence, and Markdown behavior are
unaffected by scale.

## Budget

| Metric | Budget | Reported as |
| --- | --- | --- |
| Instrumented work per edit (p95) | < 16 ms at the supported maximum | `instrumentedWorkP95` |
| Edit-to-paint (p95) | ≤ one frame, ~20 ms at 60 Hz | `editToPaintP95` |
| React commit per edit (p95) | counted inside the work budget | `reactCommitP95` |
| Print measurement pass (p95) | < 4 ms — **not met, see below** | `printMeasurementP95` |
| Persistence per edit (p95) | < 1 ms at the supported maximum | `persistenceP95` |

### How the metrics are defined, and why

`instrumentedWorkP95` is the p95 of the **per-iteration sum** of React commit
time, print-measurement time, and persistence time. Each part is timed where it
actually executes — React through `<Profiler>`, the other two through the
application's own profiling seam — so work React defers past the event handler is
still attributed to the edit that caused it. It is a lower bound on total
main-thread cost, missing only work nothing instruments, and it is the number the
budget and the supported scale are read from.

`handlerReturnP95` is also reported, and **no decision is read from it**. It
measures only how long the event handler itself blocked. React commits a
click-driven update after the handler returns, so the figure is
interaction-dependent and misleading across interactions: reordering returns in
0.4 ms while costing 11.8 ms of instrumented work. It is kept as a diagnostic for
how much of an interaction is synchronous within the handler.

Issue #5 proposed a p95 *edit-to-paint* budget of 16 ms. That metric cannot fall
below one frame: a paint lands on the next vsync, so edit-to-paint at the
supported maximum sits at 17–20 ms even when the work costs 6 ms. The 16 ms
budget therefore applies to instrumented work per edit — what the application
controls — and edit-to-paint is recorded beside it, against a one-frame budget,
as the user-visible consequence. This is a recorded revision of the threshold's
denominator, not of its intent.

**The 4 ms print-measurement budget is not met at the supported maximum** — the
pass costs up to 8.7 ms p95 there. It is left as a recorded limit because the
budget that matters, total instrumented work per edit, holds with margin
(11.8 ms of 16 ms). Bringing the pass under 4 ms needs a per-list height cache
keyed by list content, which must preserve the print-layout contract owned by
issue #2.

## Recorded results

Median of three runs (two at 500 lists), 25 measured iterations per interaction
after 5 warm-up iterations, headless Chromium 152 at a 1600×1000 viewport,
production build, before → after the memoized print list.

Instrumented work per edit, p95 milliseconds — the budget metric:

| Interaction | 10 lists | 25 lists | 50 lists | 100 lists | 500 lists |
| --- | --- | --- | --- | --- | --- |
| Visual typing | 5.0 → 5.4 | 12.1 → **10.7** | 20.5 → 18.9 | 51.3 → 34.4 | 294 → 163 |
| Task checking | 3.4 → 3.3 | 9.3 → **8.3** | 14.4 → 12.0 | 28.6 → 26.7 | 93.5 → 81.5 |
| Reordering | 5.7 → 5.5 | 12.5 → **11.8** | 24.6 → 22.8 | 57.0 → 40.5 | 223 → 196 |
| Document settings | 4.7 → 4.0 | 9.8 → **8.9** | 21.2 → 18.9 | 55.2 → 29.1 | 284 → 223 |
| Markdown typing | 4.6 → 5.4 | 8.0 → **5.8** | 10.0 → 9.3 | 25.6 → 15.0 | 206 → 225 |

Every figure at 25 lists is inside the 16 ms frame; at 50 lists three of five
interactions are outside it. That is the whole basis for the supported maximum,
and it holds before the change as well as after: **the memoization improves
headroom at the supported scale rather than moving the supported scale.** Its
effect grows with document size, roughly halving the cost at 100 lists.

Edit-to-paint, p95 milliseconds, including the wait for the next vsync:

| Interaction | 10 lists | 25 lists | 50 lists | 100 lists | 500 lists |
| --- | --- | --- | --- | --- | --- |
| Visual typing | 18.8 → 19.0 | 20.9 → 20.0 | 37.9 → 32.1 | 76.3 → 58.2 | 553 → 309 |
| Task checking | 17.6 → 17.9 | 17.8 → 18.0 | 24.2 → 21.5 | 48.3 → 42.5 | 203 → 196 |
| Reordering | 18.1 → 18.6 | 20.3 → 20.0 | 39.1 → 36.2 | 82.8 → 62.9 | 405 → 341 |
| Document settings | 15.6 → 16.6 | 17.9 → 16.7 | 38.4 → 32.7 | 82.4 → 50.7 | 454 → 325 |
| Markdown typing | 17.9 → 18.1 | 18.7 → 18.2 | 19.8 → 19.4 | 43.8 → 25.6 | 386 → 324 |

React commit per edit, p95 milliseconds — the component the memoization targets:

| Interaction | 10 lists | 25 lists | 50 lists | 100 lists | 500 lists |
| --- | --- | --- | --- | --- | --- |
| Visual typing | 2.7 → 2.0 | 5.1 → 3.8 | 8.9 → 6.0 | 22.0 → 12.2 | 157 → 71.0 |
| Task checking | 2.6 → 1.6 | 4.8 → 3.7 | 7.5 → 4.9 | 20.2 → 13.8 | 79.3 → 73.2 |
| Reordering | 2.1 → 1.7 | 4.3 → 3.1 | 8.3 → 5.9 | 18.5 → 9.3 | 113 → 60.3 |
| Document settings | 2.4 → 1.8 | 4.6 → 3.3 | 9.2 → 6.7 | 30.1 → 8.9 | 183 → 86.1 |
| Markdown typing | 1.8 → 1.6 | 2.6 → 1.6 | 3.4 → 2.6 | 7.8 → 4.1 | 49.3 → 27.7 |

Print measurement pass, p95 milliseconds, 3 passes per edit and 4 for reordering:

| Interaction | 10 lists | 25 lists | 50 lists | 100 lists | 500 lists |
| --- | --- | --- | --- | --- | --- |
| Visual typing | 2.6 → 3.8 | 7.3 → 7.7 | 13.0 → 14.2 | 25.7 → 24.7 | 137 → 86.0 |
| Task checking | 1.0 → 1.0 | 4.5 → 4.6 | 6.8 → 6.9 | 12.8 → 13.2 | 11.6 → 9.1 |
| Reordering | 3.5 → 3.9 | 8.6 → 8.7 | 15.5 → 17.4 | 36.0 → 30.4 | 111 → 115 |
| Document settings | 2.2 → 2.4 | 5.3 → 5.9 | 11.1 → 11.7 | 28.6 → 20.6 | 124 → 133 |
| Markdown typing | 3.0 → 3.7 | 5.3 → 4.1 | 6.3 → 6.8 | 17.0 → 11.8 | 177 → 156 |

The measurement pass is where the memoization pays off least and inside the noise
at small scales: the layout it forces is cheaper, but the pass still walks every
list on every edit. That is exactly the limit the 4 ms budget records.

Persistence never approached its budget: JSON serialization plus the synchronous
`localStorage` write measured 0.1–0.2 ms up to 25 lists, 0.3 ms at 100 lists, and
1.3–2.3 ms even at 500 lists — well under 1 ms wherever the editor is supported.
No persistence change is justified by this profile, which also leaves the
durability contract owned by issue #1 untouched.

Initial mount to a ready preview: 185 ms at 10 lists, 154 ms at 25, 204 ms at 50,
293 ms at 100, and 1,276 ms at 500.

## The correction this profile justified

`PrintList` in `src/components/PrintPreview.tsx` is memoized. Every list renders
twice — once in the hidden measurement layer and once in its panel — and an edit
replaces exactly one list object, so the bail-out reduces the DOM React rewrites
per keystroke from the whole document to one list. React commit time falls at
every scale, by about a quarter at the supported maximum and by about half at
100 lists and beyond.

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
  DevTools protocol using Node's built-in `WebSocket`, and adds no dependency. A
  harness that throws aborts the run immediately with the page's own error.
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
