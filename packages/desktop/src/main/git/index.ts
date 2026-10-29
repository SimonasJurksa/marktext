import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import log from 'electron-log'
import type {
  GitAnnotation,
  GitCommitDetails,
  GitRootStatus,
  GitStatusEntry
} from '@shared/types/git'
import {
  parseBlamePorcelain,
  parseCommitDetails,
  parseStatusPorcelain,
  parseUnifiedDiff
} from './parsers'

const GIT_TIMEOUT_MS = 20000
// Blame output of a large document plus the repository status.
const GIT_MAX_BUFFER = 64 * 1024 * 1024
const SHA_RE = /^[0-9a-f]{4,40}$/

interface GitResult {
  // -1 when git could not be started at all (not installed, cwd missing).
  code: number
  stdout: string
  stderr: string
}

export interface GitRepoInfo {
  root: string
  // Path inside the repository with forward slashes; '' for the root itself.
  relPath: string
}

const runGit = (cwd: string, args: string[], input?: string): Promise<GitResult> =>
  new Promise((resolve) => {
    const child = execFile(
      'git',
      args,
      {
        cwd,
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: GIT_MAX_BUFFER,
        encoding: 'utf8',
        // No lock files for a read-only query; C locale keeps messages parseable.
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' }
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ code: 0, stdout, stderr })
          return
        }
        const code = (error as NodeJS.ErrnoException & { code?: number | string }).code
        resolve({ code: typeof code === 'number' ? code : -1, stdout, stderr })
      }
    )
    const stdin = child.stdin
    if (!stdin) return
    // git may exit before reading all of stdin (e.g. "no such path"); that EPIPE is expected.
    stdin.on('error', () => {})
    stdin.end(input ?? '')
  })

const isDirectory = (pathname: string): boolean => {
  try {
    return statSync(pathname).isDirectory()
  } catch {
    return false
  }
}

// Works for files and directories; the file itself need not exist yet.
export const getRepoInfo = async(pathname: string): Promise<GitRepoInfo | null> => {
  const directory = isDirectory(pathname) ? pathname : path.dirname(pathname)
  const result = await runGit(directory, ['rev-parse', '--show-toplevel', '--show-prefix'])
  if (result.code !== 0) return null
  const [root, prefix = ''] = result.stdout.split('\n')
  if (!root) return null
  const relPath = directory === pathname ? prefix.replace(/\/$/, '') : prefix + path.basename(pathname)
  return { root, relPath }
}

const getStatusEntries = async(root: string): Promise<GitStatusEntry[]> => {
  const result = await runGit(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
  if (result.code !== 0) {
    log.warn(`git status failed in ${root}: ${result.stderr.trim()}`)
    return []
  }
  return parseStatusPorcelain(result.stdout)
}

export const getRootStatus = async(pathname: string): Promise<GitRootStatus | null> => {
  const info = await getRepoInfo(pathname)
  if (!info) return null
  return { root: info.root, entries: await getStatusEntries(info.root) }
}

const blameContents = async(
  root: string,
  relPath: string,
  contents: string
): Promise<Pick<GitAnnotation, 'inHead' | 'commits' | 'lines'>> => {
  const result = await runGit(
    root,
    ['blame', '--porcelain', '--contents', '-', '--', relPath],
    contents
  )
  if (result.code !== 0) {
    if (!/no such path/.test(result.stderr)) {
      log.warn(`git blame failed for ${relPath}: ${result.stderr.trim()}`)
    }
    return { inHead: false, commits: {}, lines: [] }
  }
  return { inHead: true, ...parseBlamePorcelain(result.stdout) }
}

// Diff of the given contents against HEAD, via a temporary copy of the HEAD
// version: `git diff --no-index` can read one side from stdin but not both.
const diffAgainstHead = async(
  root: string,
  relPath: string,
  contents: string
): Promise<GitAnnotation['hunks']> => {
  const head = await runGit(root, ['show', `HEAD:${relPath}`])
  if (head.code !== 0) return []
  const directory = await mkdtemp(path.join(os.tmpdir(), 'marktext-git-'))
  try {
    const headFile = path.join(directory, 'head')
    await writeFile(headFile, head.stdout, 'utf8')
    const diff = await runGit(
      root,
      ['diff', '--no-index', '--no-color', '-U0', '--', headFile, '-'],
      contents
    )
    // Exit code 1 means "differences found".
    if (diff.code !== 0 && diff.code !== 1) {
      log.warn(`git diff failed for ${relPath}: ${diff.stderr.trim()}`)
      return []
    }
    return parseUnifiedDiff(diff.stdout)
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }
}

export const annotateFile = async(
  filePath: string,
  contents: string,
  withStatus: boolean
): Promise<GitAnnotation | null> => {
  const info = await getRepoInfo(filePath)
  if (!info) return null
  const { root, relPath } = info
  const [blame, hunks, status] = await Promise.all([
    blameContents(root, relPath, contents),
    diffAgainstHead(root, relPath, contents),
    withStatus ? getStatusEntries(root) : Promise.resolve(undefined)
  ])
  const annotation: GitAnnotation = { root, relPath, ...blame, hunks }
  if (status) annotation.status = status
  return annotation
}

export const getCommitDetails = async(
  root: string,
  sha: string
): Promise<GitCommitDetails | null> => {
  if (!SHA_RE.test(sha)) return null
  const [show, files] = await Promise.all([
    runGit(root, ['show', '-s', '--format=%H%x00%an%x00%ae%x00%at%x00%cn%x00%ct%x00%B', sha, '--']),
    runGit(root, ['show', '--name-status', '--format=', '--no-renames', sha, '--'])
  ])
  if (show.code !== 0) return null
  return parseCommitDetails(show.stdout, files.code === 0 ? files.stdout : '')
}
