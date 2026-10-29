import fs from 'fs'
import { parsePlanQuestions } from 'common/planQuestions/parser'
import { hasMarkdownExtension } from 'common/filesystem/paths'
import type { PlanFileStatus } from '@shared/types/plan'

/** Plans are short; anything larger is some other document and is skipped unread. */
const MAX_BYTES = 2 * 1024 * 1024
const CONCURRENCY = 8

const readStatus = async(pathname: string): Promise<PlanFileStatus | null> => {
  try {
    const stat = await fs.promises.stat(pathname)
    if (!stat.isFile() || stat.size > MAX_BYTES) return null
    const { total, answered } = parsePlanQuestions(await fs.promises.readFile(pathname, 'utf8'))
    return total ? { total, answered } : null
  } catch {
    return null
  }
}

/**
 * Question progress of the given markdown files. Files without questions,
 * unreadable files and non-markdown paths are left out of the result, so a
 * caller can drop its stale entry for any path that does not come back.
 */
export const getPlanStatus = async(pathnames: string[]): Promise<Record<string, PlanFileStatus>> => {
  const queue = pathnames.filter((pathname) => hasMarkdownExtension(pathname))
  const result: Record<string, PlanFileStatus> = {}
  const worker = async(): Promise<void> => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      const status = await readStatus(next)
      if (status) result[next] = status
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  return result
}
