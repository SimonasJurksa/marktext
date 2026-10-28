/** Pure helpers for the Find in Files dialog (kept separate so they are unit-testable). */

export const FIND_IN_FILES_LIMIT = 100
export const HISTORY_SIZE = 10
export const DEFAULT_FILE_MASK = '*.md'

const STORAGE_PREFIX = 'find-in-files:'

export interface FindInFilesState {
  directory: string
  history: string[]
  fileMask: string
  isCaseSensitive: boolean
  isWholeWord: boolean
  isRegexp: boolean
}

export const DEFAULT_STATE: FindInFilesState = {
  directory: '',
  history: [],
  fileMask: DEFAULT_FILE_MASK,
  isCaseSensitive: false,
  isWholeWord: false,
  isRegexp: false
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Turns the query box content into a ripgrep pattern. Real line breaks (typed
 * with Shift+Enter) and the two characters `\n` in regex mode both mean "end
 * of line" and match CRLF files too. A literal query spanning lines is escaped
 * into a regex so ripgrep can run it in multiline mode.
 */
export const buildPattern = (query: string, isRegexp: boolean): { pattern: string; isRegexp: boolean } => {
  const raw = query.replace(/\r\n?/g, '\n')
  if (isRegexp) {
    const pattern = raw
      .replace(/\n/g, '\\n')
      .replace(/(?<!\\)\\n/g, '\\r?\\n')
    return { pattern, isRegexp: true }
  }
  if (!raw.includes('\n')) return { pattern: raw, isRegexp: false }
  return { pattern: raw.split('\n').map(escapeRegExp).join('\\r?\\n'), isRegexp: true }
}

/**
 * Parses a PhpStorm-style file mask (`*.md, *.txt, !*.min.js`) into ripgrep
 * inclusion and exclusion globs. An empty mask means every file.
 */
export const parseFileMask = (mask: string): { inclusions: string[]; exclusions: string[] } => {
  const inclusions: string[] = []
  const exclusions: string[] = []
  for (const token of mask.split(/[,;\s]+/)) {
    const glob = token.trim()
    if (!glob) continue
    if (glob.startsWith('!')) {
      if (glob.length > 1) exclusions.push(glob.slice(1))
    } else {
      inclusions.push(glob)
    }
  }
  return { inclusions, exclusions }
}

/** Puts `directory` first in the history, dropping duplicates and old entries. */
export const pushHistory = (history: string[], directory: string): string[] => {
  const entry = directory.trim()
  if (!entry) return history
  return [entry, ...history.filter((item) => item !== entry)].slice(0, HISTORY_SIZE)
}

export const loadState = (): FindInFilesState => {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}state`)
    if (!raw) return { ...DEFAULT_STATE }
    const parsed = JSON.parse(raw) as Partial<FindInFilesState>
    return {
      directory: typeof parsed.directory === 'string' ? parsed.directory : '',
      history: Array.isArray(parsed.history) ? parsed.history.filter((item) => typeof item === 'string') : [],
      fileMask: typeof parsed.fileMask === 'string' ? parsed.fileMask : DEFAULT_FILE_MASK,
      isCaseSensitive: !!parsed.isCaseSensitive,
      isWholeWord: !!parsed.isWholeWord,
      isRegexp: !!parsed.isRegexp
    }
  } catch {
    return { ...DEFAULT_STATE }
  }
}

export const saveState = (state: FindInFilesState): void => {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}state`, JSON.stringify(state))
  } catch {
    // Storage can be unavailable; the settings still apply for this session.
  }
}

/** Collapses a (possibly multi-line) matched line into one display line. */
export const displayLine = (lineText: string): string =>
  lineText.replace(/\r/g, '').replace(/\n/g, ' ↵ ').trim()

/** Window of lines to render in the preview so huge files stay responsive. */
export const previewWindow = (
  lineCount: number,
  focusLine: number,
  maxLines = 10000,
  radius = 500
): { start: number; end: number } => {
  if (lineCount <= maxLines) return { start: 0, end: lineCount }
  const start = Math.max(0, focusLine - radius)
  return { start, end: Math.min(lineCount, start + radius * 2) }
}
