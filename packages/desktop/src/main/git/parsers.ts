import type {
  GitCommitDetails,
  GitCommitSummary,
  GitFileStatus,
  GitHunk,
  GitStatusEntry
} from '@shared/types/git'

export const UNCOMMITTED_SHA = '0'.repeat(40)

export interface ParsedBlame {
  commits: Record<string, GitCommitSummary>
  lines: string[]
}

const BLAME_HEADER_RE = /^([0-9a-f]{40}) (\d+) (\d+)(?: (\d+))?$/

// `git blame --porcelain`: a header line per source line, commit fields only the
// first time a commit appears, and the line text prefixed with a tab.
export const parseBlamePorcelain = (output: string): ParsedBlame => {
  const commits: Record<string, GitCommitSummary> = {}
  const lines: string[] = []
  let current: GitCommitSummary | null = null
  let currentLine = 0
  for (const raw of output.split('\n')) {
    if (raw.startsWith('\t')) {
      if (current) lines[currentLine - 1] = current.sha === UNCOMMITTED_SHA ? '' : current.sha
      continue
    }
    const header = BLAME_HEADER_RE.exec(raw)
    if (header) {
      const sha = header[1]
      currentLine = Number(header[3])
      current = commits[sha] ?? { sha, author: '', authorMail: '', authorTime: 0, summary: '' }
      commits[sha] = current
      continue
    }
    if (!current) continue
    const space = raw.indexOf(' ')
    const key = space < 0 ? raw : raw.slice(0, space)
    const value = space < 0 ? '' : raw.slice(space + 1)
    switch (key) {
      case 'author':
        current.author = value
        break
      case 'author-mail':
        current.authorMail = value.replace(/^<|>$/g, '')
        break
      case 'author-time':
        current.authorTime = Number(value) || 0
        break
      case 'summary':
        current.summary = value
        break
    }
  }
  delete commits[UNCOMMITTED_SHA]
  for (let i = 0; i < lines.length; i++) if (lines[i] === undefined) lines[i] = ''
  return { commits, lines }
}

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

export const parseUnifiedDiff = (output: string): GitHunk[] => {
  const hunks: GitHunk[] = []
  let hunk: GitHunk | null = null
  for (const line of output.split('\n')) {
    const header = HUNK_RE.exec(line)
    if (header) {
      hunk = {
        oldStart: Number(header[1]),
        oldCount: header[2] === undefined ? 1 : Number(header[2]),
        newStart: Number(header[3]),
        newCount: header[4] === undefined ? 1 : Number(header[4]),
        oldLines: [],
        newLines: []
      }
      hunks.push(hunk)
      continue
    }
    if (!hunk) continue
    if (line.startsWith('-')) hunk.oldLines.push(line.slice(1))
    else if (line.startsWith('+')) hunk.newLines.push(line.slice(1))
  }
  return hunks
}

const statusFromCodes = (index: string, worktree: string): GitFileStatus => {
  if (index === '?' || worktree === '?') return 'untracked'
  if (index === 'U' || worktree === 'U' || (index === 'A' && worktree === 'A') || (index === 'D' && worktree === 'D'))
    return 'conflict'
  if (index === 'D' || worktree === 'D') return 'deleted'
  if (index === 'R' || worktree === 'R') return 'renamed'
  if (index === 'A') return 'added'
  return 'modified'
}

// `git status --porcelain=v1 -z`: `XY path`, renames followed by the old path as a
// separate NUL-terminated record.
export const parseStatusPorcelain = (output: string): GitStatusEntry[] => {
  const records = output.split('\0')
  const entries: GitStatusEntry[] = []
  for (let i = 0; i < records.length; i++) {
    const record = records[i]
    if (record.length < 4) continue
    const index = record[0]
    const worktree = record[1]
    const path = record.slice(3)
    if (index === '!') continue
    entries.push({ path, status: statusFromCodes(index, worktree) })
    if (index === 'R' || index === 'C' || worktree === 'R' || worktree === 'C') i++
  }
  return entries
}

// `git show -s --format=%H%x00%an%x00%ae%x00%at%x00%cn%x00%ct%x00%B`
export const parseCommitDetails = (output: string, nameStatus: string): GitCommitDetails | null => {
  const parts = output.split('\0')
  if (parts.length < 7 || !/^[0-9a-f]{40}$/.test(parts[0])) return null
  const files: GitCommitDetails['files'] = []
  for (const line of nameStatus.split('\n')) {
    const tab = line.indexOf('\t')
    if (tab < 1) continue
    const status = line.slice(0, tab)
    const paths = line.slice(tab + 1).split('\t')
    files.push({ status: status[0], path: paths[paths.length - 1] })
  }
  return {
    sha: parts[0],
    author: parts[1],
    authorMail: parts[2],
    authorTime: Number(parts[3]) || 0,
    committer: parts[4],
    commitTime: Number(parts[5]) || 0,
    message: parts.slice(6).join('\0').replace(/\n+$/, ''),
    files
  }
}
