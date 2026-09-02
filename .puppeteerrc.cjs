/**
 * Puppeteer reads this file through `lilconfig` from the working directory, so `puppeteer.launch()`,
 * `puppeteer.executablePath()` and `npx puppeteer browsers install chrome` all resolve the same
 * browser: the CLI turns a version-less `install chrome` into the pinned build id below rather than
 * the revision the installed Puppeteer happens to carry.
 *
 * https://pptr.dev/guides/configuration
 *
 * @type {import('puppeteer').Configuration}
 */
module.exports = {
  /**
   * Chrome for Testing 152.0.7977.75, the build this project's print geometry is verified against.
   * It is deliberately newer than the revision Puppeteer 25.9.0 pins (152.0.7977.54), so it is only
   * acceptable while `npm run check` passes against it: revalidate or drop this line on every
   * Puppeteer upgrade instead of letting the override drift silently.
   */
  chrome: { version: '152.0.7977.75' },
  /**
   * The project launches the full Chrome binary — headless for automation, headful for inspection —
   * and its supported browser family is Chromium only. Neither of these is a prerequisite, and
   * downloading them would put builds nothing here launches into the shared cache. Firefox already
   * defaults to skipped; stating it keeps the decision true if that default ever changes.
   */
  'chrome-headless-shell': { skipDownload: true },
  firefox: { skipDownload: true },
}
