import { runHarness } from '../src/dev/harness'

void runHarness().catch((error: unknown) => {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error)
  const output = document.querySelector('#profile-output')
  if (output) output.textContent = `PROFILE_ERROR ${message}`
  ;(window as unknown as { __profileError?: string }).__profileError = message
  console.error(error)
})
