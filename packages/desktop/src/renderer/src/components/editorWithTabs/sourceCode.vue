<template>
  <div
    ref="sourceCodeContainer"
    class="source-code"
    @scroll.passive="handleScroll"
  />
</template>

<script setup lang="ts">
import {
  registerSourceView,
  captureSourceHistory,
  restoreSourceHistory
} from '../../services/documentMode'
import { ref, shallowRef, markRaw, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import { registerSourceViewState, documentViewChanged } from '@/services/documentViewState'
import { useLayoutStore } from '@/store/layout'
import {
  findMarkdownHeadingLine,
  getMarkdownHeadingLines,
  scrollSourceEditorToLine
} from '@/util/sourceModeToc'
import { storeToRefs } from 'pinia'
import type CodeMirror from 'codemirror'
import codeMirror, { setCursorAtFirstLine, setTextDirection } from '../../codeMirror'
import { wordCount as getWordCount } from '@muyajs/core'
import { adjustCursor, isWindows } from '../../util'
import { getSourceExtraKeys } from '../../codeMirror/keybindings'
import bus from '../../bus'
import { t } from '../../i18n'
import { useGitStore } from '@/store/git'
import { authorHue, formatDateTime, rowLabel, shortSha, summarizeLines } from '@/git/format'
import { oneDarkThemes, railscastsThemes } from '@/config'

interface MuyaIndexCursorLike {
  anchor: CodeMirror.Position
  focus: CodeMirror.Position
}

const props = defineProps<{
  markdown?: string
  muyaIndexCursor?: unknown
  textDirection: string
}>()

const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()
const gitStore = useGitStore()

const sourceCodeContainer = ref<HTMLDivElement | null>(null)

const editor = shallowRef<CodeMirror.Editor | null>(null)
const viewDestroyed = ref(false)
const tabId = ref<string | null>(null)
let resizeObserver: ResizeObserver | undefined
let releaseViewState: (() => void) | undefined

const {
  theme,
  sourceCode,
  sourceCodeLineNumbers,
  texMathDollars,
  texMathGfm,
  texMathSingleBackslash,
  texMathDoubleBackslash
} = storeToRefs(preferencesStore)
const { currentFile: currentTab } = storeToRefs(editorStore)

const isValidMuyaIndexCursor = (cursor: unknown): cursor is MuyaIndexCursorLike => {
  const c = cursor as MuyaIndexCursorLike | null | undefined
  return !!(c && c.anchor && c.focus)
}

watch(
  () => props.textDirection,
  (value, oldValue) => {
    if (value !== oldValue && editor.value) {
      setTextDirection(editor.value, value)
    }
  }
)

watch(sourceCodeLineNumbers, (value) => {
  editor.value?.setOption('lineNumbers', value)
})

const GIT_GUTTER = 'CodeMirror-git-annotate'
const GIT_LINE_CLASSES = ['git-line-added', 'git-line-modified', 'git-line-deleted-after']

const clearGitAnnotation = (cm: CodeMirror.Editor): void => {
  cm.clearGutter(GIT_GUTTER)
  cm.eachLine((line) => {
    for (const className of GIT_LINE_CLASSES) cm.removeLineClass(line, 'wrap', className)
  })
}

// One gutter marker per source line: date and author of the newest commit, or
// "not committed"; line classes carry the diff against HEAD.
const applyGitAnnotation = (): void => {
  const cm = editor.value
  if (!cm) return
  const show = gitStore.annotateVisible
  cm.setOption('gutters', show ? [GIT_GUTTER] : [])
  cm.operation(() => {
    clearGitAnnotation(cm)
    if (!show) return
    const annotation = gitStore.annotationFor(tabId.value)
    if (!annotation) return
    const count = cm.lineCount()
    for (let line = 0; line < count; line++) {
      const summary = summarizeLines(annotation, annotation.changes, line, line + 1)
      const commit = summary.commit && !summary.uncommitted ? summary.commit : null
      const marker = document.createElement('div')
      marker.className = commit ? 'cm-git-annotate' : 'cm-git-annotate uncommitted'
      marker.textContent = rowLabel(summary, t('git.notCommitted'))
      marker.title = commit
        ? `${shortSha(commit.sha)} · ${commit.author} · ${formatDateTime(commit.authorTime)}\n${commit.summary}`
        : t('git.notCommitted')
      if (summary.deleted.length) {
        marker.title += `\n\n${t('git.deletedHere')}\n${summary.deleted.map((text) => `- ${text}`).join('\n')}`
      }
      if (commit) marker.style.setProperty('--author-hue', String(authorHue(commit.author)))
      cm.setGutterMarker(line, GIT_GUTTER, marker)
      if (summary.change) cm.addLineClass(line, 'wrap', `git-line-${summary.change}`)
      if (summary.deleted.length) cm.addLineClass(line, 'wrap', 'git-line-deleted-after')
    }
  })
}

const handleGitGutterClick = (_cm: CodeMirror.Editor, line: number, gutter: string): void => {
  if (gutter !== GIT_GUTTER) return
  const annotation = gitStore.annotationFor(tabId.value)
  if (!annotation) return
  bus.emit('git-commit::open', { root: annotation.root, sha: annotation.lines[line] ?? '' })
}

watch([() => gitStore.annotateVisible, () => gitStore.version, tabId], applyGitAnnotation)

// A fresh instance reads these at mount; the watch is for a preference changed
// while the source view is already open (#5446).
const markdownMathMode = () => ({
  name: 'markdown-math',
  texMathDollars: texMathDollars.value,
  texMathGfm: texMathGfm.value,
  texMathSingleBackslash: texMathSingleBackslash.value,
  texMathDoubleBackslash: texMathDoubleBackslash.value
})

watch([texMathDollars, texMathGfm, texMathSingleBackslash, texMathDoubleBackslash], () => {
  editor.value?.setOption('mode', markdownMathMode())
})

const getMarkdownAndCursor = (cm: CodeMirror.Editor) => {
  let focus = cm.getCursor('head')
  let anchor = cm.getCursor('anchor')

  const markdown: string = cm.getValue()
  const convertToMuyaCursor = (cursor: CodeMirror.Position) => {
    const line = cm.getLine(cursor.line)
    const preLine = cm.getLine(cursor.line - 1)
    const nextLine = cm.getLine(cursor.line + 1)
    return adjustCursor(
      cursor,
      preLine,
      line,
      nextLine,
      (lineNumber) => {
        return cm.getLine(lineNumber)
      },
      cm.lineCount()
    )
  }

  anchor = convertToMuyaCursor(anchor)
  focus = convertToMuyaCursor(focus)

  // Normalize cursor that `anchor` is always before `focus` because
  // this is the expected behavior in Muya.
  if (anchor && focus && anchor.line > focus.line) {
    const tmpCursor = focus
    focus = anchor
    anchor = tmpCursor
  }
  return { cursor: { focus, anchor }, markdown }
}

const prepareTabSwitch = () => {
  if (tabId.value && editor.value) {
    const { cursor, markdown: newMarkdown } = getMarkdownAndCursor(editor.value)
    editorStore.LISTEN_FOR_CONTENT_CHANGE({
      id: tabId.value,
      markdown: newMarkdown,
      muyaIndexCursor: cursor
    })
    captureSourceHistory(
      tabId.value,
      editor.value,
      editorStore.tabs.find((tab) => tab.id === tabId.value)?.markdown
    )
    tabId.value = null
  }
}

interface FileChangePayloadLike {
  reason?: string
  id: string
  markdown?: string
  muyaIndexCursor?: unknown
}

const handleFileChange = (payload: unknown) => {
  const { id, markdown: newMarkdown, muyaIndexCursor, reason } = payload as FileChangePayloadLike
  if (reason === 'source-handoff') return
  if (!editor.value) return

  // On same-tab reload (external file change), preserve scroll across
  // setValue. Snapshot every plausible scroll element (the outer
  // .source-code div, CodeMirror's own scroller, and the nearest scrollable
  // ancestor) and restore each, since which one is actually active depends
  // on CodeMirror's height:auto + outer overflow:auto interplay. Re-apply
  // on nextTick and the next animation frame to outlast layout side-effects
  // from sibling handlers: muya editor.vue also listens for file-changed.
  // A cross-tab switch must instead commit the outgoing tab's state; the
  // fresh markdown from disk would otherwise overwrite uncommitted edits.
  const isSameTabReload = tabId.value && tabId.value === id
  const scrollTargets: Array<{ el: HTMLElement; top: number }> = []
  if (isSameTabReload) {
    const seen = new Set<HTMLElement>()
    const consider = (el: HTMLElement | null | undefined) => {
      if (el && !seen.has(el)) {
        seen.add(el)
        scrollTargets.push({ el, top: el.scrollTop })
      }
    }
    consider(sourceCodeContainer.value)
    consider(editor.value.getScrollerElement?.() as HTMLElement | null | undefined)
    let node: HTMLElement | null = sourceCodeContainer.value?.parentElement ?? null
    while (node && node !== document.body) {
      const overflowY = window.getComputedStyle(node).overflowY
      if (
        (overflowY === 'auto' || overflowY === 'scroll') &&
        node.scrollHeight > node.clientHeight
      ) {
        consider(node)
        break
      }
      node = node.parentElement
    }
  } else {
    prepareTabSwitch()
    tabId.value = id
  }

  if (typeof newMarkdown === 'string' && editor.value.getValue() !== newMarkdown) {
    editor.value.setValue(newMarkdown)
  }
  if (!isSameTabReload) restoreSourceHistory(id, editor.value)

  if (isValidMuyaIndexCursor(muyaIndexCursor)) {
    const { anchor, focus } = muyaIndexCursor

    editor.value.setSelection(anchor, focus, { scroll: true })
  } else if (scrollTargets.length) {
    const restoreScroll = () => {
      for (const { el, top } of scrollTargets) el.scrollTop = top
    }
    restoreScroll()
    nextTick(restoreScroll)
    requestAnimationFrame(restoreScroll)
  } else {
    setCursorAtFirstLine(editor.value)
  }
}

const handleSelectAll = () => {
  if (!sourceCode.value) {
    return
  }

  if (editor.value && editor.value.hasFocus()) {
    editor.value.execCommand('selectAll')
  } else {
    const activeElement = document.activeElement as HTMLElement | null
    const nodeName = activeElement?.nodeName
    if (nodeName === 'INPUT' || nodeName === 'TEXTAREA') {
      const selectable = activeElement as HTMLInputElement | HTMLTextAreaElement | null
      if (selectable && typeof selectable.select === 'function') {
        selectable.select()
      }
    }
  }
}

const handleUndo = () => {
  if (!sourceCode.value) {
    return
  }

  if (editor.value) {
    editor.value.execCommand('undo')
  }
}

const handleRedo = () => {
  if (!sourceCode.value) {
    return
  }

  if (editor.value) {
    editor.value.execCommand('redo')
  }
}

interface ImageActionPayload {
  id: string
  result: string
  alt: string
}

const handleImageAction = (payload: unknown) => {
  const cm = editor.value
  if (!cm) return

  const { id, result, alt } = payload as ImageActionPayload
  const value: string = cm.getValue()
  const focus = cm.getCursor('focus')
  const anchor = cm.getCursor('anchor')
  const lines: string[] = value.split('\n')
  const index = lines.findIndex((line: string) => line.indexOf(id) > 0)

  if (index > -1) {
    const oldLine = lines[index]
    lines[index] = oldLine.replace(new RegExp(`!\\[${id}\\]\\(.*\\)`), `![${alt}](${result})`)
    const newValue = lines.join('\n')
    cm.setValue(newValue)
    const match = /(!\[.*\]\(.*\))/.exec(oldLine)
    if (!match) {
      return
    }
    const range = {
      start: match.index,
      end: match.index + match[1].length
    }
    const delta = alt.length + result.length + 5 - match[1].length

    const adjustPointer = (pointer: CodeMirror.Position) => {
      if (!pointer) {
        return
      }
      if (pointer.line !== index) {
        return
      }
      if (pointer.ch <= range.start) {
        // do nothing.
      } else if (pointer.ch > range.start && pointer.ch < range.end) {
        pointer.ch = range.start + alt.length + result.length + 5
      } else {
        pointer.ch += delta
      }
    }

    adjustPointer(focus)
    adjustPointer(anchor)
    if (focus && anchor) {
      cm.setSelection(anchor, focus, { scroll: true })
    } else {
      setCursorAtFirstLine(cm)
    }
  }
}

// `cursorActivity` fires per drag step, so key the dedup on the ranges rather
// than on `getSelection()`, which copies the whole selection.
let lastSelectionKey = ''

const selectionKey = (cm: CodeMirror.Editor): string =>
  cm
    .listSelections()
    .map(({ anchor, head }) => `${anchor.line}:${anchor.ch}-${head.line}:${head.ch}`)
    .join(',')

const updateSelectionWordCount = (cm: CodeMirror.Editor) => {
  const key = selectionKey(cm)
  if (key === lastSelectionKey && editorStore.selectionWordCount != null) return
  lastSelectionKey = key

  const selectedText = cm.getSelection()
  const hasSelection = selectedText.trim().length > 0
  if (!hasSelection && editorStore.selectionWordCount == null) return

  editorStore.SET_SELECTION_WORD_COUNT(hasSelection ? getWordCount(selectedText) : null)
}

const saveContent = (cm: CodeMirror.Editor) => {
  const { cursor, markdown: newMarkdown } = getMarkdownAndCursor(cm)
  const wordCount = getWordCount(newMarkdown)
  if (!viewDestroyed.value) {
    if (tabId.value) {
      editorStore.LISTEN_FOR_CONTENT_CHANGE({
        id: tabId.value,
        markdown: newMarkdown,
        wordCount,
        muyaIndexCursor: cursor
      })
    } else {
      // This may occur during tab switching but should not occur otherwise.
      console.warn('LISTEN_FOR_CONTENT_CHANGE: Cannot commit changes because not tab id was set!')
    }
  }
}

let headingMarkdown = ''
let headingLines: number[] = []

const setActiveHeadingAtLine = (line: number): void => {
  if (!editor.value) return
  const markdown = editor.value.getValue()
  if (markdown !== headingMarkdown) {
    headingMarkdown = markdown
    headingLines = getMarkdownHeadingLines(markdown)
  }
  let slug: string | null = null
  for (let index = 0; index < editorStore.listToc.length; index++) {
    const headingLine = headingLines[index] ?? -1
    if (headingLine < 0 || headingLine > line) break
    slug = editorStore.listToc[index].slug ?? null
  }
  editorStore.SET_ACTIVE_HEADING(slug)
}

const updateActiveHeadingFromScroll = (): void => {
  const container = sourceCodeContainer.value
  if (!container || !editor.value) return
  const top = container.getBoundingClientRect().top + 80
  const line = editor.value.lineAtHeight(top, 'window')
  setActiveHeadingAtLine(line)
}

const handleScroll = (): void => {
  updateActiveHeadingFromScroll()
  documentViewChanged()
}

const listenChange = (cm: CodeMirror.Editor) => {
  cm.on('cursorActivity', (instance: CodeMirror.Editor) => {
    saveContent(instance)
    updateSelectionWordCount(instance)
    setActiveHeadingAtLine(instance.getCursor().line)
    if (tabId.value) gitStore.setCursorLine(tabId.value, instance.getCursor().line)
  })
}

// #3580: in Source Code mode the WYSIWYG container is hidden, so the
// `scroll-to-header` bus event (emitted when a TOC entry is clicked) must scroll
// CodeMirror instead. Resolve the TOC entry to its heading line in the source.
const handleScrollToHeader = (slug: unknown) => {
  if (!editor.value) return
  const index = editorStore.listToc.findIndex((item) => item.slug === slug)
  if (index < 0) return
  const line = findMarkdownHeadingLine(editor.value.getValue(), index)
  if (line < 0) return
  // `.source-code` is the scroll container (CodeMirror renders full-height with
  // viewportMargin: Infinity, so its own scroller never scrolls).
  scrollSourceEditorToLine(editor.value, line, sourceCodeContainer.value)
}

onMounted(() => {
  if (!currentTab.value) return
  const { id } = currentTab.value
  // Reset WYSIWYG scroll, block and cursor state; source mode uses different coordinates.
  currentTab.value.scrollTop = 0
  currentTab.value.blocks = undefined
  currentTab.value.cursor = undefined

  const { markdown, muyaIndexCursor, textDirection } = props
  const container = sourceCodeContainer.value
  if (!container) return
  const codeMirrorConfig: Record<string, unknown> = {
    value: markdown,
    lineNumbers: sourceCodeLineNumbers.value,
    autofocus: true,
    lineWrapping: true,
    styleActiveLine: true,
    extraKeys: getSourceExtraKeys(isWindows),
    direction: textDirection,
    viewportMargin: Infinity
  }

  if (railscastsThemes.includes(theme.value)) {
    codeMirrorConfig.theme = 'railscasts'
  } else if (oneDarkThemes.includes(theme.value)) {
    codeMirrorConfig.theme = 'one-dark'
  }

  bus.on('file-loaded', handleFileChange)
  bus.on('file-changed', handleFileChange)
  bus.on('selectAll', handleSelectAll)
  bus.on('undo', handleUndo)
  bus.on('redo', handleRedo)
  bus.on('image-action', handleImageAction)
  bus.on('scroll-to-header', handleScrollToHeader)

  // CodeMirror's line tree relies on object identity and must not be proxied by Vue.
  const codeMirrorInstance = markRaw(codeMirror(container, codeMirrorConfig))

  codeMirrorInstance.setOption('mode', markdownMathMode())

  codeMirrorInstance.on('contextmenu', (_cm: CodeMirror.Editor, event: Event) => {
    event.preventDefault()
    event.stopPropagation()
  })

  if (isValidMuyaIndexCursor(muyaIndexCursor)) {
    const { anchor, focus } = muyaIndexCursor
    codeMirrorInstance.setSelection(anchor, focus, { scroll: true })
  } else {
    setCursorAtFirstLine(codeMirrorInstance)
  }

  restoreSourceHistory(id, codeMirrorInstance)
  editor.value = codeMirrorInstance
  tabId.value = id
  updateSelectionWordCount(codeMirrorInstance)

  // Pane resizing rewraps lines without triggering CodeMirror's window-resize listener.
  let measuredWidth = 0
  resizeObserver = new ResizeObserver(([entry]) => {
    const width = entry.contentRect.width
    if (width <= 0 || width === measuredWidth) return
    measuredWidth = width
    codeMirrorInstance.refresh()
    updateActiveHeadingFromScroll()
  })
  resizeObserver.observe(codeMirrorInstance.getWrapperElement())

  releaseViewState = registerSourceViewState({
    documentId: () => tabId.value,
    view: { editor: codeMirrorInstance, container }
  })
  codeMirrorInstance.on('cursorActivity', documentViewChanged)
  listenChange(codeMirrorInstance)
  codeMirrorInstance.on('gutterClick', handleGitGutterClick)
  applyGitAnnotation()
  registerSourceView(async () => {
    if (useLayoutStore().managed) {
      if (editor.value) saveContent(editor.value)
      return
    }
    preferencesStore.SET_MODE({ type: 'sourceCode', checked: false })
    preferencesStore.DISPATCH_EDITOR_VIEW_STATE({ sourceCode: false })
    await nextTick()
  })
})

onBeforeUnmount(() => {
  releaseViewState?.()
  editor.value?.off('cursorActivity', documentViewChanged)
  resizeObserver?.disconnect()
  registerSourceView(null)
  if (editor.value) {
    saveContent(editor.value)
    captureSourceHistory(
      tabId.value,
      editor.value,
      editorStore.tabs.find((tab) => tab.id === tabId.value)?.markdown
    )
  }
  viewDestroyed.value = true

  bus.off('file-loaded', handleFileChange)
  bus.off('file-changed', handleFileChange)
  bus.off('selectAll', handleSelectAll)
  bus.off('undo', handleUndo)
  bus.off('redo', handleRedo)
  bus.off('image-action', handleImageAction)
  editorStore.SET_SELECTION_WORD_COUNT(null)
  lastSelectionKey = ''
  bus.off('scroll-to-header', handleScrollToHeader)

  if (editor.value) {
    const { cursor, markdown: newMarkdown } = getMarkdownAndCursor(editor.value)
    bus.emit('file-changed', {
      reason: 'source-handoff',
      id: tabId.value,
      markdown: newMarkdown,
      muyaIndexCursor: cursor,
      renderCursor: true
    })
  }
})
</script>

<style>
.source-code {
  height: 100%;
  box-sizing: border-box;
  overflow: auto;
}
.source-code .CodeMirror {
  height: auto;
  margin: 50px auto;
  max-width: var(--editorAreaWidth);
  background: transparent;
}
.source-code .CodeMirror-gutters {
  border-right: none;
  background-color: transparent;
}
.source-code .CodeMirror-activeline-background,
.source-code .CodeMirror-activeline-gutter {
  background: var(--floatHoverColor);
}
/* Fade the delimiters against the formula. Dimming the inherited colour rather
   than naming one is what carries across every theme; 0.65 is the lowest value
   still clearing 3:1 in all of them, with one-dark at 3.67 setting the floor. */
.source-code .CodeMirror .cm-formatting-math {
  opacity: 0.65;
}
.source-code .CodeMirror-git-annotate {
  width: 150px;
}
.source-code .cm-git-annotate {
  box-sizing: border-box;
  height: 100%;
  padding: 0 6px 0 8px;
  border-left: 3px solid transparent;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 11px;
  color: var(--editorColor80);
  background: hsla(var(--author-hue, 0), 55%, 55%, 0.16);
  cursor: pointer;
}
.source-code .cm-git-annotate.uncommitted {
  background: transparent;
  color: var(--editorColor50);
  font-style: italic;
}
.source-code .git-line-added .cm-git-annotate {
  border-left-color: #30a46c;
}
.source-code .git-line-modified .cm-git-annotate {
  border-left-color: #3b82f6;
}
.source-code .git-line-deleted-after .cm-git-annotate {
  box-shadow: inset 0 -2px 0 #e5484d;
}
</style>
