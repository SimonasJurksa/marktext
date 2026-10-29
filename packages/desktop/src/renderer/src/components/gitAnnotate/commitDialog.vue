<template>
  <el-dialog
    v-model="visible"
    :show-close="true"
    :modal="true"
    class="ag-dialog-table git-commit-dialog"
    width="620px"
    center
    dir="ltr"
    @closed="reset"
  >
    <template #title>
      <div class="dialog-title">
        {{ t('git.commit.title') }}
      </div>
    </template>
    <div
      v-if="!sha"
      class="git-commit__uncommitted"
    >
      {{ t('git.commit.uncommitted') }}
    </div>
    <div
      v-else-if="loading"
      class="git-commit__loading"
    >
      {{ t('git.commit.loading') }}
    </div>
    <div
      v-else-if="!details"
      class="git-commit__loading"
    >
      {{ t('git.commit.notFound') }}
    </div>
    <div
      v-else
      class="git-commit"
    >
      <div class="git-commit__sha-row">
        <code class="git-commit__sha">{{ details.sha }}</code>
        <el-button
          size="small"
          class="git-commit__copy"
          @click="copySha"
        >
          {{ copied ? t('git.commit.copied') : t('git.commit.copySha') }}
        </el-button>
      </div>
      <dl class="git-commit__meta">
        <dt>{{ t('git.commit.author') }}</dt>
        <dd>{{ details.author }} &lt;{{ details.authorMail }}&gt;</dd>
        <dt>{{ t('git.commit.date') }}</dt>
        <dd>{{ formatDateTime(details.authorTime) }} ({{ relativeTime(details.authorTime, Date.now(), locale) }})</dd>
        <dt v-if="details.committer !== details.author">
          {{ t('git.commit.committer') }}
        </dt>
        <dd v-if="details.committer !== details.author">
          {{ details.committer }}, {{ formatDateTime(details.commitTime) }}
        </dd>
      </dl>
      <pre class="git-commit__message">{{ details.message }}</pre>
      <div
        v-if="details.files.length"
        class="git-commit__files"
      >
        <div class="git-commit__files-title">
          {{ t('git.commit.files') }} ({{ details.files.length }})
        </div>
        <ul>
          <li
            v-for="file in details.files"
            :key="file.path"
            :class="`status-${file.status}`"
          >
            <span class="git-commit__file-status">{{ file.status }}</span>
            <span class="git-commit__file-path">{{ file.path }}</span>
          </li>
        </ul>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { GitCommitDetails } from '@shared/types/git'
import bus from '@/bus'
import { useGitStore } from '@/store/git'
import { formatDateTime, relativeTime } from '@/git/format'

const { t, locale } = useI18n()
const gitStore = useGitStore()

const visible = ref(false)
const loading = ref(false)
const copied = ref(false)
const sha = ref('')
const root = ref('')
const details = ref<GitCommitDetails | null>(null)
let requestId = 0

const open = async (payload: unknown): Promise<void> => {
  const { root: nextRoot, sha: nextSha } = (payload ?? {}) as { root?: string; sha?: string }
  if (!nextRoot) return
  root.value = nextRoot
  sha.value = nextSha ?? ''
  details.value = null
  copied.value = false
  visible.value = true
  if (!sha.value) return
  const id = ++requestId
  loading.value = true
  try {
    const result = await window.git.commit(nextRoot, sha.value)
    if (id === requestId) details.value = result
  } catch (error) {
    console.warn('git show failed', error)
  } finally {
    if (id === requestId) loading.value = false
  }
}

const openAtCursor = (): void => {
  const current = gitStore.currentLine
  if (current) void open({ root: current.root, sha: current.sha })
}

const copySha = async (): Promise<void> => {
  if (!details.value) return
  await window.electron.clipboard.writeText(details.value.sha)
  copied.value = true
}

const reset = (): void => {
  details.value = null
  sha.value = ''
}

onMounted(() => {
  bus.on('git-commit::open', open)
  bus.on('git-commit::open-at-cursor', openAtCursor)
})

onBeforeUnmount(() => {
  bus.off('git-commit::open', open)
  bus.off('git-commit::open-at-cursor', openAtCursor)
})
</script>

<style scoped>
.git-commit {
  font-size: 13px;
  color: var(--editorColor);
}
.git-commit__uncommitted,
.git-commit__loading {
  padding: 12px 0;
  color: var(--editorColor80);
  text-align: center;
}
.git-commit__sha-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.git-commit__sha {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--codeFontFamily, monospace);
  font-size: 12px;
  user-select: text;
}
.git-commit__meta {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 12px;
  margin: 0 0 12px;
}
.git-commit__meta dt {
  color: var(--editorColor50);
}
.git-commit__meta dd {
  margin: 0;
  user-select: text;
}
.git-commit__message {
  margin: 0 0 12px;
  padding: 10px 12px;
  max-height: 240px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--editorFontFamily, sans-serif);
  font-size: 13px;
  background: var(--editorColor04, rgba(0, 0, 0, 0.04));
  border-radius: 4px;
  user-select: text;
}
.git-commit__files-title {
  margin-bottom: 4px;
  color: var(--editorColor50);
}
.git-commit__files ul {
  margin: 0;
  padding: 0;
  max-height: 160px;
  overflow: auto;
  list-style: none;
  font-family: var(--codeFontFamily, monospace);
  font-size: 12px;
}
.git-commit__files li {
  display: flex;
  gap: 8px;
  line-height: 20px;
}
.git-commit__file-status {
  width: 14px;
  color: var(--editorColor50);
}
.git-commit__files .status-A .git-commit__file-status {
  color: #30a46c;
}
.git-commit__files .status-D .git-commit__file-status {
  color: #e5484d;
}
.git-commit__files .status-M .git-commit__file-status {
  color: #3b82f6;
}
</style>
