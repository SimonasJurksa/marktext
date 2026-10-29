import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  FORK_DEFAULTS_VERSION,
  PreferenceFile,
  shippedDefaultsPatch
} from 'main_renderer/preferences/preferenceFile'

const withDirectory = (contents: string | null, run: (directory: string) => void): void => {
  const directory = mkdtempSync(path.join(tmpdir(), 'marktext-prefs-'))
  try {
    if (contents !== null) writeFileSync(path.join(directory, 'preferences.json'), contents)
    run(directory)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

const UPSTREAM_FILE = {
  autoSave: false,
  autoSaveDelay: 5000,
  fontSize: 18,
  tabBarVisibility: false,
  sideBarVisibility: false,
  titleBarStyle: 'native',
  startUpAction: 'lastState',
  fileSortBy: 'created',
  fileSortOrder: 'asc'
}

describe('fork preference defaults', () => {
  it('applies every fork default once to a preference file written by upstream', () => {
    withDirectory(JSON.stringify(UPSTREAM_FILE), (directory) => {
      const writes: string[] = []
      const file = new PreferenceFile(directory, { write: (_p, contents) => writes.push(contents) })
      const value = file.get()
      expect(value.autoSave).toBe(true)
      expect(value.autoSaveDelay).toBe(2000)
      expect(value.tabBarVisibility).toBe(true)
      expect(value.sideBarVisibility).toBe(true)
      expect(value.titleBarStyle).toBe('custom')
      expect(value.startUpAction).toBe('restoreAll')
      expect(value.restoreEditors).toBe(true)
      expect(value.fileSortBy).toBe('modified')
      expect(value.fileSortOrder).toBe('desc')
      // Settings the fork has no opinion about are kept.
      expect(value.fontSize).toBe(18)
      expect(writes).toHaveLength(1)
      const written = JSON.parse(writes[0])
      expect(written.forkDefaultsVersion).toBe(FORK_DEFAULTS_VERSION)
      expect(written.tabBarVisibility).toBe(true)
    })
  })

  it('applies only the newer steps to a file from an earlier fork build', () => {
    withDirectory(
      JSON.stringify({ autoSave: false, tabBarVisibility: false, forkDefaultsVersion: 1 }),
      (directory) => {
        const writes: string[] = []
        const file = new PreferenceFile(directory, { write: (_p, contents) => writes.push(contents) })
        // Auto save was step 1: the user turned it off afterwards, so it stays off.
        expect(file.get().autoSave).toBe(false)
        expect(file.get().tabBarVisibility).toBe(true)
        expect(JSON.parse(writes[0]).forkDefaultsVersion).toBe(FORK_DEFAULTS_VERSION)
      }
    )
  })

  it('respects a later manual choice once the version is recorded', () => {
    withDirectory(
      JSON.stringify({ autoSave: false, tabBarVisibility: false, forkDefaultsVersion: FORK_DEFAULTS_VERSION }),
      (directory) => {
        const writes: string[] = []
        const file = new PreferenceFile(directory, { write: (_p, contents) => writes.push(contents) })
        expect(file.get().autoSave).toBe(false)
        expect(file.get().tabBarVisibility).toBe(false)
        expect(writes).toHaveLength(0)
      }
    )
  })

  it('does not write when there is no preference file yet', () => {
    withDirectory(null, (directory) => {
      const writes: string[] = []
      const file = new PreferenceFile(directory, { write: (_p, contents) => writes.push(contents) })
      expect(file.get().autoSave).toBe(true)
      expect(file.get().tabBarVisibility).toBe(true)
      expect(writes).toHaveLength(0)
    })
  })

  it('restoring the shipped defaults overwrites every changed setting', () => {
    withDirectory(
      JSON.stringify({ autoSave: false, tabBarVisibility: false, fontSize: 18, forkDefaultsVersion: FORK_DEFAULTS_VERSION }),
      (directory) => {
        const writes: string[] = []
        const file = new PreferenceFile(directory, { write: (_p, contents) => writes.push(contents) })
        const result = file.update(shippedDefaultsPatch())
        expect(result.status).toBe('persisted')
        expect(file.get().autoSave).toBe(true)
        expect(file.get().tabBarVisibility).toBe(true)
        expect(file.get().fontSize).not.toBe(18)
        expect(writes).toHaveLength(1)
      }
    )
  })
})
