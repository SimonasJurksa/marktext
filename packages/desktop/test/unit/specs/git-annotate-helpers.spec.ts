import { describe, expect, it } from 'vitest'
import type { GitAnnotation } from '@shared/types/git'
import { locateBlocks } from '@/git/blockLines'
import {
  authorHue,
  formatDate,
  lineChanges,
  relativeTime,
  rowLabel,
  summarizeLines
} from '@/git/format'

const SHA_A = 'a'.repeat(40)
const SHA_B = 'b'.repeat(40)

const annotation = (overrides: Partial<GitAnnotation> = {}): GitAnnotation => ({
  root: '/repo',
  relPath: 'notes.md',
  inHead: true,
  commits: {
    [SHA_A]: { sha: SHA_A, author: 'Ada', authorMail: 'ada@x', authorTime: 1700000000, summary: 'first' },
    [SHA_B]: { sha: SHA_B, author: 'Grace', authorMail: 'grace@x', authorTime: 1700100000, summary: 'second' }
  },
  // 0: Ada, 1: Grace, 2: Ada, 3: uncommitted, 4: uncommitted
  lines: [SHA_A, SHA_B, SHA_A, '', ''],
  hunks: [
    { oldStart: 2, oldCount: 1, newStart: 2, newCount: 1, oldLines: ['old'], newLines: ['new'] },
    { oldStart: 3, oldCount: 0, newStart: 4, newCount: 2, oldLines: [], newLines: ['x', 'y'] },
    { oldStart: 5, oldCount: 1, newStart: 5, newCount: 0, oldLines: ['removed'], newLines: [] }
  ],
  ...overrides
})

describe('git annotate helpers', () => {
  it('maps hunks to per-line change kinds and deletions', () => {
    const changes = lineChanges(annotation().hunks, 5)
    expect(changes.changes).toEqual(['', 'modified', '', 'added', 'added'])
    expect([...changes.deletedAfter.entries()]).toEqual([[4, ['removed']]])
    const top = lineChanges([{ oldStart: 1, oldCount: 1, newStart: 0, newCount: 0, oldLines: ['head'], newLines: [] }], 2)
    expect(top.deletedAfter.get(-1)).toEqual(['head'])
  })

  it('summarizes a block to its newest commit and overall change', () => {
    const data = annotation()
    const changes = lineChanges(data.hunks, data.lines.length)
    const first = summarizeLines(data, changes, 0, 3)
    expect(first.commit?.sha).toBe(SHA_B)
    expect(first.uncommitted).toBe(false)
    expect(first.change).toBe('modified')
    expect(rowLabel(first, 'Not committed')).toBe(`${formatDate(1700100000)} Grace`)

    const added = summarizeLines(data, changes, 3, 5)
    expect(added.commit).toBeNull()
    expect(added.uncommitted).toBe(true)
    expect(added.change).toBe('added')
    expect(added.deleted).toEqual(['removed'])
    expect(rowLabel(added, 'Not committed')).toBe('Not committed')

    const mixed = summarizeLines(data, changes, 2, 4)
    expect(mixed.change).toBe('modified')
    expect(mixed.uncommitted).toBe(true)

    const untouched = summarizeLines(data, changes, 0, 1)
    expect(untouched.change).toBe('')

    // A deletion in the gap after a block belongs to that block.
    const gap = summarizeLines(data, changes, 2, 3, 5)
    expect(gap.deleted).toEqual(['removed'])
    expect(summarizeLines(data, changes, 2, 3).deleted).toEqual([])
  })

  it('treats every line of a file missing from HEAD as added', () => {
    const data = annotation({ inHead: false, lines: ['', ''], hunks: [], commits: {} })
    const changes = lineChanges([], 2)
    expect(summarizeLines(data, changes, 0, 2).change).toBe('added')
  })

  it('locates block serializations inside the whole document', () => {
    const markdown = ['# Title', '', 'First paragraph', 'continues here', '', '- item one', '- item two', '', 'Last', ''].join('\n')
    const blocks = ['# Title\n', 'First paragraph\ncontinues here\n', '* item one\n* item two\n', 'Last\n']
    expect(locateBlocks(markdown, blocks)).toEqual([
      { start: 0, end: 1 },
      { start: 2, end: 4 },
      null,
      { start: 8, end: 9 }
    ])
  })

  it('tolerates leading whitespace differences and keeps order', () => {
    const markdown = 'a\n\n  b\n\nc\n'
    expect(locateBlocks(markdown, ['a\n', 'b\n', 'c\n'])).toEqual([
      { start: 0, end: 1 },
      { start: 2, end: 3 },
      { start: 4, end: 5 }
    ])
  })

  it('formats dates and relative times', () => {
    expect(formatDate(0)).toMatch(/^19(69|70)-\d\d-\d\d$/)
    const now = 1700000000 * 1000
    expect(relativeTime(1700000000 - 90, now, 'en')).toBe('1 minute ago')
    expect(relativeTime(1700000000 - 2 * 86400, now, 'en')).toBe('2 days ago')
    expect(relativeTime(1700000000 - 5, now, 'en')).toBe('now')
    expect(authorHue('Ada')).toBe(authorHue('Ada'))
    expect(authorHue('Ada')).toBeGreaterThanOrEqual(0)
    expect(authorHue('Ada')).toBeLessThan(360)
  })
})
