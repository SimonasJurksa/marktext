<template>
  <div
    class="git-gutter"
    :style="{ left: `${left}px`, width: `${GUTTER_WIDTH}px` }"
    @wheel.prevent="forwardWheel"
  >
    <div
      class="git-gutter__rows"
      :style="{ transform: `translateY(${-scrollTop}px)` }"
    >
      <div
        v-for="row in rows"
        :key="row.key"
        class="git-gutter__row"
        :class="[row.change ? `is-${row.change}` : '', { 'has-deleted': row.deleted.length, uncommitted: row.uncommitted }]"
        :style="{ top: `${row.top}px`, height: `${row.height}px`, '--author-hue': row.hue }"
        :title="row.title"
        @click="openRow(row)"
      >
        <span class="git-gutter__label">{{ row.label }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import bus from '@/bus'
import { useGitStore } from '@/store/git'
import { blockDomNodes, computeBlockRanges, type BlockRanges } from '@/git/blockLines'
import { authorHue, formatDateTime, rowLabel, shortSha, summarizeLines } from '@/git/format'
import { GUTTER_WIDTH } from '@/git/constants'

interface Row {
  key: number
  top: number
  height: number
  label: string
  title: string
  change: string
  deleted: string[]
  uncommitted: boolean
  sha: string
  hue: number
}

const props = defineProps<{
  engine: unknown
  container: HTMLElement | null
  tabId: string
}>()

const { t } = useI18n()
const gitStore = useGitStore()

const rows = ref<Row[]>([])
const scrollTop = ref(0)
const left = ref(0)

let ranges: BlockRanges | null = null
let rangesVersion = -1
let rangesBlockCount = -1
let frame = 0
let resizeObserver: ResizeObserver | null = null
let mutationObserver: MutationObserver | null = null

const rowTitle = (summary: ReturnType<typeof summarizeLines>): string => {
  const parts: string[] = []
  if (summary.commit && !summary.uncommitted) {
    const { commit } = summary
    parts.push(`${shortSha(commit.sha)} · ${commit.author} · ${formatDateTime(commit.authorTime)}`)
    parts.push(commit.summary)
  } else {
    parts.push(t('git.notCommitted'))
  }
  if (summary.deleted.length) {
    parts.push('', t('git.deletedHere'), ...summary.deleted.map((line) => `- ${line}`))
  }
  return parts.join('\n')
}

const measure = (): void => {
  frame = 0
  const { container, engine } = props
  const annotation = gitStore.annotationFor(props.tabId)
  if (!container || !engine || !annotation) {
    rows.value = []
    return
  }
  const doms = blockDomNodes(engine)
  if (!ranges || rangesVersion !== gitStore.version || rangesBlockCount !== doms.length) {
    ranges = computeBlockRanges(engine)
    rangesVersion = gitStore.version
    rangesBlockCount = doms.length
  }
  const containerRect = container.getBoundingClientRect()
  const content = container.querySelector('.mu-container')
  if (content) {
    left.value = Math.max(0, content.getBoundingClientRect().left - containerRect.left - GUTTER_WIDTH)
  }
  const next: Row[] = []
  for (let index = 0; index < doms.length; index++) {
    const dom = doms[index]
    const range = ranges.ranges[index]
    if (!dom || !range) continue
    const rect = dom.getBoundingClientRect()
    if (rect.height <= 0) continue
    const following = ranges.ranges.slice(index + 1).find((item) => item !== null)
    const deletionEnd = following ? following.start : annotation.lines.length
    const summary = summarizeLines(annotation, annotation.changes, range.start, range.end, deletionEnd)
    const commit = summary.commit && !summary.uncommitted ? summary.commit : null
    next.push({
      key: index,
      top: rect.top - containerRect.top + container.scrollTop,
      height: rect.height,
      label: rowLabel(summary, t('git.notCommitted')),
      title: rowTitle(summary),
      change: summary.change,
      deleted: summary.deleted,
      uncommitted: !commit,
      sha: commit?.sha ?? '',
      hue: commit ? authorHue(commit.author) : 0
    })
  }
  rows.value = next
  scrollTop.value = container.scrollTop
}

const scheduleMeasure = (): void => {
  if (frame) return
  frame = requestAnimationFrame(measure)
}

const onScroll = (): void => {
  if (props.container) scrollTop.value = props.container.scrollTop
}

const forwardWheel = (event: WheelEvent): void => {
  props.container?.scrollBy({ top: event.deltaY })
}

const openRow = (row: Row): void => {
  const annotation = gitStore.annotationFor(props.tabId)
  if (!annotation) return
  bus.emit('git-commit::open', { root: annotation.root, sha: row.sha })
}

const observe = (): void => {
  resizeObserver?.disconnect()
  mutationObserver?.disconnect()
  const { container } = props
  if (!container) return
  resizeObserver = new ResizeObserver(scheduleMeasure)
  resizeObserver.observe(container)
  const content = container.querySelector('.mu-container')
  if (content) resizeObserver.observe(content)
  mutationObserver = new MutationObserver(scheduleMeasure)
  mutationObserver.observe(container, { childList: true, subtree: true, characterData: true, attributes: true })
  container.addEventListener('scroll', onScroll, { passive: true })
}

watch(() => gitStore.version, scheduleMeasure)
watch(() => props.tabId, scheduleMeasure)
watch(
  () => props.container,
  () => {
    observe()
    scheduleMeasure()
  }
)

onMounted(() => {
  observe()
  scheduleMeasure()
})

onBeforeUnmount(() => {
  if (frame) cancelAnimationFrame(frame)
  resizeObserver?.disconnect()
  mutationObserver?.disconnect()
  props.container?.removeEventListener('scroll', onScroll)
})
</script>

<style scoped>
.git-gutter {
  position: absolute;
  top: 0;
  bottom: 0;
  overflow: hidden;
  z-index: 1;
  border-right: 1px solid var(--editorColor10);
  font-family: var(--editorFontFamily, sans-serif);
  font-size: 11px;
  line-height: 18px;
  user-select: none;
  background: var(--editorBgColor);
}
.git-gutter__rows {
  position: relative;
  will-change: transform;
}
.git-gutter__row {
  position: absolute;
  left: 0;
  right: 0;
  box-sizing: border-box;
  padding: 1px 6px 0 8px;
  border-left: 3px solid transparent;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--editorColor80);
  background: hsla(var(--author-hue), 55%, 55%, 0.16);
  cursor: pointer;
}
.git-gutter__row:hover {
  background: hsla(var(--author-hue), 55%, 55%, 0.32);
}
.git-gutter__row.uncommitted {
  background: transparent;
  color: var(--editorColor50);
  font-style: italic;
}
.git-gutter__row.is-added {
  border-left-color: #30a46c;
}
.git-gutter__row.is-modified {
  border-left-color: #3b82f6;
}
.git-gutter__row.has-deleted {
  box-shadow: inset 0 -2px 0 #e5484d;
}
.git-gutter__label {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
