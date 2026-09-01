# Editing performance: budget, supported scale, and how to reproduce it

This document records the measured cost of the synchronous editing hot path, the
document scale the editor supports, and the procedure that reproduces both. It is
the canonical owner of the performance budget; issue #5 established it.

## Supported document scale

**25 lists of 10 tasks (250 tasks) is the largest document the editor supports at
full editing responsiveness.**

The number is measured, not chosen. At 25 lists every profiled interaction paints
within one frame of the edit and every other budget below holds. At 50 lists three
of five interactions miss frames — typing, reordering, and settings changes — and
at 100 lists those three miss by roughly twice a frame while Markdown typing
reaches the boundary at 20.3 ms. At 500 lists every interaction misses by an
order of magnitude.

Nothing enforces the limit, and nothing should without a separate product
decision: larger documents keep working and stay correct, they simply feel
progressively slower. Print pagination, persistence, and Markdown behavior are
unaffected by scale.

## Budget

Every budget below is met at the supported maximum.

| Metric | Budget | At 25 lists | Reported as |
| --- | --- | --- | --- |
| Edit-to-paint (p95) | ≤ one frame — 20 ms at 60 Hz | 16.9–19.0 ms | `editToPaintP95` |
| React commit per edit (p95) | ≤ one frame | 2.9–6.4 ms | `reactCommitP95` |
| Print measurement pass (p95) | < 4 ms | 1.5–3.8 ms | `printMeasurementP95` |
| Persistence per edit (p95) | < 1 ms | 0.1–0.2 ms | `persistenceP95` |
| Edit to last commit (p95) | end-to-end upper bound, no budget | 9.1–17.3 ms | `editToLastCommitP95` |
| React render per edit (p95) | diagnostic, no budget | 1.8–4.1 ms | `reactRenderP95` |
| Handler return (p95) | diagnostic, no budget | 0.4–10.2 ms | `handlerReturnP95` |

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
0.4 ms while committing for 6.4 ms. It is a diagnostic for how much of an
interaction is synchronous within the handler, and no budget reads it.

Note that `printMeasurement` can exceed `reactCommit` at large scales: the
measurement pass also runs from `ResizeObserver`, outside any React commit.

## Recorded results

Median of three runs (two at 500 lists), 25 measured iterations per interaction
after 5 warm-up iterations, Puppeteer's headless Chrome 152 at a 1600×1000
viewport, production build, before → after the memoized print list.

Edit-to-paint, p95 milliseconds — the budget metric. One frame is ~20 ms here:

| Interaction | 10 lists | 25 lists | 50 lists | 100 lists | 500 lists |
| --- | --- | --- | --- | --- | --- |
| Visual typing | 18.2 → 18.7 | 18.9 → **18.8** | 26.7 → 24.4 | 46.6 → 38.8 | 249 → 292 |
| Task checking | 18.0 → 17.9 | 19.2 → **18.3** | 23.5 → 19.0 | 43.4 → 37.1 | 238 → 179 |
| Reordering | 18.0 → 18.0 | 18.6 → **19.0** | 28.0 → 26.0 | 56.4 → 44.9 | 306 → 345 |
| Document settings | 17.1 → 17.2 | 17.1 → **16.9** | 27.6 → 21.5 | 49.2 → 40.3 | 319 → 216 |
| Markdown typing | 18.1 → 18.3 | 18.3 → **18.4** | 18.9 → 18.5 | 26.9 → 20.3 | 121 → 99.7 |

React commit per edit, p95 milliseconds — mutation plus layout effects:

| Interaction | 10 lists | 25 lists | 50 lists | 100 lists | 500 lists |
| --- | --- | --- | --- | --- | --- |
| Visual typing | 2.2 → 2.5 | 5.5 → **4.2** | 9.9 → 8.8 | 17.2 → 14.9 | 106 → 103 |
| Task checking | 3.1 → 3.0 | 6.2 → **4.2** | 7.7 → 7.2 | 16.6 → 14.1 | 98.4 → 81.7 |
| Reordering | 4.6 → 4.3 | 7.6 → **6.4** | 10.6 → 10.5 | 22.0 → 18.8 | 125 → 131 |
| Document settings | 2.8 → 2.7 | 4.9 → **4.0** | 9.4 → 8.5 | 17.4 → 15.7 | 122 → 97.1 |
| Markdown typing | 2.4 → 2.4 | 3.3 → **2.9** | 4.3 → 4.0 | 8.8 → 7.2 | 42.2 → 35.7 |

React render per edit, p95 milliseconds — render phase only:

| Interaction | 10 lists | 25 lists | 50 lists | 100 lists | 500 lists |
| --- | --- | --- | --- | --- | --- |
| Visual typing | 2.5 → 2.3 | 5.4 → 4.1 | 8.1 → 7.1 | 17.1 → 12.0 | 77.5 → 83.5 |
| Task checking | 3.4 → 2.6 | 5.7 → 3.8 | 7.3 → 5.5 | 16.5 → 13.8 | 83.8 → 57.4 |
| Reordering | 2.3 → 1.9 | 4.5 → 3.4 | 7.0 → 5.8 | 16.8 → 12.5 | 81.1 → 93.0 |
| Document settings | 2.7 → 2.2 | 5.4 → 3.7 | 8.5 → 6.2 | 18.8 → 13.1 | 113 → 73.5 |
| Markdown typing | 1.8 → 1.4 | 2.2 → 1.8 | 3.2 → 2.3 | 6.0 → 3.7 | 35.7 → 16.4 |

Print measurement pass, p95 milliseconds. The count is 3 passes per edit and 4
for reordering, unchanged by the memoization at every scale:

| Interaction | 10 lists | 25 lists | 50 lists | 100 lists | 500 lists |
| --- | --- | --- | --- | --- | --- |
| Visual typing | 1.0 → 1.1 | 1.6 → 1.5 | 2.4 → 3.0 | 5.0 → 4.7 | 45.7 → 51.2 |
| Task checking | 1.3 → 1.4 | 2.1 → 1.7 | 2.1 → 2.5 | 3.7 → 4.3 | 32.7 → 31.6 |
| Reordering | 3.1 → 3.0 | 4.2 → 3.8 | 4.9 → 5.5 | 8.7 → 9.3 | 55.3 → 75.1 |
| Document settings | 1.1 → 1.2 | 1.6 → 1.6 | 2.5 → 2.7 | 4.9 → 5.0 | 41.0 → 41.9 |
| Markdown typing | 1.9 → 2.1 | 2.5 → 2.5 | 3.4 → 3.3 | 6.0 → 5.9 | 27.7 → 27.5 |

The pass fits its 4 ms budget at the supported maximum and first exceeds it at
50 lists on reordering. It walks every list on every edit, so it grows linearly;
the memoization does not change that, only the layout each pass forces.

Persistence never approached its budget: JSON serialization plus the synchronous
`localStorage` write measured 0.1–0.2 ms up to 50 lists, 0.3–0.5 ms at 100 lists,
and 1.1–3.7 ms even at 500 lists.

Initial mount to a ready preview, before → after: 130 → 120 ms at 10 lists,
161 → 177 ms at 25, 232 → 309 ms at 50, 434 → 382 ms at 100, and
1,385 → 1,452 ms at 500.

### How much to trust these numbers

Absolute figures are machine-specific and move sharply with system load. The
threshold and the growth curve are what transfer; a single figure is not evidence.

Two claims recorded during this issue's own work did not survive a cleaner
measurement, and both are corrected above:

- An earlier comparison, taken in a different browser while the machine's load
  average climbed from 2.8 to 10 during the baseline half of the run, showed the
  unmemoized build missing frames at 25 lists and suggested the memoization moved
  the supported maximum from 10 lists to 25. Repeated on Chrome at steady load, it
  does not reproduce: both builds paint within a frame at 25 lists, and the
  memoization improves commit and render duration by roughly 10–30% there without
  changing the supported scale.
- The same contaminated run put the print measurement pass at 8.8 ms p95 at the
  supported maximum, and this document recorded it as a budget that could not be
  met. It measures 1.5–3.8 ms on a quiet machine and meets the 4 ms budget.

When re-running, take both variants back-to-back on an otherwise idle machine and
check the smallest scale as a control: the memoization has little to do at 10
lists, so a before/after gap there is contention, not signal.

## The correction this profile justified

`PrintList` in `src/components/PrintPreview.tsx` is memoized. Every list renders
twice — once in the hidden measurement layer and once in its panel — and an edit
replaces exactly one list object, so the bail-out reduces the DOM React rewrites
per keystroke from the whole document to one list.

It is a small, consistent improvement rather than a rescue: render and commit
duration fall by roughly 10–30% between 25 and 100 lists, the effect is inside the
noise at 10 lists and at 500, and the supported scale is 25 lists with or without
it. It is kept because it is a pure rendering change — the same elements from the
same props, so pagination inputs and print output are unchanged — that the profile
shows reducing measured work at the scales users occupy.

Optimizations the profile did **not** justify, and which are therefore not
implemented: coalescing or debouncing persistence, a measurement worker, print
virtualization, and any cache or timer.

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

Moving parts:

- `scripts/profile.mjs` serves the harness build and drives it with Puppeteer,
  the same browser the printed-page geometry check uses, so both browser-driven
  checks provision and launch Chrome the same way. A harness that throws aborts
  the run immediately with the page's own error.
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
