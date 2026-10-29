import bus from '@/bus'
import { useEditorStore } from '@/store/editor'
import type { NavigationPlace } from './history'

/** Caret or selection in 0-based markdown source coordinates, as the tab state stores it. */
export interface SourceCursor {
  isCollapsed: boolean
  anchor: { line: number; ch: number }
  focus: { line: number; ch: number }
}

export const caretAt = (line: number, ch = 0): SourceCursor => ({
  isCollapsed: true,
  anchor: { line, ch },
  focus: { line, ch }
})

/**
 * Shows a file with the caret at `cursor`: in its tab when the file is open
 * (matched by tab id first, then by path), otherwise by asking main to open
 * it. An untitled place whose buffer is gone cannot be shown and is ignored.
 */
export const openFileAtCursor = (
  pathname: string,
  cursor: SourceCursor,
  tabId: string | null = null
): void => {
  const editorStore = useEditorStore()
  const tab = editorStore.tabs.find(
    (file) =>
      (tabId !== null && file.id === tabId) ||
      (!!pathname && !!file.pathname && window.fileUtils.isSamePathSync(file.pathname, pathname))
  )
  if (tab) {
    // WYSIWYG reads `cursor`, source code mode reads `muyaIndexCursor`; both
    // understand line/ch pairs.
    tab.cursor = cursor
    tab.muyaIndexCursor = cursor
    if (editorStore.currentFile?.id !== tab.id) {
      editorStore.UPDATE_CURRENT_FILE(tab)
      return
    }
    bus.emit('file-changed', {
      id: tab.id,
      markdown: tab.markdown,
      cursor,
      muyaIndexCursor: cursor,
      renderCursor: true,
      history: tab.history
    })
    return
  }
  if (pathname) window.electron.ipcRenderer.send('mt::open-file', pathname, { cursor })
}

export const openFileAtLine = (place: NavigationPlace): void =>
  openFileAtCursor(place.pathname, caretAt(place.line), place.tabId)
