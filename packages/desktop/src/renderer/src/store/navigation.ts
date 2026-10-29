import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref, watch } from 'vue'
import type { IFileState } from '@shared/types/files'
import bus from '../bus'
import { useEditorStore } from './editor'
import { useGitStore } from './git'
import { JUMP_LINES, NavigationHistory, type NavigationPlace } from '@/navigation/history'
import { openFileAtLine } from '@/navigation/openAt'

/**
 * A restore that has not landed within this time is given up on, so later
 * caret moves count as the user's own again.
 */
const RESTORE_TIMEOUT = 2000

/**
 * Back/forward over editing places (mouse side buttons, Ctrl+Alt+Left/Right).
 * Caret lines come from the git store, which both editing modes already feed.
 */
export const useNavigationStore = defineStore('navigation', () => {
  const editorStore = useEditorStore()
  const gitStore = useGitStore()
  const history = new NavigationHistory()
  // Bumped on every history change so computed state re-reads the plain class.
  const version = ref(0)
  let restoring: { place: NavigationPlace; until: number } | null = null

  const canGoBack = computed(() => {
    void version.value
    return history.canGoBack
  })
  const canGoForward = computed(() => {
    void version.value
    return history.canGoForward
  })

  const placeOf = (tab: IFileState, line: number): NavigationPlace => ({
    pathname: tab.pathname || '',
    tabId: tab.id,
    line
  })

  const sameFile = (a: NavigationPlace, b: NavigationPlace): boolean =>
    a.pathname ? a.pathname === b.pathname : a.tabId === b.tabId

  // While a restore is in flight, the tab being left still reports its caret
  // and the target reports a default caret before the saved one is applied;
  // neither may become a history entry.
  const visit = (tab: IFileState, line: number): void => {
    const place = placeOf(tab, line)
    if (restoring) {
      const timedOut = Date.now() > restoring.until
      const landed = sameFile(place, restoring.place) && Math.abs(line - restoring.place.line) <= JUMP_LINES
      if (!timedOut && !landed) return
      restoring = null
    }
    history.visit(place)
    version.value++
  }

  watch(
    () => editorStore.currentFile?.id,
    () => {
      const tab = editorStore.currentFile
      if (tab) visit(tab, gitStore.cursorLine.get(tab.id) ?? 0)
    },
    { immediate: true }
  )
  watch(
    () => {
      const tab = editorStore.currentFile
      return tab ? gitStore.cursorLine.get(tab.id) : undefined
    },
    (line) => {
      const tab = editorStore.currentFile
      if (tab && typeof line === 'number') visit(tab, line)
    }
  )
  watch(
    () => editorStore.tabs.map((tab) => tab.id),
    (ids, previous) => {
      for (const id of previous ?? []) {
        if (ids.includes(id)) continue
        history.forgetTab(id)
        version.value++
      }
    }
  )

  const show = (place: NavigationPlace | null): void => {
    if (!place) return
    restoring = { place, until: Date.now() + RESTORE_TIMEOUT }
    version.value++
    openFileAtLine(place)
  }
  const back = (): void => show(history.back())
  const forward = (): void => show(history.forward())

  bus.on('navigation::back', back)
  bus.on('navigation::forward', forward)
  onScopeDispose(() => {
    bus.off('navigation::back', back)
    bus.off('navigation::forward', forward)
  })

  return { history, version, canGoBack, canGoForward, back, forward }
})
