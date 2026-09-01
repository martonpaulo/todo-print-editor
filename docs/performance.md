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
lists a keystroke took 22.6 ms to paint and a reorder 44.1 ms.

Nothing enforces the limit, and nothing should without a separate product
decision: larger documents keep working and stay correct, they simply feel
progressively slower. Print pagination, persistence, and Markdown behavior are
unaffected by scale.

## Budget

| Metric | Budget | Reported as |
| --- | --- | --- |
| Edit-to-paint (p95) | ≤ one frame — 20 ms at 60 Hz | `editToPaintP95` |
| React commit per edit (p95) | ≤ one frame at the supported maximum | `reactCommitP95` |
| Print measurement pass (p95) | < 4 ms — **not met, see below** | `printMeasurementP95` |
| Persistence per edit (p95) | < 1 ms at the supported maximum | `persistenceP95` |
| Edit to last commit (p95) | end-to-end upper bound, no budget | `editToLastCommitP95` |
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

**`reactCommit` is the commit-phase duration**, the metric issue #5 requires. It
is `performance.now()` inside `<Profiler onRender>` minus that callback's
`commitTime` argument. React stamps `commitTime` when it enters the commit phase
and runs a Profiler's `onRender` after its whole subtree's layout effects, so the
difference covers DOM mutation plus every layout effect below it — including the
print measurement pass — and carries no task-queue or idle delay.

**`reactRender` is the render phase only.** It is `<Profiler>`'s `actualDuration`,
which excludes DOM mutation and the rest of the commit phase. It is reported as
render duration for that reason and no budget is read from it.

**`editToLastCommit` bounds the whole interaction from above.** It runs from the
edit to the end of the task holding React's last commit for it, timed by a message
posted from `onRender`. It is an end-to-end interval, not a phase duration: it
includes task-queue and idle delay between the handler and a deferred commit,
which is why it tracks `editToPaint` closely. It is useful for seeing that nothing
escapes accounting, and no budget is read from it.

**`handlerReturn` measures only how long the event handler blocked.** React
commits a click-driven update after the handler returns, so the figure is
interaction-dependent and misleading across interactions: reordering returns in
0.4 ms while committing for 9.4 ms. It is a diagnostic for how much of an
interaction is synchronous within the handler, and no budget reads it.

Note that `printMeasurement` can exceed `reactCommit` at large scales: the
measurement pass also runs from `ResizeObserver`, outside any React commit.

**The 4 ms print-measurement budget is not met at the supported maximum** — the
pass costs up to 8.8 ms p95 there. It is left as a recorded limit because the
budgets that matter, painting within one frame and committing within one frame,
both hold at every interaction. Bringing the pass under 4 ms needs a per-list
height cache keyed by list content, which must preserve the print-layout contract
owned by issue #2.

## Recorded results

Median of three runs (two at 500 lists), 25 measured iterations per interaction
after 5 warm-up iterations, headless Chromium 152 at a 1600×1000 viewport,
production build, before → after the memoized print list.

Edit-to-paint, p95 milliseconds — the budget metric. One frame is ~20 ms here:

| Interaction | 10 lists | 25 lists | 50 lists | 100 lists | 500 lists |
| --- | --- | --- | --- | --- | --- |
| Visual typing | 18.6 → 18.8 | 22.6 → **20.2** | 70.7 → 32.2 | 142 → 68.5 | 709 → 559 |
| Task checking | 17.9 → 17.4 | 18.4 → **17.5** | 41.2 → 20.5 | 86.5 → 41.5 | 427 → 214 |
| Reordering | 18.2 → 17.9 | 44.1 → **19.1** | 70.2 → 37.1 | 139 → 67.5 | 854 → 528 |
| Document settings | 15.6 → 16.0 | 36.9 → **15.8** | 61.9 → 34.8 | 142 → 56.9 | 1010 → 455 |
| Markdown typing | 17.9 → 17.8 | 18.7 → **18.2** | 34.6 → 19.3 | 73.3 → 26.8 | 506 → 440 |

Every interaction at 25 lists paints within one frame after the change and three
of five did not before it, which is what moves the supported maximum from 10
lists to 25. At 50 lists three of five are outside a frame again. Visual typing at
25 lists sits on the boundary — 20.2 ms here and 19.8 ms in an independent run —
so treat 25 lists as the edge of the supported range rather than comfortably
inside it.

React commit per edit, p95 milliseconds — mutation plus layout effects:

| Interaction | 10 lists | 25 lists | 50 lists | 100 lists | 500 lists |
| --- | --- | --- | --- | --- | --- |
| Visual typing | 3.8 → 4.1 | 9.1 → **8.2** | 29.5 → 14.3 | 74.6 → 35.8 | 319 → 269 |
| Task checking | 2.8 → 2.2 | 6.5 → **5.1** | 16.8 → 8.0 | 32.3 → 17.8 | 145 → 62.2 |
| Reordering | 4.9 → 5.2 | 21.2 → **9.4** | 33.4 → 19.5 | 71.3 → 31.2 | 389 → 298 |
| Document settings | 4.3 → 3.1 | 15.9 → **7.4** | 28.8 → 18.7 | 60.1 → 28.4 | 470 → 206 |
| Markdown typing | 2.6 → 2.4 | 4.7 → **3.6** | 11.9 → 5.7 | 22.8 → 9.7 | 288 → 203 |

React render per edit, p95 milliseconds — render phase only:

| Interaction | 10 lists | 25 lists | 50 lists | 100 lists | 500 lists |
| --- | --- | --- | --- | --- | --- |
| Visual typing | 2.5 → 2.4 | 5.4 → 3.9 | 15.0 → 6.7 | 41.7 → 15.8 | 176 → 120 |
| Task checking | 2.8 → 2.1 | 5.2 → 3.4 | 12.6 → 5.3 | 37.3 → 16.3 | 156 → 77.5 |
| Reordering | 2.4 → 1.7 | 8.6 → 3.0 | 14.7 → 6.2 | 33.8 → 10.5 | 213 → 79.9 |
| Document settings | 2.5 → 1.9 | 8.5 → 2.9 | 13.7 → 7.0 | 55.0 → 10.9 | 288 → 129 |
| Markdown typing | 1.7 → 1.4 | 2.7 → 1.6 | 6.5 → 2.3 | 18.4 → 4.0 | 71.0 → 41.4 |

Edit to last commit, p95 milliseconds — end-to-end upper bound:

| Interaction | 10 lists | 25 lists | 50 lists | 100 lists | 500 lists |
| --- | --- | --- | --- | --- | --- |
| Visual typing | 10.3 → 8.4 | 22.7 → 20.3 | 71.0 → 32.3 | 161 → 70.5 | 725 → 608 |
| Task checking | 7.1 → 5.8 | 15.6 → 12.3 | 45.0 → 20.5 | 99.6 → 42.8 | 436 → 225 |
| Reordering | 8.9 → 9.0 | 46.8 → 18.1 | 78.5 → 38.9 | 148 → 70.5 | 891 → 557 |
| Document settings | 15.7 → 16.1 | 39.1 → 15.9 | 70.0 → 34.9 | 157 → 59.5 | 1286 → 627 |
| Markdown typing | 7.7 → 7.8 | 12.6 → 9.4 | 34.7 → 15.9 | 73.5 → 26.8 | 509 → 464 |

Print measurement pass, p95 milliseconds, 3 passes per edit and 4 for reordering:

| Interaction | 10 lists | 25 lists | 50 lists | 100 lists | 500 lists |
| --- | --- | --- | --- | --- | --- |
| Visual typing | 2.5 → 2.7 | 8.2 → 7.5 | 24.5 → 12.9 | 48.8 → 32.8 | 218 → 191 |
| Task checking | 1.0 → 1.1 | 4.7 → 4.8 | 11.2 → 7.0 | 12.8 → 13.9 | 35.7 → 10.5 |
| Reordering | 3.8 → 4.9 | 17.7 → 8.8 | 30.0 → 18.0 | 63.6 → 28.6 | 299 → 216 |
| Document settings | 2.5 → 2.2 | 10.3 → 5.5 | 18.5 → 13.6 | 39.2 → 20.6 | 306 → 142 |
| Markdown typing | 2.9 → 2.8 | 5.2 → 4.0 | 12.9 → 6.9 | 24.8 → 12.3 | 330 → 255 |

The pass still walks every list on every edit; the memoization only makes the
layout it forces cheaper. That is exactly the limit the 4 ms budget records.

Persistence never approached its budget: JSON serialization plus the synchronous
`localStorage` write measured 0.1–0.2 ms up to 50 lists, 0.3–0.5 ms at 100 lists,
and 1.4–3.6 ms even at 500 lists. No persistence change is justified by this
profile, which also leaves the durability contract owned by issue #1 untouched.

Initial mount to a ready preview, before → after: 137 → 115 ms at 10 lists,
157 → 146 ms at 25, 349 → 190 ms at 50, 535 → 339 ms at 100, and
2,245 → 1,102 ms at 500.

### How much to trust these numbers

The two variants ran back-to-back on a machine shared with other work, the
memoized one first, so contention is a confound. Three things bound it:

- The 10-list column is a control: the memoization has little to do there, and
  before and after agree within 0.4 ms on every interaction.
- An independent earlier run of the same comparison reached the same threshold —
  25 lists inside a frame after, three of five outside it before — with different
  absolute numbers.
- Re-running the memoized variant alone at 25 lists under a system load average
  of 5–6.6 still painted every interaction within a frame (14.7–19.6 ms).

Absolute figures are machine-specific and move with load. The before/after
comparison, the growth curve, and the threshold are what transfer.

## The correction this profile justified

`PrintList` in `src/components/PrintPreview.tsx` is memoized. Every list renders
twice — once in the hidden measurement layer and once in its panel — and an edit
replaces exactly one list object, so the bail-out reduces the DOM React rewrites
per keystroke from the whole document to one list. Commit duration falls by about
half at and above the supported maximum, and the supported maximum itself moves
from 10 lists to 25.

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
  `react-dom/profiling` so `<Profiler>` reports timings in an otherwise
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

Re-run the profile after any change to the measurement seam in `PrintPreview`,
the persistence path in `usePersistentDocument`, or Markdown parsing, and update
this document when the supported scale or the budget moves.
