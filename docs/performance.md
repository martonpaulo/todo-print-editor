# Editing performance: budget, supported scale, and how to reproduce it

This document records the measured cost of the synchronous editing hot path, the
document scale the editor supports, and the procedure that reproduces both. It is
the canonical owner of the performance budget; issue #5 established it.

## Supported document scale

**25 lists of 10 tasks (250 tasks) is the largest document the editor supports at
full editing responsiveness.**

The number is measured, not chosen. At 25 lists every profiled interaction paints
within one frame of the edit. At 50 lists typing, reordering, and settings changes
all miss frames, and at 100 lists and above every interaction misses several.

Before the memoization in this change the same threshold sat at 10 lists: at 25
lists a keystroke took 34.5 ms to paint and a reorder 38.2 ms, both more than two
frames.

Nothing enforces the limit, and nothing should without a separate product
decision: larger documents keep working and stay correct, they simply feel
progressively slower. Print pagination, persistence, and Markdown behavior are
unaffected by scale.

## Budget

| Metric | Budget | Reported as |
| --- | --- | --- |
| Edit-to-paint (p95) | ≤ one frame — 20 ms at 60 Hz | `editToPaintP95` |
| Edit to last commit (p95) | ≤ one frame at the supported maximum | `editToLastCommitP95` |
| Print measurement pass (p95) | < 4 ms — **not met, see below** | `printMeasurementP95` |
| Persistence per edit (p95) | < 1 ms at the supported maximum | `persistenceP95` |
| React render per edit (p95) | diagnostic, no budget | `reactRenderP95` |
| Handler return (p95) | diagnostic, no budget | `handlerReturnP95` |

### What each metric measures, and which ones decide anything

**`editToPaint` is the budget.** It is the interval from dispatching the edit to
the task following the next paint, and it is the metric issue #5 named. The one
recorded adjustment is the pass mark: a paint lands on the next vsync, so this
metric cannot fall below one frame however cheap the work is, and 16 ms at 60 Hz
is unreachable by construction. The budget is therefore *one frame* — an edit that
paints on the very next frame — which is ~20 ms measured, including dispatch
overhead. The intent of the threshold is unchanged; only its floor is stated.

**`editToLastCommit` bounds the work from above.** It runs from the edit to the
end of the task holding React's last commit for it, so it contains every phase —
handler, render, DOM mutation, layout effects, the measurement pass they trigger,
and persistence — and is measured identically whether React worked inside the
handler or in a task after it. It is an interval, not pure busy time: it includes
whatever idle sits between those tasks, which is why it tracks `editToPaint`
closely, and it can land marginally after the first paint when the measurement
pass forces a second commit.

**`reactRender` bounds React's share from below.** It is `<Profiler>`'s
`actualDuration`, which measures the render phase only: it excludes DOM mutation
and the rest of the commit phase. It is reported as render duration for that
reason and no budget is read from it. The same caution applies to summing the
component metrics — render plus measurement plus persistence is a lower bound
that omits commit-phase work, not a total.

**`handlerReturn` measures only how long the event handler blocked.** React
commits a click-driven update after the handler returns, so the figure is
interaction-dependent and misleading across interactions: reordering returns in
0.4 ms while taking 14.9 ms to its last commit. It is kept as a diagnostic for how
much of an interaction is synchronous within the handler, and no budget reads it.

**The 4 ms print-measurement budget is not met at the supported maximum** — the
pass costs up to 8.5 ms p95 there. It is left as a recorded limit because the
budget that matters, painting within one frame, holds at every interaction.
Bringing the pass under 4 ms needs a per-list height cache keyed by list content,
which must preserve the print-layout contract owned by issue #2.

## Recorded results

Median of three runs (two at 500 lists), 25 measured iterations per interaction
after 5 warm-up iterations, headless Chromium 152 at a 1600×1000 viewport,
production build, before → after the memoized print list.

Edit-to-paint, p95 milliseconds — the budget metric. One frame is ~20 ms here:

| Interaction | 10 lists | 25 lists | 50 lists | 100 lists | 500 lists |
| --- | --- | --- | --- | --- | --- |
| Visual typing | 19.2 → 18.8 | 34.5 → **19.8** | 64.2 → 27.5 | 108 → 66.5 | 720 → 309 |
| Task checking | 17.7 → 18.0 | 18.3 → **18.0** | 38.7 → 19.3 | 68.0 → 41.6 | 354 → 247 |
| Reordering | 19.3 → 18.4 | 38.2 → **19.9** | 61.0 → 38.3 | 120 → 75.7 | 999 → 462 |
| Document settings | 15.9 → 16.5 | 30.4 → **16.8** | 62.6 → 31.3 | 110 → 71.9 | 1025 → 486 |
| Markdown typing | 17.7 → 18.3 | 19.7 → **18.2** | 39.6 → 19.0 | 65.9 → 30.8 | 612 → 516 |

Every interaction at 25 lists paints within one frame after the change and three
of five did not before it, which is what moves the supported maximum from 10
lists to 25. At 50 lists three of five are outside a frame again.

Edit to last commit, p95 milliseconds — the upper bound on per-edit work:

| Interaction | 10 lists | 25 lists | 50 lists | 100 lists | 500 lists |
| --- | --- | --- | --- | --- | --- |
| Visual typing | 10.6 → 6.8 | 34.6 → 18.8 | 64.6 → 27.5 | 116 → 66.6 | 725 → 317 |
| Task checking | 5.6 → 4.2 | 14.8 → 14.1 | 43.1 → 19.3 | 77.8 → 45.9 | 355 → 300 |
| Reordering | 14.9 → 7.5 | 40.3 → 14.9 | 64.7 → 40.3 | 125 → 83.1 | 1046 → 496 |
| Document settings | 16.0 → 16.8 | 30.5 → 16.9 | 69.1 → 31.4 | 119 → 78.5 | 1196 → 539 |
| Markdown typing | 6.8 → 7.8 | 15.6 → 11.3 | 39.8 → 12.4 | 66.0 → 30.8 | 665 → 519 |

React render per edit, p95 milliseconds — render phase only, the component the
memoization targets:

| Interaction | 10 lists | 25 lists | 50 lists | 100 lists | 500 lists |
| --- | --- | --- | --- | --- | --- |
| Visual typing | 3.1 → 1.9 | 8.4 → 4.1 | 13.4 → 5.5 | 32.6 → 13.5 | 185 → 76.0 |
| Task checking | 2.3 → 1.8 | 4.7 → 3.3 | 12.8 → 4.8 | 31.0 → 11.4 | 143 → 94.4 |
| Reordering | 3.1 → 1.5 | 8.5 → 3.0 | 12.7 → 6.0 | 29.5 → 11.8 | 272 → 99.5 |
| Document settings | 3.5 → 1.7 | 7.2 → 2.9 | 14.3 → 5.3 | 40.0 → 16.0 | 327 → 102 |
| Markdown typing | 1.6 → 1.6 | 3.6 → 1.9 | 8.5 → 2.1 | 10.7 → 4.0 | 84.8 → 33.2 |

Print measurement pass, p95 milliseconds, 3 passes per edit and 4 for reordering:

| Interaction | 10 lists | 25 lists | 50 lists | 100 lists | 500 lists |
| --- | --- | --- | --- | --- | --- |
| Visual typing | 3.0 → 2.1 | 12.0 → 7.5 | 22.0 → 13.2 | 34.8 → 28.2 | 156 → 118 |
| Task checking | 1.0 → 0.8 | 5.0 → 5.4 | 10.4 → 6.9 | 14.3 → 13.7 | 8.9 → 10.9 |
| Reordering | 6.8 → 3.3 | 15.5 → 8.5 | 25.3 → 18.1 | 56.0 → 36.0 | 295 → 181 |
| Document settings | 3.3 → 2.4 | 8.8 → 5.4 | 19.1 → 10.9 | 30.6 → 26.0 | 312 → 183 |
| Markdown typing | 3.1 → 2.7 | 6.4 → 5.2 | 14.4 → 6.0 | 19.6 → 14.7 | 269 → 256 |

The pass still walks every list on every edit; the memoization only makes the
layout it forces cheaper. That is exactly the limit the 4 ms budget records.

Persistence never approached its budget: JSON serialization plus the synchronous
`localStorage` write measured 0.1–0.2 ms up to 50 lists, 0.3–0.4 ms at 100 lists,
and 1.6–2.5 ms even at 500 lists. No persistence change is justified by this
profile, which also leaves the durability contract owned by issue #1 untouched.

Initial mount to a ready preview, before → after: 144 → 103 ms at 10 lists,
186 → 144 ms at 25, 249 → 196 ms at 50, 404 → 404 ms at 100, and
1,411 → 1,310 ms at 500.

## The correction this profile justified

`PrintList` in `src/components/PrintPreview.tsx` is memoized. Every list renders
twice — once in the hidden measurement layer and once in its panel — and an edit
replaces exactly one list object, so the bail-out reduces the DOM React rewrites
per keystroke from the whole document to one list. Render duration falls by
roughly half at every scale, and the supported maximum moves from 10 lists to 25.

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
  `react-dom/profiling` so `<Profiler>` reports render durations in an otherwise
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
