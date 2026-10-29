import { computed, markRaw, onScopeDispose, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type { GitAnnotation, GitCommitSummary, GitFileStatus } from '@shared/types/git'
import bus from '@/bus'
import { useEditorStore } from './editor'
import { useProjectStore } from './project'
import type { BlockRanges } from '@/git/blockLines'
import { lineChanges, type GitLineChanges } from '@/git/format'

export const ANNOTATE_VISIBLE_KEY = 'git:annotate-visible'
// Edits settle for this long before blame and diff are recomputed.
export const REFRESH_DELAY_MS = 1000
// A directory outside any repository is not asked again for this long.
const NOT_A_REPO_TTL_MS = 60000

export interface TabAnnotation extends GitAnnotation {
  // The contents the blame and hunks describe.
  markdown: string
  // Derived once per annotation; shared by every consumer.
  changes: GitLineChanges
}

export interface CurrentLineInfo {
  root: string
  sha: string
  commit: GitCommitSummary | null
  uncommitted: boolean
}

interface AnnotationRequest {
  id: string
  pathname: string
  markdown: string
  withStatus: boolean
}

const loadVisible = (): boolean => {
  try {
    return localStorage.getItem(ANNOTATE_VISIBLE_KEY) === '1'
  } catch {
    return false
  }
}

const saveVisible = (value: boolean): void => {
  try {
    localStorage.setItem(ANNOTATE_VISIBLE_KEY, value ? '1' : '0')
  } catch {
    // Per-window convenience only.
  }
}

export const useGitStore = defineStore('git', () => {
  const editorStore = useEditorStore()
  const projectStore = useProjectStore()

  const annotateVisible = ref(loadVisible())
  const annotations = ref(new Map<string, TabAnnotation>())
  const statusByRoot = ref(new Map<string, Map<string, GitFileStatus>>())
  const blockRanges = ref(new Map<string, BlockRanges>())
  const cursorLine = ref(new Map<string, number>())
  // Bumped whenever an annotation or status changes; cheap to watch.
  const version = ref(0)

  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const inFlight = new Map<string, Promise<void>>()
  const queued = new Map<string, AnnotationRequest>()
  const notARepoUntil = new Map<string, number>()

  const toggleAnnotate = (): void => {
    annotateVisible.value = !annotateVisible.value
    saveVisible(annotateVisible.value)
  }

  const setAnnotateVisible = (value: boolean): void => {
    annotateVisible.value = value
    saveVisible(value)
  }

  const annotationFor = (tabId: string | null | undefined): TabAnnotation | null =>
    (tabId && annotations.value.get(tabId)) || null

  const applyStatus = (root: string, entries: GitAnnotation['status']): void => {
    if (!entries) return
    const map = new Map<string, GitFileStatus>()
    for (const entry of entries) map.set(entry.path, entry.status)
    statusByRoot.value.set(root, markRaw(map))
  }

  const run = async(request: AnnotationRequest): Promise<void> => {
    const directory = window.path.dirname(request.pathname)
    const skipUntil = notARepoUntil.get(directory)
    if (skipUntil && skipUntil > Date.now()) return
    let result: GitAnnotation | null = null
    try {
      result = await window.git.annotate(request.pathname, request.markdown, request.withStatus)
    } catch (error) {
      console.warn('git annotate failed', error)
    }
    if (!result) {
      notARepoUntil.set(directory, Date.now() + NOT_A_REPO_TTL_MS)
      if (annotations.value.delete(request.id)) version.value++
      return
    }
    notARepoUntil.delete(directory)
    const annotation: TabAnnotation = markRaw({
      ...result,
      markdown: request.markdown,
      changes: lineChanges(result.hunks, request.markdown.split('\n').length)
    })
    annotations.value.set(request.id, annotation)
    applyStatus(result.root, result.status)
    version.value++
  }

  const start = (request: AnnotationRequest): void => {
    const pending = inFlight.get(request.id)
    if (pending) {
      const previous = queued.get(request.id)
      queued.set(request.id, {
        ...request,
        withStatus: request.withStatus || !!previous?.withStatus
      })
      return
    }
    const task = run(request).finally(() => {
      inFlight.delete(request.id)
      const next = queued.get(request.id)
      queued.delete(request.id)
      if (next) start(next)
    })
    inFlight.set(request.id, task)
  }

  const requestAnnotation = (
    tab: { id: string; pathname?: string; markdown: string } | null | undefined,
    options: { immediate?: boolean; withStatus?: boolean } = {}
  ): void => {
    if (!tab?.pathname) return
    const request: AnnotationRequest = {
      id: tab.id,
      pathname: tab.pathname,
      markdown: tab.markdown,
      withStatus: !!options.withStatus
    }
    const timer = timers.get(tab.id)
    if (timer) clearTimeout(timer)
    if (options.immediate) {
      timers.delete(tab.id)
      start(request)
      return
    }
    timers.set(
      tab.id,
      setTimeout(() => {
        timers.delete(tab.id)
        start(request)
      }, REFRESH_DELAY_MS)
    )
  }

  const forgetTab = (tabId: string): void => {
    const timer = timers.get(tabId)
    if (timer) clearTimeout(timer)
    timers.delete(tabId)
    queued.delete(tabId)
    if (annotations.value.delete(tabId)) version.value++
    blockRanges.value.delete(tabId)
    cursorLine.value.delete(tabId)
  }

  const refreshRootStatus = async(pathnames: string[]): Promise<void> => {
    for (const pathname of pathnames) {
      try {
        const status = await window.git.status(pathname)
        if (status) {
          applyStatus(status.root, status.entries)
          version.value++
        }
      } catch (error) {
        console.warn('git status failed', error)
      }
    }
  }

  const refreshProjectStatus = (): void => {
    const pathnames = projectStore.roots
      .filter((root) => root.status === 'ready')
      .map((root) => root.pathname)
    if (pathnames.length) void refreshRootStatus(pathnames)
  }

  const fileStatus = (pathname: string | null | undefined): GitFileStatus | undefined => {
    if (!pathname) return undefined
    for (const [root, entries] of statusByRoot.value) {
      if (pathname === root || !pathname.startsWith(root + '/')) continue
      const status = entries.get(pathname.slice(root.length + 1))
      if (status) return status
    }
    return undefined
  }

  const setBlockRanges = (tabId: string, ranges: BlockRanges): void => {
    blockRanges.value.set(tabId, markRaw(ranges))
  }

  const setCursorLine = (tabId: string, line: number): void => {
    cursorLine.value.set(tabId, line)
  }

  const setCursorBlock = (tabId: string, blockIndex: number): void => {
    const range = blockRanges.value.get(tabId)?.ranges[blockIndex]
    if (range) cursorLine.value.set(tabId, range.start)
  }

  const currentLine = computed<CurrentLineInfo | null>(() => {
    const tab = editorStore.currentFile
    if (!tab) return null
    // Read `version` so a fresh annotation re-evaluates this.
    void version.value
    const annotation = annotations.value.get(tab.id)
    // Before the caret has been placed, the document's first line stands in.
    const line = cursorLine.value.get(tab.id) ?? 0
    if (!annotation || line < 0 || line >= annotation.lines.length) return null
    const sha = annotation.lines[line]
    return { root: annotation.root, sha, commit: sha ? (annotation.commits[sha] ?? null) : null, uncommitted: !sha }
  })

  watch(
    () => editorStore.currentFile?.id,
    () => requestAnnotation(editorStore.currentFile, { immediate: true, withStatus: true }),
    { immediate: true }
  )
  watch(
    () => editorStore.currentFile?.markdown,
    () => requestAnnotation(editorStore.currentFile)
  )
  watch(
    () => editorStore.currentFile?.isSaved,
    (saved) => {
      if (saved) {
        requestAnnotation(editorStore.currentFile, { immediate: true, withStatus: true })
        refreshProjectStatus()
      }
    }
  )
  watch(
    () => projectStore.roots.map((root) => `${root.pathname}:${root.status}`).join('\n'),
    () => refreshProjectStatus(),
    { immediate: true }
  )
  watch(
    () => editorStore.tabs.map((tab) => tab.id),
    (ids) => {
      for (const id of [...annotations.value.keys()]) if (!ids.includes(id)) forgetTab(id)
    }
  )
  const onFocus = (): void => {
    requestAnnotation(editorStore.currentFile, { immediate: true, withStatus: true })
    refreshProjectStatus()
  }
  window.addEventListener('focus', onFocus)
  bus.on('git-annotate::toggle', toggleAnnotate)
  onScopeDispose(() => {
    window.removeEventListener('focus', onFocus)
    bus.off('git-annotate::toggle', toggleAnnotate)
  })

  return {
    annotateVisible,
    annotations,
    statusByRoot,
    blockRanges,
    cursorLine,
    version,
    currentLine,
    toggleAnnotate,
    setAnnotateVisible,
    annotationFor,
    requestAnnotation,
    refreshRootStatus,
    refreshProjectStatus,
    fileStatus,
    setBlockRanges,
    setCursorLine,
    setCursorBlock,
    forgetTab
  }
})
