// Git data exchanged between the main process (which runs the `git` CLI) and the renderer.

export type GitFileStatus =
  | 'modified'
  | 'added'
  | 'untracked'
  | 'deleted'
  | 'renamed'
  | 'conflict'

export interface GitStatusEntry {
  // Relative to the repository root, forward slashes.
  path: string
  status: GitFileStatus
}

export interface GitCommitSummary {
  sha: string
  author: string
  authorMail: string
  // Unix seconds.
  authorTime: number
  summary: string
}

export interface GitHunk {
  // 1-based line numbers as in unified diff headers. A pure deletion has
  // `newCount === 0` and `newStart` is the line after which the text was removed.
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  oldLines: string[]
  newLines: string[]
}

export interface GitAnnotation {
  root: string
  relPath: string
  // False for files that HEAD does not contain: every line is then uncommitted.
  inHead: boolean
  commits: Record<string, GitCommitSummary>
  // One entry per line of the annotated contents: a commit SHA, or '' for lines
  // that are not committed yet.
  lines: string[]
  hunks: GitHunk[]
  // Omitted when the caller asked for blame and diff only.
  status?: GitStatusEntry[]
}

export interface GitRootStatus {
  root: string
  entries: GitStatusEntry[]
}

export interface GitCommitDetails {
  sha: string
  author: string
  authorMail: string
  authorTime: number
  committer: string
  commitTime: number
  // Full message: subject, blank line, body.
  message: string
  files: Array<{ status: string; path: string }>
}
