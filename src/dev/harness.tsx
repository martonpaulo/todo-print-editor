import { Profiler, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../App'
import { COPY } from '../copy'
import { createProfileDocument } from './fixtures'
import { installProfileRecorder, type ProfileSampleName } from '../profiling'
import '../styles/tokens.css'
import '../styles/global.css'
import '../styles/print.css'

/**
 * Production-build performance harness for issue #5.
 *
 * It mounts the real application against a generated document, drives the five
 * editing interactions with real DOM events, and reports per-interaction
 * latency distributions. It is built by `npm run profile:build` into a separate
 * output directory and is never part of the deployed application bundle.
 */

const STORAGE_KEY = 'todo-print-editor.document.v1'

interface Sample {
  editToPaint: number
  editToLastCommit: number
  handlerReturn: number
  reactCommit: number
  reactRender: number
  printMeasurement: number
  printMeasurementCount: number
  persistence: number
}

interface Summary {
  scenario: string
  iterations: number
  editToPaintP50: number
  editToPaintP95: number
  editToPaintMax: number
  editToLastCommitP95: number
  handlerReturnP95: number
  reactCommitP95: number
  reactRenderP95: number
  printMeasurementP95: number
  printMeasurementCountP95: number
  persistenceP95: number
}

const collected: Record<ProfileSampleName, number[]> = {
  'print-measurement': [],
  persistence: [],
}

installProfileRecorder({
  record: (name, duration) => {
    collected[name].push(duration)
  },
})

let renderDurations: number[] = []
let commitDurations: number[] = []

/**
 * End of the last task in which React committed.
 *
 * `<Profiler onRender>` runs inside the commit phase, so a message posted from
 * it is delivered once that whole task — handler, render, DOM mutation, layout
 * effects, and the measurement pass they trigger — has finished. The last such
 * timestamp before the paint is the end of the pre-paint blocking interval,
 * whether React did the work inside the event handler or in a task after it.
 */
let lastCommitTaskEnd = 0
const commitTaskProbe = new MessageChannel()
commitTaskProbe.port1.onmessage = () => {
  lastCommitTaskEnd = performance.now()
}

const resetCounters = () => {
  collected['print-measurement'] = []
  collected.persistence = []
  renderDurations = []
  commitDurations = []
  lastCommitTaskEnd = 0
}

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0)

const percentile = (values: number[], fraction: number): number => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)
  return sorted[Math.max(0, index)]
}

const round = (value: number): number => Math.round(value * 1000) / 1000

/** Resolves in the task that follows the next paint. */
const afterPaint = (): Promise<number> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      const channel = new MessageChannel()
      channel.port1.onmessage = () => resolve(performance.now())
      channel.port2.postMessage(0)
    })
  })

const settle = async (frames = 3): Promise<void> => {
  for (let frame = 0; frame < frames; frame += 1) await afterPaint()
}

const setNativeValue = (element: HTMLInputElement | HTMLTextAreaElement, value: string): void => {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value')
  descriptor?.set?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

const require$ = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Harness could not find ${selector}`)
  return element
}

/**
 * Matches on `title`, not `aria-label`: the editor's accessible names name the
 * list they act on, so they change with the document while the title stays the
 * plain action.
 */
const buttonByTitle = (title: string, index = 0): HTMLButtonElement => {
  const button = Array.from(document.querySelectorAll('button')).filter(
    (candidate) => candidate.getAttribute('title') === title,
  )[index]
  if (!button) throw new Error(`Harness could not find the "${title}" button #${index}`)
  return button
}

const buttonByText = (text: string): HTMLButtonElement => {
  const button = Array.from(document.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(text),
  )
  if (!button) throw new Error(`Harness could not find a button labelled "${text}"`)
  return button
}

interface Scenario {
  name: string
  prepare?: () => Promise<void> | void
  step: (iteration: number) => void
  restore?: () => Promise<void> | void
}

const enterMode = async (label: string): Promise<void> => {
  buttonByText(label).click()
  await settle()
}

const scenarios: Scenario[] = [
  {
    name: 'visual-typing',
    step: (iteration) => {
      const input = require$<HTMLInputElement>('.task-editor-row__input')
      setNativeValue(input, `${input.value}${'abcdefghij'[iteration % 10]}`)
    },
  },
  {
    name: 'task-checking',
    step: () => {
      require$<HTMLInputElement>('.task-editor-row__checkbox').click()
    },
  },
  {
    name: 'reordering',
    // Move the first list down, then move it back up from its new position, so
    // every pair of iterations returns the document to its generated order.
    step: (iteration) => {
      const moveDown = iteration % 2 === 0
      buttonByTitle(moveDown ? COPY.moveListDown : COPY.moveListUp, moveDown ? 0 : 1).click()
    },
  },
  {
    name: 'document-settings',
    step: () => {
      require$<HTMLInputElement>('.document-toolbar input[type="checkbox"]').click()
    },
  },
  {
    name: 'markdown-typing',
    prepare: () => enterMode(COPY.markdownMode),
    step: (iteration) => {
      const textarea = require$<HTMLTextAreaElement>('.editor-scroll-region textarea')
      setNativeValue(textarea, `${textarea.value}${'abcdefghij'[iteration % 10]}`)
    },
    restore: () => enterMode(COPY.visualMode),
  },
]

const runScenario = async (scenario: Scenario, iterations: number): Promise<Summary> => {
  await scenario.prepare?.()
  await settle()

  const samples: Sample[] = []
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    resetCounters()
    const start = performance.now()
    scenario.step(iteration)
    // A lower bound only: React commits a click-driven update after the handler
    // returns, so this misses work that the instrumented totals below still
    // capture. Kept as a diagnostic; no budget is read from it.
    const handlerReturn = performance.now() - start
    const painted = await afterPaint()
    // Layout observers can report one more measurement pass after the paint;
    // give them a frame before reading the counters.
    await afterPaint()
    samples.push({
      editToPaint: painted - start,
      // Measured, not summed from parts: the edit until the end of the task
      // holding React's last commit for it. It contains every phase, including
      // the DOM mutation no component metric below reports, and is measured the
      // same way whether React worked inside the handler or in a later task. It
      // can land marginally after the first paint when the measurement pass
      // forces a second commit. An interaction that commits nothing falls back
      // to the handler, which is then the whole of its work.
      editToLastCommit: lastCommitTaskEnd > 0 ? lastCommitTaskEnd - start : handlerReturn,
      handlerReturn,
      reactCommit: sum(commitDurations),
      reactRender: sum(renderDurations),
      printMeasurement: sum(collected['print-measurement']),
      printMeasurementCount: collected['print-measurement'].length,
      persistence: sum(collected.persistence),
    })
  }

  await scenario.restore?.()
  await settle()

  const pick = (selector: (sample: Sample) => number, fraction: number): number =>
    round(percentile(samples.map(selector), fraction))

  return {
    scenario: scenario.name,
    iterations,
    editToPaintP50: pick((sample) => sample.editToPaint, 0.5),
    editToPaintP95: pick((sample) => sample.editToPaint, 0.95),
    editToPaintMax: pick((sample) => sample.editToPaint, 1),
    editToLastCommitP95: pick((sample) => sample.editToLastCommit, 0.95),
    handlerReturnP95: pick((sample) => sample.handlerReturn, 0.95),
    reactCommitP95: pick((sample) => sample.reactCommit, 0.95),
    reactRenderP95: pick((sample) => sample.reactRender, 0.95),
    printMeasurementP95: pick((sample) => sample.printMeasurement, 0.95),
    printMeasurementCountP95: pick((sample) => sample.printMeasurementCount, 0.95),
    persistenceP95: pick((sample) => sample.persistence, 0.95),
  }
}

const waitForLayoutReady = async (listCount: number): Promise<void> => {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const measured = document.querySelectorAll('[data-measure-list]').length
    const panels = document.querySelectorAll('.print-page .print-panel').length
    if (measured === listCount && panels > 0) return
    await afterPaint()
  }
  throw new Error('Harness timed out waiting for the print preview to become ready')
}

export const runHarness = async (): Promise<void> => {
  const parameters = new URLSearchParams(window.location.search)
  const lists = Number(parameters.get('lists') ?? 10)
  const tasksPerList = Number(parameters.get('tasks') ?? 10)
  const iterations = Number(parameters.get('iterations') ?? 25)
  const warmup = Number(parameters.get('warmup') ?? 5)

  const output = require$<HTMLPreElement>('#profile-output')
  output.textContent = `RUNNING lists=${lists} tasks=${tasksPerList}`

  const fixture = createProfileDocument({ lists, tasksPerList })
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fixture))

  const mountStart = performance.now()
  createRoot(require$<HTMLDivElement>('#root')).render(
    <StrictMode>
      <Profiler
        id="app"
        // Three separate things are read here.
        //
        // `actualDuration` is the render phase only — it excludes DOM mutation
        // and the rest of the commit — so it is reported as render duration.
        //
        // `commitTime` is stamped when React enters the commit phase, and React
        // runs a Profiler's `onRender` after its whole subtree's layout effects,
        // so `now() - commitTime` is the commit-phase duration: mutation plus
        // every layout effect below, including the print measurement pass. It
        // carries no task-queue or idle delay.
        //
        // The posted message times the end of the surrounding task; see
        // `lastCommitTaskEnd`.
        onRender={(_id, _phase, actualDuration, _baseDuration, _startTime, commitTime) => {
          renderDurations.push(actualDuration)
          commitDurations.push(performance.now() - commitTime)
          commitTaskProbe.port2.postMessage(0)
        }}
      >
        <App />
      </Profiler>
    </StrictMode>,
  )

  await waitForLayoutReady(lists)
  const firstPaint = round(performance.now() - mountStart)

  const results: Summary[] = []
  for (const scenario of scenarios) {
    if (warmup > 0) await runScenario(scenario, warmup)
    results.push(await runScenario(scenario, iterations))
  }

  const report = {
    lists,
    tasksPerList,
    iterations,
    userAgent: navigator.userAgent,
    initialMountToReadyMs: firstPaint,
    results,
  }

  output.textContent = `BEGIN_PROFILE_JSON\n${JSON.stringify(report, null, 2)}\nEND_PROFILE_JSON`
  // `scripts/profile.mjs` reads the finished report from here over CDP.
  ;(window as unknown as { __profileReport?: unknown }).__profileReport = report
  console.info('profile', report)
}
