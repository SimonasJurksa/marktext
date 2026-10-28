import { beforeEach, describe, expect, it } from 'vitest'
import keybindingsLinux from 'main_renderer/keyboard/keybindingsLinux'
import {
  DEFAULT_STATE,
  buildPattern,
  displayLine,
  loadState,
  parseFileMask,
  previewWindow,
  pushHistory,
  saveState
} from '@/components/findInFiles/helpers'

describe('find in files helpers', () => {
  it('binds Ctrl+Shift+F to the dialog on Linux and unbinds the sidebar search', () => {
    expect(keybindingsLinux.get('edit.find-in-files')).toBe('Ctrl+Shift+F')
    expect(keybindingsLinux.get('edit.find-in-folder')).toBe('')
  })

  it('keeps single-line literal queries as fixed strings', () => {
    expect(buildPattern('Atsakymas: a', false)).toEqual({ pattern: 'Atsakymas: a', isRegexp: false })
  })

  it('escapes multi-line literal queries into a CRLF-tolerant regex', () => {
    expect(buildPattern('Atsakymas:\n\n**K2', false)).toEqual({
      pattern: 'Atsakymas:\\r?\\n\\r?\\n\\*\\*K2',
      isRegexp: true
    })
    expect(buildPattern('a\r\nb', false).pattern).toBe('a\\r?\\nb')
  })

  it('treats both real line breaks and \\n as line ends in regex mode', () => {
    expect(buildPattern('Atsakymas:\\n\\n', true)).toEqual({
      pattern: 'Atsakymas:\\r?\\n\\r?\\n',
      isRegexp: true
    })
    expect(buildPattern('Atsakymas:\n$', true).pattern).toBe('Atsakymas:\\r?\\n$')
    // An escaped backslash followed by n is not a line break.
    expect(buildPattern('a\\\\nb', true).pattern).toBe('a\\\\nb')
  })

  it('parses file masks into inclusions and exclusions', () => {
    expect(parseFileMask('*.md, *.txt !*.min.js')).toEqual({
      inclusions: ['*.md', '*.txt'],
      exclusions: ['*.min.js']
    })
    expect(parseFileMask('')).toEqual({ inclusions: [], exclusions: [] })
    expect(parseFileMask(' ; , ')).toEqual({ inclusions: [], exclusions: [] })
  })

  it('keeps a bounded, de-duplicated directory history', () => {
    let history: string[] = []
    for (let i = 0; i < 12; i++) history = pushHistory(history, `/d${i}`)
    expect(history).toHaveLength(10)
    expect(history[0]).toBe('/d11')
    expect(pushHistory(history, '/d5')[0]).toBe('/d5')
    expect(pushHistory(history, '/d5')).toHaveLength(10)
    expect(pushHistory(history, '  ')).toBe(history)
  })

  it('collapses multi-line matches to one display line', () => {
    expect(displayLine('  Atsakymas:\r\n\r\nfoo  ')).toBe('Atsakymas: ↵  ↵ foo')
  })

  it('windows the preview only for very large files', () => {
    expect(previewWindow(300, 10)).toEqual({ start: 0, end: 300 })
    expect(previewWindow(50000, 20000)).toEqual({ start: 19500, end: 20500 })
    expect(previewWindow(50000, 100)).toEqual({ start: 0, end: 1000 })
  })

  describe('persistence', () => {
    beforeEach(() => localStorage.clear())

    it('round-trips state through localStorage and falls back to defaults', () => {
      expect(loadState()).toEqual(DEFAULT_STATE)
      saveState({ ...DEFAULT_STATE, directory: '/tmp', history: ['/tmp'], fileMask: '*.txt', isRegexp: true })
      expect(loadState()).toEqual({ ...DEFAULT_STATE, directory: '/tmp', history: ['/tmp'], fileMask: '*.txt', isRegexp: true })
      localStorage.setItem('find-in-files:state', '{not json')
      expect(loadState()).toEqual(DEFAULT_STATE)
    })
  })
})
