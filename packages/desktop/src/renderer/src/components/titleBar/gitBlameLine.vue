<template>
  <button
    v-if="info"
    type="button"
    class="git-blame-line title-no-drag"
    :class="{ uncommitted: info.uncommitted }"
    :title="title"
    :aria-label="title"
    @click.stop="openCommit"
  >
    <svg viewBox="0 0 16 16">
      <circle
        cx="8"
        cy="8"
        r="3"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        :stroke-dasharray="info.uncommitted ? '2.4 1.6' : undefined"
      />
      <path
        d="M0.8 8H5M11 8h4.2"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
      />
    </svg>
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

// The bar shows only the glyph, so the tooltip carries everything the old
// inline text did plus the SHA and the absolute date.
const title = computed(() => {
  const current = info.value
  if (!current?.commit) return t('git.notCommitted')
  const { sha, author, authorMail, authorTime, summary } = current.commit
  const when = relativeTime(authorTime, Date.now(), locale.value)
  return [
    `${author} <${authorMail}> · ${when}`,
    summary,
    `${shortSha(sha)} · ${formatDateTime(authorTime)}`
  ].join('\n')
})

const openCommit = (): void => {
  const current = info.value
  if (!current) return
  bus.emit('git-commit::open', { root: current.root, sha: current.sha })
}
</script>

<style scoped>
.git-blame-line {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-right: 6px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--editorColor50);
  cursor: pointer;
  -webkit-app-region: no-drag;
}
.git-blame-line:hover {
  color: var(--editorColor);
  background: rgba(0, 0, 0, 0.1);
}
.git-blame-line.uncommitted {
  color: #3b82f6;
}
.git-blame-line svg {
  display: block;
  width: 16px;
  height: 16px;
}
</style>
