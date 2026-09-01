import { afterEach, describe, expect, it } from 'vitest'
import {
  installProfileRecorder,
  isProfilingEnabled,
  recordProfileSample,
  type ProfileSampleName,
} from './profiling'

afterEach(() => {
  installProfileRecorder(undefined)
})

describe('profiling seam', () => {
  it('is inert until a recorder is installed', () => {
    expect(isProfilingEnabled()).toBe(false)
    expect(() => recordProfileSample('persistence', 1)).not.toThrow()
  })

  it('forwards samples to an installed recorder', () => {
    const samples: Array<[ProfileSampleName, number]> = []
    installProfileRecorder({ record: (name, duration) => samples.push([name, duration]) })

    recordProfileSample('print-measurement', 2.5)
    recordProfileSample('persistence', 0.25)

    expect(isProfilingEnabled()).toBe(true)
    expect(samples).toEqual([
      ['print-measurement', 2.5],
      ['persistence', 0.25],
    ])
  })

  it('stops recording once the recorder is removed', () => {
    const samples: number[] = []
    installProfileRecorder({ record: (_name, duration) => samples.push(duration) })
    installProfileRecorder(undefined)

    recordProfileSample('persistence', 9)

    expect(samples).toEqual([])
  })
})
