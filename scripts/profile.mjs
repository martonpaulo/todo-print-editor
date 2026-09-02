#!/usr/bin/env node
/**
 * Runs the performance harness (issue #5) in a headless Chrome and prints one
 * JSON report to stdout.
 *
 * The harness itself lives in `src/dev/harness.tsx` and must already be built
 * with `npm run profile:build`; `npm run profile` does both. This script serves
 * that build and drives the browser with Puppeteer, the same browser the
 * printed-page geometry check uses, so both browser-driven checks provision and
 * launch Chrome the same way.
 *
 * Usage: node scripts/profile.mjs [--scales 10,100,500] [--iterations 25] [--repeats 3]
 */

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import puppeteer from 'puppeteer'
import { preview } from 'vite'

const CONFIG_FILE = fileURLToPath(new URL('../vite.profile.config.ts', import.meta.url))

// A fixed viewport keeps the preview scale, and therefore the measured layout,
// identical between runs and between machines.
const VIEWPORT = { width: 1600, height: 1000 }

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

const launchBrowser = async () => {
  // npm may be configured to skip install scripts, which is where Puppeteer
  // normally provisions the Chrome build `.puppeteerrc.cjs` pins. Fetch it once
  // through Puppeteer's own CLI rather than asking for a manual setup step.
  //
  // Checked before launching rather than recovered from a launch failure: with a
  // configured `chrome.version`, Puppeteer reports a missing binary as `Tried to
  // find the browser at the configured path (...) for version ...` instead of
  // `Could not find Chrome`, so matching either message would leave a first run
  // on an empty cache aborting instead of provisioning. The no-argument
  // `executablePath()` overload never validates the path, so it reports where the
  // configured build belongs whether or not it is installed.
  if (!existsSync(await puppeteer.executablePath())) {
    execFileSync('npx', ['puppeteer', 'browsers', 'install', 'chrome'], { stdio: 'inherit' })
  }

  return await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })
}

const METRICS = [
  'editToPaintP50',
  'editToPaintP95',
  'editToPaintMax',
  'editToLastCommitP95',
  'handlerReturnP95',
  'reactCommitP95',
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

const runScale = async ({ browser, baseUrl, lists, tasks, iterations, warmup }) => {
  const url = `${baseUrl}?lists=${lists}&tasks=${tasks}&iterations=${iterations}&warmup=${warmup}`
  const page = await browser.newPage()
  try {
    await page.setViewport(VIEWPORT)
    await page.goto(url, { waitUntil: 'load' })
    return await waitFor(
      async () => {
        const failure = await page.evaluate(() => window.__profileError ?? null)
        if (failure) throw new TerminalError(`Harness failed: ${failure}`)
        return page.evaluate(() => window.__profileReport ?? null)
      },
      `the ${lists}-list profile`,
      900_000,
    )
  } finally {
    await page.close()
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

  const server = await preview({ configFile: CONFIG_FILE, preview: { port: 0 }, logLevel: 'silent' })
  const baseUrl = server.resolvedUrls?.local[0]
  if (!baseUrl) throw new Error('The preview server reported no local URL')

  const browser = await launchBrowser()
  try {
    const scaleReports = []
    for (const lists of scales) {
      const runs = []
      for (let repeat = 0; repeat < repeats; repeat += 1) {
        runs.push(await runScale({ browser, baseUrl, lists, tasks, iterations, warmup }))
      }
      scaleReports.push(medianOfRuns(runs))
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          browser: await browser.version(),
          viewport: VIEWPORT,
          generatedAt: new Date().toISOString(),
          scales: scaleReports,
        },
        null,
        2,
      )}\n`,
    )
  } finally {
    await browser.close()
    await server.close()
  }
}

await main()
