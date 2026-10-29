import type { GitAnnotation, GitCommitSummary, GitHunk } from '@shared/types/git'

export type GitLineChange = '' | 'added' | 'modified'

export interface GitLineChanges {
  // Index = 0-based line of the annotated contents.
  changes: GitLineChange[]
  // Key = 0-based line after which text was deleted; -1 = before the first line.
  deletedAfter: Map<number, string[]>
}

export const shortSha = (sha: string): string => sha.slice(0, 8)

const pad = (value: number): string => String(value).padStart(2, '0')

export const formatDate = (unixSeconds: number): string => {
  const date = new Date(unixSeconds * 1000)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export const formatDateTime = (unixSeconds: number): string => {
  const date = new Date(unixSeconds * 1000)
  return `${formatDate(unixSeconds)} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const RELATIVE_STEPS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 86400],
  ['month', 30 * 86400],
  ['week', 7 * 86400],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60]
]

export const relativeTime = (unixSeconds: number, now = Date.now(), locale = 'en'): string => {
  const elapsed = Math.max(0, Math.round(now / 1000 - unixSeconds))
  let formatter: Intl.RelativeTimeFormat
  try {
    formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  } catch {
    formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  }
  for (const [unit, seconds] of RELATIVE_STEPS) {
    if (elapsed >= seconds) return formatter.format(-Math.floor(elapsed / seconds), unit)
  }
  return formatter.format(0, 'second')
}

// Stable pastel hue per author so one person's lines share a colour, like an IDE's annotate gutter.
export const authorHue = (author: string): number => {
  let hash = 0
  for (let i = 0; i < author.length; i++) hash = (hash * 31 + author.charCodeAt(i)) | 0
  return Math.abs(hash) % 360
}

export const lineChanges = (hunks: GitHunk[], lineCount: number): GitLineChanges => {
  const changes: GitLineChange[] = new Array(lineCount).fill('')
  const deletedAfter = new Map<number, string[]>()
  for (const hunk of hunks) {
    if (hunk.newCount === 0) {
      const key = hunk.newStart - 1
      deletedAfter.set(key, [...(deletedAfter.get(key) ?? []), ...hunk.oldLines])
      continue
    }
    const kind: GitLineChange = hunk.oldCount === 0 ? 'added' : 'modified'
    for (let line = hunk.newStart - 1; line < hunk.newStart - 1 + hunk.newCount; line++) {
      if (line >= 0 && line < lineCount) changes[line] = kind
    }
  }
  return { changes, deletedAfter }
}

export interface GitLineSummary {
  // Newest commit touching the range; null when every line is uncommitted.
  commit: GitCommitSummary | null
  uncommitted: boolean
  change: GitLineChange
  deleted: string[]
}

// Collapses the lines [start, end) of an annotation to what one gutter row shows.
// Deletions are attributed to the row when they sit anywhere in [start, deletionEnd),
// so text removed from the gap between two blocks is marked on the block before it.
export const summarizeLines = (
  annotation: GitAnnotation,
  changes: GitLineChanges,
  start: number,
  end: number,
  deletionEnd = end
): GitLineSummary => {
  let commit: GitCommitSummary | null = null
  let uncommitted = false
  let anyChanged = false
  let allAdded = end > start
  const deleted: string[] = []
  if (start <= 0) deleted.push(...(changes.deletedAfter.get(-1) ?? []))
  for (let line = start; line < end; line++) {
    const sha = annotation.lines[line]
    if (!sha) uncommitted = true
    else {
      const candidate = annotation.commits[sha]
      if (candidate && (!commit || candidate.authorTime > commit.authorTime)) commit = candidate
    }
    const lineChange = changes.changes[line] ?? ''
    if (lineChange) anyChanged = true
    if (lineChange !== 'added') allAdded = false
  }
  for (let line = start; line < deletionEnd; line++) {
    deleted.push(...(changes.deletedAfter.get(line) ?? []))
  }
  let change: GitLineChange = ''
  if (!annotation.inHead || (anyChanged && allAdded)) change = 'added'
  else if (anyChanged) change = 'modified'
  return { commit, uncommitted, change, deleted }
}

export const rowLabel = (summary: GitLineSummary, uncommittedLabel: string): string => {
  if (summary.commit && !summary.uncommitted) {
    return `${formatDate(summary.commit.authorTime)} ${summary.commit.author}`
  }
  return uncommittedLabel
}
