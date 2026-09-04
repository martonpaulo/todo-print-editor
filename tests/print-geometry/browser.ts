import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import puppeteer, { type Browser, type Page } from 'puppeteer'

/**
 * The one Chromium launch every browser check in this directory shares. Chromium is the only
 * supported browser family, so a check that needs a real layout engine needs this build.
 */
export const launchBrowser = async (): Promise<Browser> => {
  // npm may be configured to skip install scripts, which is where Puppeteer normally provisions the
  // Chrome build `.puppeteerrc.cjs` pins. Fetch it once through Puppeteer's own CLI rather than
  // asking for a manual setup step the contract says must not exist.
  //
  // Checked before launching rather than recovered from a launch failure: the message depends on
  // configuration. `BrowserLauncher.resolveExecutablePath()` reports a missing binary as `Could not
  // find Chrome` only when no `chrome.version` is configured, and as `Tried to find the browser at
  // the configured path (...) for version ...` when one is, so matching either string would leave a
  // first run on an empty cache aborting instead of provisioning. `executablePath()` takes no
  // argument here precisely because that overload never validates the path, so it reports where the
  // configured build belongs whether or not it is installed.
  if (!existsSync(await puppeteer.executablePath())) {
    execFileSync('npx', ['puppeteer', 'browsers', 'install', 'chrome'], { stdio: 'inherit' })
  }

  return await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })
}

/**
 * Block until Chromium has actually applied the print stylesheet.
 *
 * `page.emulateMediaType('print')` resolves before the print rules are necessarily in force, so a
 * computed style or a bounding box read straight after it can still report the screen layout. That
 * window is narrow enough to pass most runs and fail one, which is how a correct change gets a red
 * `validate` and a green rerun on the same commit.
 *
 * The condition is `.screen-only` reporting `display: none`, declared by `@media print` in
 * src/styles/print.css and by no screen rule. Two properties matter, and both are deliberate:
 *
 * It is independent of viewport, zoom, typography and the rotation setting, so one helper serves
 * every call site. The obvious alternative -- waiting for `.print-page` to report
 * `transform: none`, which is what preview-scale.test.ts does -- works only where the preview is
 * scaled on screen. geometry.test.ts measures at 2600px, where the sheet already fits unscaled and
 * that transform is already `none`, so the same wait would return immediately and guard nothing.
 *
 * And it is never a value a caller asserts. It observes the media switch, not the sheet geometry,
 * the panel offsets, the glyph count or the paper size, so no wrong print contract can satisfy it.
 *
 * The timeout is swallowed on purpose: a real regression must arrive as the failed expectation that
 * follows, with its actual and expected values, rather than as a bare timeout naming nothing.
 */
export const waitForPrintMedia = async (page: Page): Promise<void> => {
  await page
    .waitForFunction(
      () => {
        const screenOnly = window.document.querySelector('.screen-only')
        return (
          screenOnly instanceof HTMLElement && window.getComputedStyle(screenOnly).display === 'none'
        )
      },
      { timeout: 10_000 },
    )
    .catch(() => {})
}
