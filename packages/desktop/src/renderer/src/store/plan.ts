import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { PlanFileStatus } from '@shared/types/plan'
import { parsePlanQuestions } from '@/planQuestions'
import { useEditorStore } from './editor'
import { useProjectStore } from './project'

/** Several tree events arrive per change on disk; one request per burst is plenty. */
const BATCH_DELAY = 200

interface FolderLike {
  folders: FolderLike[]
  files: { pathname: string; isMarkdown: boolean }[]
}

const markdownFilesIn = (folder: FolderLike, found: string[]): void => {
  for (const file of folder.files) {
    if (file.isMarkdown) found.push(file.pathname)
  }
  for (const child of folder.folders) markdownFilesIn(child, found)
}

/**
 * Question progress of every markdown file the file tree lists, so a plan can
 * show whether anything is left to answer without being opened. Open tabs are
 * counted from their buffer; everything else is read from disk by main.
 */
export const usePlanStore = defineStore('plan', () => {
  const editorStore = useEditorStore()
  const projectStore = useProjectStore()
  const diskStatus = ref(new Map<string, PlanFileStatus>())
  const markdownPaths = new Set<string>()
  const pending = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = async(): Promise<void> => {
    timer = null
    const pathnames = [...pending]
    pending.clear()
    if (!pathnames.length) return
    const result = await window.plan.status(pathnames)
    for (const pathname of pathnames) {
      const status = result[pathname]
      if (status) diskStatus.value.set(pathname, status)
      else diskStatus.value.delete(pathname)
    }
  }

  const refresh = (pathnames: string[]): void => {
    for (const pathname of pathnames) pending.add(pathname)
    if (timer === null) {
      timer = setTimeout(() => {
        void flush()
      }, BATCH_DELAY)
    }
  }

  const forget = (pathname: string): void => {
    markdownPaths.delete(pathname)
    pending.delete(pathname)
    diskStatus.value.delete(pathname)
  }

  const liveStatus = computed(() => {
    const map = new Map<string, PlanFileStatus | null>()
    for (const tab of editorStore.tabs) {
      if (!tab.pathname) continue
      const { total, answered } = parsePlanQuestions(tab.markdown)
      map.set(tab.pathname, total ? { total, answered } : null)
    }
    return map
  })

  const fileStatus = (pathname: string): PlanFileStatus | null => {
    const live = liveStatus.value
    if (live.has(pathname)) return live.get(pathname) ?? null
    return diskStatus.value.get(pathname) ?? null
  }

  const scanRoots = (): void => {
    const found: string[] = []
    for (const root of projectStore.roots) markdownFilesIn(root.tree, found)
    for (const pathname of found) markdownPaths.add(pathname)
    refresh(found)
  }
  // Roots present before this store started; later files arrive as tree events.
  scanRoots()

  window.electron.ipcRenderer.on('mt::update-object-tree', (_e, payload) => {
    const { type, change } = payload
    const pathname = change.pathname
    if (type === 'add' && change.isMarkdown) {
      markdownPaths.add(pathname)
      refresh([pathname])
    } else if (type === 'change' && markdownPaths.has(pathname)) {
      refresh([pathname])
    } else if (type === 'unlink') {
      forget(pathname)
    } else if (type === 'unlinkDir') {
      for (const known of [...markdownPaths]) {
        if (known.startsWith(`${pathname}/`)) forget(known)
      }
    }
  })

  // A closed tab stops shadowing the disk, which may have been saved meanwhile.
  const pathByTab = new Map<string, string>()
  watch(
    () => editorStore.tabs.map((tab) => [tab.id, tab.pathname] as const),
    (tabs) => {
      const open = new Set(tabs.map(([id]) => id))
      for (const [id, pathname] of pathByTab) {
        if (open.has(id)) continue
        pathByTab.delete(id)
        if (pathname && markdownPaths.has(pathname)) refresh([pathname])
      }
      for (const [id, pathname] of tabs) pathByTab.set(id, pathname)
    },
    { immediate: true }
  )

  return { diskStatus, fileStatus, refresh }
})
