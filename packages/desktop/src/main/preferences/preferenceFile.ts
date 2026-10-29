import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { sync as writeAtomic } from 'write-file-atomic'
import {
  RECOVERY_DEFAULTS,
  type PreferenceSchemaEntry,
  type PreferenceSchemaRule as Rule,
  type PreferenceUpdateResult,
  type UserPreferences
} from '@shared/types/preferences'
import bundled from '../../../static/preference.json'
import schema from '@shared/preferences/schema.json'

const rules: Record<string, PreferenceSchemaEntry> = schema

/**
 * Defaults the fork changed after upstream, one step per version. A preference
 * file records the last step applied to it (`forkDefaultsVersion`), so a file
 * written by upstream or by an older fork build picks up the later steps once
 * and the user's own choices made afterwards are left alone.
 */
const FORK_DEFAULT_STEPS: ReadonlyArray<Record<string, unknown>> = [
  { autoSave: true, autoSaveDelay: 2000 },
  {
    sideBarVisibility: true,
    tabBarVisibility: true,
    titleBarStyle: 'custom',
    startUpAction: 'restoreAll',
    restoreLayoutState: true,
    restoreEditors: true,
    restoreViewState: true,
    fileSortBy: 'modified',
    fileSortOrder: 'desc'
  }
]
export const FORK_DEFAULTS_VERSION = FORK_DEFAULT_STEPS.length

export const forkDefaultsSince = (version: number): Record<string, unknown> =>
  Object.assign({}, ...FORK_DEFAULT_STEPS.slice(Math.max(0, version)))
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const accepts = (value: unknown, rule: Rule): boolean => {
  if (rule.anyOf) return rule.anyOf.some((item) => accepts(value, item))
  if ('const' in rule) return value === rule.const
  if (rule.enum && !rule.enum.includes(value)) return false
  if (rule.type && (rule.type === 'array' ? !Array.isArray(value) : typeof value !== rule.type))
    return false
  if (
    typeof value === 'number' &&
    (!Number.isFinite(value) ||
      value < (rule.minimum ?? -Infinity) ||
      value > (rule.maximum ?? Infinity))
  )
    return false
  if (typeof value === 'string' && rule.pattern && !new RegExp(rule.pattern).test(value))
    return false
  const itemRule = rule.items
  if (Array.isArray(value) && itemRule && !value.every((item) => accepts(item, itemRule)))
    return false
  return true
}

export const preferenceDefaults = (dark = false): UserPreferences & Record<string, unknown> => {
  const defaults: Record<string, unknown> = {}
  for (const [key, rule] of Object.entries(rules))
    if ('default' in rule) defaults[key] = structuredClone(rule.default)
  Object.assign(defaults, structuredClone(bundled), RECOVERY_DEFAULTS, { language: '' })
  if (dark) defaults.theme = 'dark'
  return defaults as UserPreferences & Record<string, unknown>
}

/** Every schema-known preference at its shipped default: what "restore all defaults" writes. */
export const shippedDefaultsPatch = (dark = false): Record<string, unknown> => {
  const defaults = preferenceDefaults(dark)
  const patch: Record<string, unknown> = {}
  for (const key of Object.keys(rules)) {
    if (key in defaults) patch[key] = defaults[key]
  }
  return patch
}

/** Invalid files are kept read-only; valid files retain unknown keys without interpreting them. */
export class PreferenceFile {
  readonly exists: boolean
  readonly readOnly: boolean
  private readonly pathname: string
  private value: UserPreferences & Record<string, unknown>
  private raw: Record<string, unknown> = {}
  private readonly write: (pathname: string, contents: string) => void

  constructor(
    directory: string,
    options: { dark?: boolean; write?: (pathname: string, contents: string) => void } = {}
  ) {
    this.pathname = path.join(directory, 'preferences.json')
    this.exists = existsSync(this.pathname)
    this.value = preferenceDefaults(options.dark)
    this.write =
      options.write ??
      ((pathname, contents) => writeAtomic(pathname, contents, { encoding: 'utf8', mode: 0o600 }))
    let readOnly = false
    let appliedForkVersion = FORK_DEFAULTS_VERSION
    try {
      const input: unknown = JSON.parse(readFileSync(this.pathname, 'utf8'))
      if (!object(input)) throw new Error('Invalid preferences')
      this.raw = input
      appliedForkVersion =
        typeof input.forkDefaultsVersion === 'number' ? input.forkDefaultsVersion : 0
      for (const [key, rule] of Object.entries(rules)) {
        if (accepts(input[key], rule) && input[key] !== undefined)
          this.value[key] = structuredClone(input[key])
      }
    } catch (error) {
      readOnly = (error as NodeJS.ErrnoException).code !== 'ENOENT'
    }
    this.readOnly = readOnly
    if (this.exists && !readOnly && appliedForkVersion < FORK_DEFAULTS_VERSION) {
      this.applyForkDefaults(appliedForkVersion)
    }
  }

  private applyForkDefaults(fromVersion: number): void {
    this.raw.forkDefaultsVersion = FORK_DEFAULTS_VERSION
    this.update(forkDefaultsSince(fromVersion))
  }

  get(): UserPreferences & Record<string, unknown> {
    return structuredClone(this.value)
  }

  update(patch: unknown): PreferenceUpdateResult {
    if (
      !object(patch) ||
      Object.entries(patch).some(
        ([key, value]) => !Object.hasOwn(rules, key) || !accepts(value, rules[key])
      )
    )
      return { status: 'failed', reason: 'invalid-data' }
    if (this.readOnly) return { status: 'failed', reason: 'storage-unavailable' }
    const next = { ...this.value, ...structuredClone(patch) }
    try {
      mkdirSync(path.dirname(this.pathname), { recursive: true })
      this.write(this.pathname, JSON.stringify({ ...this.raw, ...next }, null, 2))
    } catch {
      return { status: 'failed', reason: 'storage-unavailable' }
    }
    this.value = next
    return { status: 'persisted', preferences: this.get() }
  }
}
