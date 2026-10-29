<template>
  <button
    v-if="info"
    type="button"
    class="git-blame-line title-no-drag"
    :class="{ uncommitted: info.uncommitted }"
    :title="title"
    @click.stop="openCommit"
  >
    {{ text }}
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import bus from '@/bus'
import { useGitStore } from '@/store/git'
import { formatDateTime, relativeTime, shortSha } from '@/git/format'

const { t, locale } = useI18n()
const gitStore = useGitStore()

const info = computed(() => gitStore.currentLine)

const text = computed(() => {
  const current = info.value
  if (!current) return ''
  if (!current.commit) return t('git.notCommitted')
  const { author, authorTime, summary } = current.commit
  return `${author} · ${relativeTime(authorTime, Date.now(), locale.value)} · ${summary}`
})

const title = computed(() => {
  const current = info.value
  if (!current?.commit) return t('git.notCommitted')
  const { sha, author, authorMail, authorTime, summary } = current.commit
  return `${shortSha(sha)} · ${author} <${authorMail}> · ${formatDateTime(authorTime)}\n${summary}`
})

const openCommit = (): void => {
  const current = info.value
  if (!current) return
  bus.emit('git-commit::open', { root: current.root, sha: current.sha })
}
</script>

<style scoped>
.git-blame-line {
  max-width: 340px;
  margin-right: 10px;
  padding: 0 6px;
  border: none;
  background: transparent;
  font-size: 12px;
  line-height: 20px;
  color: var(--editorColor50);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  -webkit-app-region: no-drag;
}
.git-blame-line:hover {
  color: var(--editorColor);
}
.git-blame-line.uncommitted {
  font-style: italic;
}
</style>
