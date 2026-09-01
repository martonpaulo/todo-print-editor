/**
 * Opt-in profiling seam for the synchronous editing hot path.
 *
 * Production code calls `recordProfileSample` on the paths issue #5 must
 * quantify. Nothing is recorded unless a harness installs a recorder on
 * `globalThis`, so a normal session pays one property read per sample and
 * keeps no data. The harness lives in `src/dev/` and never ships with the app.
 */

export type ProfileSampleName = 'print-measurement' | 'persistence'

export interface ProfileRecorder {
  record: (name: ProfileSampleName, duration: number) => void
}

const RECORDER_KEY = '__todoPrintEditorProfileRecorder'

type ProfilingGlobal = typeof globalThis & {
  [RECORDER_KEY]?: ProfileRecorder
}

export const installProfileRecorder = (recorder: ProfileRecorder | undefined): void => {
  ;(globalThis as ProfilingGlobal)[RECORDER_KEY] = recorder
}

export const recordProfileSample = (name: ProfileSampleName, duration: number): void => {
  (globalThis as ProfilingGlobal)[RECORDER_KEY]?.record(name, duration)
}

export const isProfilingEnabled = (): boolean =>
  (globalThis as ProfilingGlobal)[RECORDER_KEY] !== undefined
