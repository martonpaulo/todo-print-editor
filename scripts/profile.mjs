#!/usr/bin/env node
/**
 * Runs the performance harness (issue #5) in a headless Chromium and prints one
 * JSON report to stdout.
 *
 * The harness itself lives in `src/dev/harness.tsx` and must already be built
 * with `npm run profile:build`. This script starts `vite preview`, drives a
 * headless browser over the DevTools protocol without adding a dependency, and
 * runs every requested document scale in a fresh tab.
 *
 * Usage: node scripts/profile.mjs [--scales 10,100,500] [--iterations 25] [--repeats 3]
 */

import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

const CHROMIUM_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean)

const PREVIEW_PORT = 4183
const DEBUG_PORT = 9333
// A fixed viewport keeps the preview scale, and therefore the measured layout,
// identical between runs and between machines.
const WINDOW = { width: 1600, height: 1000 }

const readArgument = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : process.argv[index + 1]
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

/** A failure that must abort the run instead of being retried until the deadline. */
class TerminalError extends Error {}

const waitFor = async (probe, description, timeoutMs = 60_000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const result = await probe()
      if (result) return result
    } catch (error) {
      if (error instanceof TerminalError) throw error
      // not ready yet
    }
    await wait(500)
  }
  throw new Error(`Timed out waiting for ${description}`)
}

const findChromium = async () => {
  const { access } = await import('node:fs/promises')
  for (const candidate of CHROMIUM_CANDIDATES) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // try the next candidate
    }
  }
  throw new Error(
    `No Chromium binary found. Set CHROME_PATH to one. Looked at: ${CHROMIUM_CANDIDATES.join(', ')}`,
  )
}

class DevToolsSession {
  #socket
  #nextId = 1
  #pending = new Map()

  static async connect(webSocketUrl) {
    const session = new DevToolsSession()
    session.#socket = new WebSocket(webSocketUrl)
    session.#socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      const resolver = session.#pending.get(message.id)
      if (!resolver) return
      session.#pending.delete(message.id)
      if (message.error) resolver.reject(new Error(message.error.message))
      else resolver.resolve(message.result)
    })
    await new Promise((resolve, reject) => {
      session.#socket.addEventListener('open', resolve, { once: true })
      session.#socket.addEventListener('error', () => reject(new Error('DevTools socket failed')), {
        once: true,
      })
    })
    return session
  }

  send(method, params = {}, timeoutMs = 30_000) {
    const id = this.#nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id)
        reject(new Error(`DevTools call ${method} timed out`))
      }, timeoutMs)
      this.#pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        },
      })
      this.#socket.send(JSON.stringify({ id, method, params }))
    })
  }

  async evaluate(expression) {
    const { result, exceptionDetails } = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (exceptionDetails) throw new Error(exceptionDetails.text)
    return result.value
  }

  close() {
    this.#socket.close()
  }
}

const METRICS = [
  'editToPaintP50',
  'editToPaintP95',
  'editToPaintMax',
  'editToLastCommitP95',
  'handlerReturnP95',
  'reactRenderP95',
  'printMeasurementP95',
  'printMeasurementCountP95',
  'persistenceP95',
]

const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Math.round(((sorted[middle - 1] + sorted[middle]) / 2) * 1000) / 1000
    : sorted[middle]
}

/**
 * Reduces repeated page loads of the same scale to the per-metric median, so a
 * single noisy run on a shared machine cannot decide a budget.
 */
const medianOfRuns = (runs) => ({
  ...runs[0],
  repeats: runs.length,
  initialMountToReadyMs: median(runs.map((run) => run.initialMountToReadyMs)),
  results: runs[0].results.map((_result, index) =>
    Object.fromEntries([
      ['scenario', runs[0].results[index].scenario],
      ['iterations', runs[0].results[index].iterations],
      ...METRICS.map((metric) => [metric, median(runs.map((run) => run.results[index][metric]))]),
    ]),
  ),
})

const runScale = async ({ lists, tasks, iterations, warmup }) => {
  const url = `http://127.0.0.1:${PREVIEW_PORT}/?lists=${lists}&tasks=${tasks}&iterations=${iterations}&warmup=${warmup}`
  const target = await fetch(
    `http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(url)}`,
    { method: 'PUT' },
  ).then((response) => response.json())

  // A fresh session per poll keeps the driver immune to a socket that drops
  // while the page is navigating or busy under the 500-list load.
  const poll = async () => {
    const session = await DevToolsSession.connect(target.webSocketDebuggerUrl)
    try {
      const failure = await session.evaluate('window.__profileError ?? null')
      if (failure) throw new TerminalError(`Harness failed: ${failure}`)
      return await session.evaluate('window.__profileReport ?? null')
    } finally {
      session.close()
    }
  }

  try {
    return await waitFor(poll, `the ${lists}-list profile`, 900_000)
  } finally {
    await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/close/${target.id}`).catch(() => {})
  }
}

const main = async () => {
  const scales = String(readArgument('scales', '10,100,500'))
    .split(',')
    .map((value) => Number(value.trim()))
  const tasks = Number(readArgument('tasks', 10))
  const iterations = Number(readArgument('iterations', 25))
  const warmup = Number(readArgument('warmup', 5))
  const repeats = Number(readArgument('repeats', 3))

  const chromium = await findChromium()
  const userDataDir = await mkdtemp(join(tmpdir(), 'todo-print-profile-'))

  const preview = spawn(
    'npx',
    [
      'vite',
      'preview',
      '--config',
      'vite.profile.config.ts',
      '--host',
      '127.0.0.1',
      '--port',
      String(PREVIEW_PORT),
      '--strictPort',
    ],
    { stdio: 'ignore' },
  )
  const browser = spawn(
    chromium,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--force-device-scale-factor=1',
      `--window-size=${WINDOW.width},${WINDOW.height}`,
      `--user-data-dir=${userDataDir}`,
      `--remote-debugging-port=${DEBUG_PORT}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  )

  try {
    await waitFor(
      () => fetch(`http://127.0.0.1:${PREVIEW_PORT}/`).then((response) => response.ok),
      'the preview server',
    )
    const version = await waitFor(
      () => fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`).then((response) => response.json()),
      'the headless browser',
    )

    const scaleReports = []
    for (const lists of scales) {
      const runs = []
      for (let repeat = 0; repeat < repeats; repeat += 1) {
        runs.push(await runScale({ lists, tasks, iterations, warmup }))
      }
      scaleReports.push(medianOfRuns(runs))
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          browser: version['User-Agent'],
          viewport: WINDOW,
          generatedAt: new Date().toISOString(),
          scales: scaleReports,
        },
        null,
        2,
      )}\n`,
    )
  } finally {
    browser.kill()
    preview.kill()
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {})
  }
}

await main()
