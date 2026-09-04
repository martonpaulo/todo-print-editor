import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import puppeteer, { type Browser } from 'puppeteer'

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
