import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { FORK_DEFAULTS_VERSION, PreferenceFile } from 'main_renderer/preferences/preferenceFile'

const withDirectory = (contents: string | null, run: (directory: string) => void): void => {
  const directory = mkdtempSync(path.join(tmpdir(), 'marktext-prefs-'))
  try {
    if (contents !== null) writeFileSync(path.join(directory, 'preferences.json'), contents)
    run(directory)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

describe('fork preference defaults', () => {
  it('turns auto save on once for a preference file written by upstream', () => {
    withDirectory(JSON.stringify({ autoSave: false, autoSaveDelay: 5000, fontSize: 18 }), (directory) => {
      const writes: string[] = []
      const file = new PreferenceFile(directory, { write: (_p, contents) => writes.push(contents) })
      expect(file.get().autoSave).toBe(true)
      expect(file.get().autoSaveDelay).toBe(2000)
      expect(file.get().fontSize).toBe(18)
      expect(writes).toHaveLength(1)
      const written = JSON.parse(writes[0])
      expect(written.forkDefaultsVersion).toBe(FORK_DEFAULTS_VERSION)
      expect(written.autoSave).toBe(true)
      expect(written.autoSaveDelay).toBe(2000)
    })
  })

  it('respects a later manual choice once the version is recorded', () => {
    withDirectory(JSON.stringify({ autoSave: false, forkDefaultsVersion: FORK_DEFAULTS_VERSION }), (directory) => {
      const writes: string[] = []
      const file = new PreferenceFile(directory, { write: (_p, contents) => writes.push(contents) })
      expect(file.get().autoSave).toBe(false)
      expect(writes).toHaveLength(0)
    })
  })

  it('does not write when there is no preference file yet', () => {
    withDirectory(null, (directory) => {
      const writes: string[] = []
      const file = new PreferenceFile(directory, { write: (_p, contents) => writes.push(contents) })
      expect(file.get().autoSave).toBe(true)
      expect(writes).toHaveLength(0)
    })
  })
})
