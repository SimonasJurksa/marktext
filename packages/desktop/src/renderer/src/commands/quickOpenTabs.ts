import bus from '../bus'
import { delay } from '@/util'
import getCommandDescriptionById from './descriptions'
import { t } from '../i18n'
import type { IFileState } from '@shared/types/files'

// Content matches shown per tab, so one huge file cannot flood the list.
const MAX_CONTENT_MATCHES_PER_TAB = 5
const SNIPPET_LENGTH = 80

interface TabsSubcommand {
  id: string
  description: string
  detail: string
  title: string
  group: string
}

interface TabsEditorState {
  tabs: IFileState[]
  currentFile: IFileState | Record<string, never> | null
  UPDATE_CURRENT_FILE: (file: IFileState) => void
}

type Match = { tabId: string; query: string | null }

/**
 * "Switch to open file" (Ctrl+E): lists only the tabs that are
 * open in this window and filters them by file name, path, or content.
 */
class QuickOpenTabsCommand {
  id: string
  description: string
  placeholder: string
  shortcut: string | null
  noResultsText: string
  subcommands: TabsSubcommand[]
  subcommandSelectedIndex: number
  private _editorState: TabsEditorState
  private _matches = new Map<string, Match>()

  constructor(editorState: TabsEditorState) {
    this.id = 'file.quick-open-tabs'
    this.description = getCommandDescriptionById('file.quick-open-tabs')
    this.placeholder = t('commandPalette.placeholders.searchOpenTabs')
    this.shortcut = null
    this.noResultsText = t('commandPalette.noOpenTabs')

    this.subcommands = []
    this.subcommandSelectedIndex = -1
    this._editorState = editorState
  }

  run = async(): Promise<void> => {
    const { tabs, currentFile } = this._editorState
    if (!tabs.length) throw new Error(null as unknown as string)

    this._matches.clear()
    this.subcommands = tabs.map((tab) => this._toTabItem(tab))
    // Preselect the first tab that is not the active one, so Ctrl+E, Enter
    // jumps to the previous document.
    const currentId = currentFile && 'id' in currentFile ? currentFile.id : null
    const next = tabs.findIndex((tab) => tab.id !== currentId)
    this.subcommandSelectedIndex = next === -1 ? 0 : next
  }

  search = async(query: string): Promise<TabsSubcommand[]> => {
    const needle = query.trim().toLowerCase()
    this._matches.clear()
    const { tabs } = this._editorState
    if (!needle) {
      return tabs.map((tab) => this._toTabItem(tab))
    }

    const nameMatches: TabsSubcommand[] = []
    const contentMatches: TabsSubcommand[] = []
    for (const tab of tabs) {
      const name = this._tabName(tab)
      if (name.toLowerCase().includes(needle) || tab.pathname.toLowerCase().includes(needle)) {
        nameMatches.push(this._toTabItem(tab))
      }
      contentMatches.push(...this._contentMatches(tab, needle, query.trim()))
    }
    return [...nameMatches, ...contentMatches]
  }

  execute = async(): Promise<void> => {
    // Timeout to hide the command palette and then show again to prevent issues.
    await delay(100)
    bus.emit('show-command-palette', this)
  }

  executeSubcommand = async(id: string): Promise<void> => {
    const match = this._matches.get(id) ?? { tabId: id, query: null }
    const tab = this._editorState.tabs.find((entry) => entry.id === match.tabId)
    if (!tab) return

    this._editorState.UPDATE_CURRENT_FILE(tab)
    if (match.query) {
      // Let the editor render the switched tab before opening the find bar.
      await delay(150)
      bus.emit('find', { query: match.query })
    } else {
      bus.emit('editor-focus')
    }
  }

  unload = (): void => {
    this.subcommands = []
    this._matches.clear()
  }

  private _tabName = (tab: IFileState): string => {
    return tab.pathname ? window.path.basename(tab.pathname) : tab.filename
  }

  private _toTabItem = (tab: IFileState): TabsSubcommand => {
    const name = this._tabName(tab)
    this._matches.set(tab.id, { tabId: tab.id, query: null })
    return {
      id: tab.id,
      description: tab.isSaved ? name : `● ${name}`,
      detail: tab.pathname ? window.path.dirname(tab.pathname) : '',
      title: tab.pathname || tab.filename,
      group: t('commandPalette.openTabs')
    }
  }

  private _contentMatches = (tab: IFileState, needle: string, query: string): TabsSubcommand[] => {
    const markdown = tab.markdown ?? ''
    if (!markdown.toLowerCase().includes(needle)) return []

    const items: TabsSubcommand[] = []
    const lines = markdown.split(/\r?\n/)
    for (let index = 0; index < lines.length && items.length < MAX_CONTENT_MATCHES_PER_TAB; index++) {
      const line = lines[index] ?? ''
      const column = line.toLowerCase().indexOf(needle)
      if (column === -1) continue

      const id = `${tab.id}:${index + 1}`
      this._matches.set(id, { tabId: tab.id, query })
      items.push({
        id,
        description: this._snippet(line, column),
        detail: `${this._tabName(tab)}:${index + 1}`,
        title: tab.pathname || tab.filename,
        group: t('commandPalette.inOpenTabs')
      })
    }
    return items
  }

  private _snippet = (line: string, column: number): string => {
    const start = Math.max(0, column - Math.floor(SNIPPET_LENGTH / 3))
    const text = line.slice(start, start + SNIPPET_LENGTH).trim()
    return `${start > 0 ? '…' : ''}${text}${start + SNIPPET_LENGTH < line.length ? '…' : ''}`
  }
}

export default QuickOpenTabsCommand
