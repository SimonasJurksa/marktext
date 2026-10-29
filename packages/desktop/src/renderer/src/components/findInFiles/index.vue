<template>
  <div class="find-in-files">
    <el-dialog
      v-model="visible"
      :modal="true"
      class="ag-dialog-table find-in-files-dialog"
      width="92%"
      top="4vh"
      :title="t('findInFiles.title')"
      @opened="focusQuery"
      @closed="handleClosed"
    >
      <div class="fif__body">
        <div class="fif__query-row">
          <textarea
            ref="queryInput"
            v-model="query"
            class="fif__query"
            rows="1"
            spellcheck="false"
            :placeholder="t('findInFiles.queryPlaceholder')"
            @keydown="handleQueryKeydown"
          />
          <div class="fif__toggles">
            <button
              type="button"
              class="fif__toggle"
              :class="{ active: isCaseSensitive }"
              :title="t('search.caseSensitive')"
              :aria-pressed="isCaseSensitive"
              @click="isCaseSensitive = !isCaseSensitive"
            >Cc</button>
            <button
              type="button"
              class="fif__toggle"
              :class="{ active: isWholeWord }"
              :title="t('search.wholeWord')"
              :aria-pressed="isWholeWord"
              @click="isWholeWord = !isWholeWord"
            >W</button>
            <button
              type="button"
              class="fif__toggle"
              :class="{ active: isRegexp }"
              :title="t('search.useRegex')"
              :aria-pressed="isRegexp"
              @click="isRegexp = !isRegexp"
            >.*</button>
          </div>
          <el-button
            v-if="!running"
            type="primary"
            class="fif__search-button"
            @click="search"
          >
            {{ t('findInFiles.search') }}
          </el-button>
          <el-button
            v-else
            class="fif__search-button"
            @click="stop"
          >
            {{ t('findInFiles.stop') }}
          </el-button>
        </div>

        <div class="fif__scope-row">
          <label class="fif__field fif__field--directory">
            <span>{{ t('findInFiles.directory') }}</span>
            <input
              v-model="directory"
              type="text"
              class="fif__input"
              list="fif-directory-history"
              spellcheck="false"
              @keydown.enter.prevent="search"
            >
            <datalist id="fif-directory-history">
              <option
                v-for="item in history"
                :key="item"
                :value="item"
              />
            </datalist>
          </label>
          <el-button
            class="fif__browse"
            :title="t('findInFiles.browse')"
            @click="browse"
          >
            …
          </el-button>
          <label class="fif__field fif__field--mask">
            <span>{{ t('findInFiles.fileMask') }}</span>
            <input
              v-model="fileMask"
              type="text"
              class="fif__input"
              spellcheck="false"
              :placeholder="t('findInFiles.fileMaskPlaceholder')"
              @keydown.enter.prevent="search"
            >
          </label>
        </div>

        <div
          ref="resultsEl"
          class="fif__results"
          tabindex="0"
          role="listbox"
          :aria-label="t('findInFiles.title')"
          @keydown="handleResultsKeydown"
        >
          <template
            v-for="group in results"
            :key="group.filePath"
          >
            <div
              class="fif__file"
              :title="group.filePath"
            >
              <span class="fif__file-name">{{ fileName(group.filePath) }}</span>
              <span class="fif__file-dir">{{ relativeDir(group.filePath) }}</span>
              <span class="fif__file-count">{{ group.matches.length }}</span>
            </div>
            <div
              v-for="entry in group.entries"
              :key="entry.key"
              class="fif__match"
              :class="{ selected: entry.index === selectedIndex }"
              role="option"
              :aria-selected="entry.index === selectedIndex"
              :data-index="entry.index"
              @click="select(entry.index)"
              @dblclick="openSelected"
            >
              <span class="fif__match-line">{{ entry.match.range[0][0] + 1 }}</span>
              <span class="fif__match-text">
                <template v-if="entry.highlight">{{ entry.highlight.before }}<mark>{{ entry.highlight.hit }}</mark>{{ entry.highlight.after }}</template>
                <template v-else>{{ entry.text }}</template>
              </span>
            </div>
          </template>
          <div
            v-if="!results.length"
            class="fif__empty"
          >
            {{ emptyText }}
          </div>
        </div>

        <div
          ref="previewEl"
          class="fif__preview"
        >
          <div
            v-if="preview && !preview.tooLarge"
            class="fif__preview-lines"
          >
            <div
              v-if="preview.window.start > 0"
              class="fif__preview-gap"
            >…</div>
            <div
              v-for="line in preview.visible"
              :key="line.number"
              class="fif__preview-line"
              :class="{ hit: line.hit }"
              :data-line="line.number"
            ><span class="fif__preview-number">{{ line.number + 1 }}</span><span class="fif__preview-text">{{ line.text }}</span></div>
            <div
              v-if="preview.window.end < preview.lineCount"
              class="fif__preview-gap"
            >…</div>
          </div>
          <div
            v-else
            class="fif__preview-empty"
          >
            {{ preview?.tooLarge ? t('findInFiles.previewTooLarge') : t('findInFiles.previewEmpty') }}
          </div>
        </div>
      </div>

      <template #footer>
        <div class="fif__footer">
          <span
            class="fif__status"
            :class="{ error: !!errorText }"
          >{{ statusText }}</span>
          <span class="fif__buttons">
            <el-button
              type="primary"
              :disabled="selectedIndex < 0"
              @click="openSelected"
            >
              {{ t('findInFiles.open') }}
            </el-button>
          </span>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import log from 'electron-log'
import bus from '@/bus'
import { useEditorStore } from '@/store/editor'
import { useProjectStore } from '@/store/project'
import { usePreferencesStore } from '@/store/preferences'
import RipgrepDirectorySearcher from '@/node/ripgrepSearcher'
import { openFileAtCursor } from '@/navigation/openAt'
import {
  FIND_IN_FILES_LIMIT,
  buildPattern,
  displayLine,
  loadState,
  parseFileMask,
  previewWindow,
  pushHistory,
  saveState
} from './helpers'

interface SearchMatch {
  matchText: string
  lineText: string
  range: [[number, number], [number, number]]
}

interface SearchResult {
  filePath: string
  matches: SearchMatch[]
}

interface ResultEntry {
  key: string
  index: number
  filePath: string
  match: SearchMatch
  text: string
  highlight: { before: string; hit: string; after: string } | null
}

interface ResultGroup extends SearchResult {
  entries: ResultEntry[]
}

interface PreviewLine {
  number: number
  text: string
  hit: boolean
}

interface Preview {
  path: string
  lineCount: number
  tooLarge: boolean
  window: { start: number; end: number }
  visible: PreviewLine[]
}

const PREVIEW_MAX_BYTES = 2 * 1024 * 1024

const { t } = useI18n()
const editorStore = useEditorStore()
const projectStore = useProjectStore()
const preferencesStore = usePreferencesStore()
const { currentFile } = storeToRefs(editorStore)
const { availableRoots } = storeToRefs(projectStore)
const { searchMaxFileSize } = storeToRefs(preferencesStore)

const searcher = new RipgrepDirectorySearcher()

const visible = ref(false)
const query = ref('')
const directory = ref('')
const history = ref<string[]>([])
const fileMask = ref('*.md')
const isCaseSensitive = ref(false)
const isWholeWord = ref(false)
const isRegexp = ref(false)

const results = ref<ResultGroup[]>([])
const selectedIndex = ref(-1)
const running = ref(false)
const stoppedAtLimit = ref(false)
const errorText = ref('')
const searched = ref(false)
const preview = ref<Preview | null>(null)
let previewText: { path: string; lines: string[] } | null = null

const queryInput = ref<HTMLTextAreaElement | null>(null)
const resultsEl = ref<HTMLElement | null>(null)
const previewEl = ref<HTMLElement | null>(null)

let sequence = 0
let cancelCurrent: (() => void) | null = null
let entryCount = 0

const entries = computed<ResultEntry[]>(() => results.value.flatMap((group) => group.entries))
const matchCount = computed(() => entries.value.length)

const statusText = computed(() => {
  if (errorText.value) return errorText.value
  if (running.value) return t('findInFiles.searching')
  if (stoppedAtLimit.value) return t('findInFiles.limited', { count: FIND_IN_FILES_LIMIT })
  if (!searched.value) return ''
  return t('search.searchResultInfo', { matchCount: matchCount.value, fileCount: results.value.length })
})

const emptyText = computed(() => {
  if (running.value) return t('findInFiles.searching')
  if (searched.value && !errorText.value) return t('findInFiles.noResults')
  return ''
})

const fileName = (filePath: string): string => window.path.basename(filePath)

const relativeDir = (filePath: string): string => {
  const dir = window.path.dirname(filePath)
  const root = directory.value.replace(/[\\/]+$/, '')
  if (root && dir.startsWith(root)) {
    const rest = dir.slice(root.length).replace(/^[\\/]/, '')
    return rest || '.'
  }
  return dir
}

const highlightFor = (text: string, needle: string): ResultEntry['highlight'] => {
  const hit = displayLine(needle)
  if (!hit) return null
  const at = isCaseSensitive.value ? text.indexOf(hit) : text.toLowerCase().indexOf(hit.toLowerCase())
  if (at === -1) return null
  return { before: text.slice(0, at), hit: text.slice(at, at + hit.length), after: text.slice(at + hit.length) }
}

const toGroup = (result: SearchResult): ResultGroup => ({
  ...result,
  entries: result.matches.map((match) => {
    const text = displayLine(match.lineText)
    return {
      key: `${result.filePath}:${match.range[0][0]}:${match.range[0][1]}`,
      index: entryCount++,
      filePath: result.filePath,
      match,
      text,
      highlight: highlightFor(text, match.matchText)
    }
  })
})

const persist = (): void => {
  saveState({
    directory: directory.value,
    history: history.value,
    fileMask: fileMask.value,
    isCaseSensitive: isCaseSensitive.value,
    isWholeWord: isWholeWord.value,
    isRegexp: isRegexp.value
  })
}

const defaultDirectory = (): string => {
  const root = availableRoots.value[0]?.pathname
  if (root) return root
  const pathname = currentFile.value?.pathname
  return pathname ? window.path.dirname(pathname) : ''
}

const focusQuery = (): void => {
  nextTick(() => {
    queryInput.value?.focus()
    queryInput.value?.select()
  })
}

const open = (): void => {
  const state = loadState()
  history.value = state.history
  fileMask.value = state.fileMask
  isCaseSensitive.value = state.isCaseSensitive
  isWholeWord.value = state.isWholeWord
  isRegexp.value = state.isRegexp
  directory.value = state.directory || defaultDirectory()
  visible.value = true
  bus.emit('editor-blur')
  if (visible.value) focusQuery()
}

const resetResults = (): void => {
  results.value = []
  entryCount = 0
  selectedIndex.value = -1
  stoppedAtLimit.value = false
  errorText.value = ''
  preview.value = null
  previewText = null
}

const stop = (): void => {
  cancelCurrent?.()
  cancelCurrent = null
  running.value = false
}

const search = async(): Promise<void> => {
  const seq = ++sequence
  stop()
  resetResults()
  const dir = directory.value.trim()
  const { pattern, isRegexp: regexp } = buildPattern(query.value, isRegexp.value)
  if (!pattern.trim() || !dir) {
    if (!dir) errorText.value = t('findInFiles.noDirectory')
    return
  }
  const isDir = await window.fileUtils.isDirectory(dir).catch(() => false)
  if (seq !== sequence) return
  if (!isDir) {
    errorText.value = t('findInFiles.invalidDirectory', { path: dir })
    return
  }

  history.value = pushHistory(history.value, dir)
  persist()
  searched.value = true
  running.value = true
  const { inclusions, exclusions } = parseFileMask(fileMask.value)
  let total = 0

  const cancellable = searcher.search([dir], pattern, {
    didMatch: (res: unknown) => {
      if (seq !== sequence || !res) return
      const result = res as SearchResult
      if (!result.matches?.length) return
      let matches = result.matches
      if (total + matches.length > FIND_IN_FILES_LIMIT) {
        matches = matches.slice(0, Math.max(0, FIND_IN_FILES_LIMIT - total))
        stoppedAtLimit.value = true
      }
      total += matches.length
      if (matches.length) results.value.push(toGroup({ filePath: result.filePath, matches }))
      if (selectedIndex.value === -1 && entries.value.length) void select(0)
      if (stoppedAtLimit.value) {
        cancellable.cancel()
        running.value = false
        cancelCurrent = null
      }
    },
    isCaseSensitive: isCaseSensitive.value,
    isWholeWord: isWholeWord.value,
    isRegexp: regexp,
    inclusions: inclusions.length ? inclusions : undefined,
    exclusions: exclusions.length ? exclusions : undefined,
    // Search everywhere: hidden files and ignore files (.gitignore) do not limit the scope.
    includeHidden: true,
    noIgnore: true,
    followSymlinks: false,
    maxFileSize: searchMaxFileSize.value || null
  })
  cancelCurrent = cancellable.cancel.bind(cancellable)

  cancellable
    .then(() => {
      if (seq !== sequence) return
      running.value = false
      cancelCurrent = null
    })
    .catch((err: unknown) => {
      if (seq !== sequence) return
      log.error('Find in files failed:', err)
      running.value = false
      cancelCurrent = null
      const message = err instanceof Error ? err.message : String(err)
      errorText.value = results.value.length ? t('sideBar.search.partialSearch') : message
    })
}

const loadPreview = async(filePath: string): Promise<{ path: string; lines: string[] } | null> => {
  if (previewText?.path === filePath) return previewText
  const stat = await window.fileUtils.stat(filePath).catch(() => null)
  if (!stat || (stat as { size?: number }).size! > PREVIEW_MAX_BYTES) return null
  const content = await window.fileUtils.readFile(filePath, 'utf8').catch(() => '')
  previewText = { path: filePath, lines: String(content).split(/\r?\n/) }
  return previewText
}

const select = async(index: number): Promise<void> => {
  const entry = entries.value[index]
  if (!entry) return
  selectedIndex.value = index
  const seq = sequence
  const text = await loadPreview(entry.filePath)
  if (seq !== sequence || selectedIndex.value !== index) return
  if (!text) {
    preview.value = { path: entry.filePath, lineCount: 0, tooLarge: true, window: { start: 0, end: 0 }, visible: [] }
    return
  }
  const [[firstLine], [lastLine]] = entry.match.range
  const win = previewWindow(text.lines.length, firstLine)
  const visibleLines: PreviewLine[] = []
  for (let number = win.start; number < win.end; number++) {
    visibleLines.push({
      number,
      text: text.lines[number] ?? '',
      hit: number >= firstLine && number <= lastLine
    })
  }
  preview.value = { path: entry.filePath, lineCount: text.lines.length, tooLarge: false, window: win, visible: visibleLines }
  nextTick(() => {
    previewEl.value?.querySelector<HTMLElement>('.fif__preview-line.hit')?.scrollIntoView({ block: 'center' })
    resultsEl.value?.querySelector<HTMLElement>(`.fif__match[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' })
  })
}

const moveSelection = (delta: number): void => {
  if (!entries.value.length) return
  const next = Math.min(entries.value.length - 1, Math.max(0, selectedIndex.value + delta))
  void select(next)
}

const openMatch = (filePath: string, range: SearchMatch['range']): void => {
  openFileAtCursor(filePath, {
    isCollapsed: range[0][0] !== range[1][0],
    anchor: { line: range[0][0], ch: range[0][1] },
    focus: { line: range[1][0], ch: range[1][1] }
  })
}

const openSelected = (): void => {
  const entry = entries.value[selectedIndex.value]
  if (!entry) return
  visible.value = false
  openMatch(entry.filePath, entry.match.range)
}

const browse = async(): Promise<void> => {
  const picked = await window.fileUtils.pickDirectory(directory.value || undefined).catch(() => '')
  if (picked) {
    directory.value = picked
    persist()
  }
}

const handleQueryKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    if (event.ctrlKey || event.metaKey) openSelected()
    else void search()
  } else if (event.key === 'ArrowDown' && entries.value.length && event.altKey) {
    event.preventDefault()
    resultsEl.value?.focus()
  }
}

const handleResultsKeydown = (event: KeyboardEvent): void => {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      moveSelection(1)
      break
    case 'ArrowUp':
      event.preventDefault()
      moveSelection(-1)
      break
    case 'Home':
      event.preventDefault()
      void select(0)
      break
    case 'End':
      event.preventDefault()
      void select(entries.value.length - 1)
      break
    case 'Enter':
      event.preventDefault()
      openSelected()
      break
    default:
      break
  }
}

const handleClosed = (): void => {
  stop()
  persist()
}

watch([isCaseSensitive, isWholeWord, isRegexp], () => {
  persist()
  if (searched.value) void search()
})

onMounted(() => {
  bus.on('find-in-files::open', open)
})

onBeforeUnmount(() => {
  bus.off('find-in-files::open', open)
  stop()
})
</script>

<style>
.find-in-files-dialog .el-dialog__body {
  padding: 0 20px 8px;
}
</style>

<style scoped>
.fif__body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 76vh;
  color: var(--editorColor);
}
.fif__query-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.fif__query {
  flex: 1 1 auto;
  min-height: 34px;
  max-height: 120px;
  padding: 6px 8px;
  border: 1px solid var(--floatBorderColor);
  border-radius: 6px;
  background: var(--editorBgColor);
  color: var(--editorColor);
  font: inherit;
  font-size: 14px;
  line-height: 20px;
  resize: vertical;
}
.fif__query:focus,
.fif__input:focus {
  outline: none;
  border-color: var(--themeColor);
}
.fif__toggles {
  display: flex;
  gap: 4px;
  padding-top: 3px;
}
.fif__toggle {
  min-width: 30px;
  height: 28px;
  padding: 0 6px;
  border: 1px solid var(--floatBorderColor);
  border-radius: 4px;
  background: transparent;
  color: var(--editorColor80);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.fif__toggle.active {
  border-color: var(--themeColor);
  background: var(--itemBgColor);
  color: var(--themeColor);
}
.fif__search-button {
  margin-top: 1px;
}
.fif__scope-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}
.fif__field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 11px;
  color: var(--editorColor80);
}
.fif__field--directory {
  flex: 1 1 auto;
  min-width: 0;
}
.fif__field--mask {
  flex: 0 0 240px;
}
.fif__input {
  width: 100%;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--floatBorderColor);
  border-radius: 4px;
  background: var(--editorBgColor);
  color: var(--editorColor);
  font: inherit;
  font-size: 13px;
}
.fif__browse {
  margin: 0;
}
.fif__results {
  flex: 0 0 42%;
  overflow-y: auto;
  border: 1px solid var(--floatBorderColor);
  border-radius: 6px;
  font-size: 13px;
  outline: none;
}
.fif__results:focus {
  border-color: var(--themeColor);
}
.fif__file {
  position: sticky;
  top: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 4px 10px;
  background: var(--sideBarBgColor);
  font-weight: 600;
}
.fif__file-dir {
  flex: 1 1 auto;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-weight: 400;
  font-size: 11px;
  color: var(--editorColor50);
}
.fif__file-count {
  font-size: 11px;
  color: var(--editorColor50);
}
.fif__match {
  display: flex;
  gap: 10px;
  padding: 3px 10px 3px 18px;
  cursor: pointer;
  white-space: nowrap;
}
.fif__match:hover {
  background: var(--floatHoverColor);
}
.fif__match.selected {
  background: var(--itemBgColor);
}
.fif__match-line {
  flex: 0 0 44px;
  text-align: right;
  color: var(--editorColor50);
  font-variant-numeric: tabular-nums;
}
.fif__match-text {
  overflow: hidden;
  text-overflow: ellipsis;
}
.fif__match-text mark {
  background: var(--highlightColor);
  color: inherit;
  border-radius: 2px;
}
.fif__empty,
.fif__preview-empty {
  padding: 24px;
  text-align: center;
  color: var(--editorColor50);
}
.fif__preview {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--floatBorderColor);
  border-radius: 6px;
  background: var(--editorBgColor);
  font-family: var(--editorCodeFontFamily, monospace);
  font-size: 12px;
  line-height: 18px;
}
.fif__preview-lines {
  padding: 4px 0;
}
.fif__preview-line {
  display: flex;
  white-space: pre;
}
.fif__preview-line.hit {
  background: var(--highlightColor);
}
.fif__preview-number {
  flex: 0 0 52px;
  padding-right: 10px;
  text-align: right;
  color: var(--editorColor40);
  user-select: none;
}
.fif__preview-gap {
  padding: 2px 12px;
  color: var(--editorColor50);
}
.fif__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.fif__status {
  font-size: 12px;
  color: var(--editorColor80);
}
.fif__status.error {
  color: #e5484d;
}
</style>
