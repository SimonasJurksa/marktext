<template>
  <div class="plan-wizard">
    <el-dialog
      v-model="visible"
      :modal="true"
      class="ag-dialog-table plan-wizard-dialog"
      width="880px"
      :title="t('planQuestions.title')"
      @opened="focusBody"
    >
      <div
        v-if="current"
        ref="body"
        class="plan-wizard__body"
        tabindex="0"
      >
        <aside class="plan-wizard__list">
          <button
            v-for="(question, i) in questions"
            :key="question.id"
            type="button"
            class="plan-wizard__item"
            :class="{ active: i === index, answered: question.answered }"
            :title="question.title"
            @click="goTo(i)"
          >
            <span class="plan-wizard__mark">{{ question.answered ? '✓' : '○' }}</span>
            <span class="plan-wizard__id">{{ question.id }}</span>
            <span class="plan-wizard__item-title">{{ question.title }}</span>
          </button>
        </aside>

        <section class="plan-wizard__main">
          <h3 class="plan-wizard__title">
            {{ current.id }}. {{ current.title }}
          </h3>
          <p
            v-if="summaryText"
            class="plan-wizard__summary"
          >
            {{ summaryText }}
          </p>

          <div
            v-if="current.options.length"
            class="plan-wizard__options"
            role="radiogroup"
          >
            <label
              v-for="option in current.options"
              :key="option.letter"
              class="plan-wizard__option"
              :class="{ selected: selected === option.letter }"
            >
              <input
                v-model="selected"
                type="radio"
                name="plan-wizard-option"
                :value="option.letter"
              >
              <span class="plan-wizard__letter">{{ option.letter }})</span>
              <span class="plan-wizard__text">
                {{ option.text }}
                <em v-if="option.recommended">({{ t('planQuestions.recommended') }})</em>
              </span>
            </label>
          </div>

          <label class="plan-wizard__comment-label">
            {{ current.options.length ? t('planQuestions.comment') : t('planQuestions.freeText') }}
            <textarea
              ref="commentInput"
              v-model="comment"
              class="plan-wizard__comment"
              rows="3"
              :placeholder="t('planQuestions.commentPlaceholder')"
            />
          </label>
          <p class="plan-wizard__hint">
            {{ t('planQuestions.saveHint') }}
          </p>
        </section>
      </div>

      <template #footer>
        <div class="plan-wizard__footer">
          <span
            class="plan-wizard__progress"
            :class="answeredCount === questions.length ? 'done' : 'pending'"
          >{{ t('planQuestions.progress', { answered: answeredCount, total: questions.length }) }}</span>
          <span class="plan-wizard__buttons">
            <el-button
              :disabled="index === 0"
              @click="back"
            >
              {{ t('planQuestions.back') }}
            </el-button>
            <el-button @click="skip">
              {{ t('planQuestions.skip') }}
            </el-button>
            <el-button
              type="primary"
              :disabled="!canCommit"
              @click="next"
            >
              {{ isLast ? t('planQuestions.finish') : t('planQuestions.next') }}
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
import { wordCount as getWordCount } from '@muyajs/core'
import bus from '@/bus'
import notice from '@/services/notification'
import { useEditorStore } from '@/store/editor'
import {
  formatAnswer,
  parsePlanQuestions,
  splitAnswer,
  writeAnswer,
  type PlanQuestion
} from '@/planQuestions'

const { t } = useI18n()
const editorStore = useEditorStore()
const { currentFile } = storeToRefs(editorStore)

const visible = ref(false)
const questions = ref<PlanQuestion[]>([])
const index = ref(0)
const selected = ref<string | null>(null)
const comment = ref('')
const body = ref<HTMLElement | null>(null)
const commentInput = ref<HTMLTextAreaElement | null>(null)

const current = computed(() => questions.value[index.value] ?? null)
const answeredCount = computed(() => questions.value.filter((question) => question.answered).length)
const isLast = computed(() => index.value >= questions.value.length - 1)
const canCommit = computed(() => !!selected.value || comment.value.trim().length > 0)
const summaryText = computed(() => current.value?.summary.replace(/\*\*/g, '') ?? '')

const reload = (): void => {
  questions.value = parsePlanQuestions(currentFile.value?.markdown).questions
}

const focusBody = (): void => {
  // Keep focus on the dialog so letter hotkeys and Enter work right away.
  nextTick(() => body.value?.focus())
}

const loadQuestion = (): void => {
  const question = current.value
  if (!question) return
  const { letter, comment: note } = splitAnswer(question.answer, question.options)
  selected.value = letter
  comment.value = note
  focusBody()
}

const open = (): void => {
  const tab = currentFile.value
  if (!tab) return
  reload()
  if (!questions.value.length) {
    notice.notify({ title: t('planQuestions.title'), type: 'info', message: t('planQuestions.noQuestions') })
    return
  }
  if (tab.readOnly) {
    notice.notify({ title: t('planQuestions.title'), type: 'warning', message: t('planQuestions.readOnly') })
    return
  }
  const firstUnanswered = questions.value.findIndex((question) => !question.answered)
  index.value = firstUnanswered === -1 ? 0 : firstUnanswered
  loadQuestion()
  visible.value = true
  bus.emit('editor-blur')
}

/**
 * Writes the current answer into the open document. Mirrors the source-code
 * mode hand-off: the store learns the new markdown (dirty flag, auto save) and
 * the WYSIWYG editor replaces its content as a single undo step.
 */
const commit = (): boolean => {
  const question = current.value
  const tab = currentFile.value
  if (!question || !tab || tab.readOnly) return false
  const text = formatAnswer(selected.value, comment.value)
  if (!text || text === question.answer) return false

  const { markdown, line } = writeAnswer(tab.markdown, question, text)
  if (markdown === tab.markdown) return false
  const cursor = { anchor: { line, ch: 0 }, focus: { line, ch: 0 } }
  editorStore.LISTEN_FOR_CONTENT_CHANGE({
    id: tab.id,
    markdown,
    wordCount: getWordCount(markdown),
    muyaIndexCursor: cursor
  })
  bus.emit('file-changed', { id: tab.id, markdown: tab.markdown, muyaIndexCursor: cursor })
  reload()
  return true
}

const close = (): void => {
  visible.value = false
}

const next = (): void => {
  commit()
  if (isLast.value) {
    close()
    return
  }
  index.value++
  loadQuestion()
}

const skip = (): void => {
  if (isLast.value) {
    close()
    return
  }
  index.value++
  loadQuestion()
}

const back = (): void => {
  if (index.value === 0) return
  commit()
  index.value--
  loadQuestion()
}

const goTo = (i: number): void => {
  if (i === index.value) return
  commit()
  index.value = i
  loadQuestion()
}

// Listens on the document while the dialog is up: Element Plus moves focus
// around inside the dialog, so a handler on one element would miss keys.
const handleKeydown = (event: KeyboardEvent): void => {
  if (!visible.value) return
  const inTextarea = (event.target as HTMLElement | null)?.tagName === 'TEXTAREA'
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey || !inTextarea)) {
    event.preventDefault()
    event.stopPropagation()
    if (canCommit.value) next()
    return
  }
  if (inTextarea) return
  const letter = event.key.toLowerCase()
  if (
    !event.ctrlKey && !event.metaKey && !event.altKey &&
    /^[a-z]$/.test(letter) &&
    current.value?.options.some((option) => option.letter === letter)
  ) {
    event.preventDefault()
    event.stopPropagation()
    selected.value = letter
  }
}

watch(visible, (isOpen) => {
  if (isOpen) document.addEventListener('keydown', handleKeydown, true)
  else document.removeEventListener('keydown', handleKeydown, true)
})

onMounted(() => {
  bus.on('plan-wizard::open', open)
})

onBeforeUnmount(() => {
  bus.off('plan-wizard::open', open)
  document.removeEventListener('keydown', handleKeydown, true)
})
</script>

<style>
.plan-wizard-dialog .el-dialog__body {
  padding: 0 20px 10px;
}
</style>

<style scoped>
.plan-wizard__body {
  display: flex;
  gap: 16px;
  min-height: 360px;
  max-height: 70vh;
  outline: none;
  color: var(--editorColor);
}
.plan-wizard__list {
  flex: 0 0 240px;
  overflow-y: auto;
  border-right: 1px solid var(--floatBorderColor);
  padding-right: 8px;
}
.plan-wizard__item {
  display: flex;
  align-items: baseline;
  gap: 6px;
  width: 100%;
  padding: 5px 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--editorColor);
  text-align: left;
  font-size: 13px;
  cursor: pointer;
}
.plan-wizard__item:hover {
  background: var(--floatHoverColor);
}
.plan-wizard__item.active {
  background: var(--itemBgColor);
}
.plan-wizard__mark {
  flex: 0 0 14px;
  color: #e5484d;
}
.plan-wizard__item.answered .plan-wizard__mark {
  color: #30a46c;
}
.plan-wizard__id {
  flex: 0 0 auto;
  font-weight: 600;
}
.plan-wizard__item-title {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--editorColor80);
}
.plan-wizard__main {
  flex: 1 1 auto;
  min-width: 0;
  overflow-y: auto;
  padding-right: 4px;
}
.plan-wizard__title {
  margin: 4px 0 10px;
  font-size: 16px;
  line-height: 1.4;
}
.plan-wizard__summary {
  margin: 0 0 12px;
  white-space: pre-wrap;
  font-size: 13px;
  line-height: 1.5;
  color: var(--editorColor80);
}
.plan-wizard__options {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}
.plan-wizard__option {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--floatBorderColor);
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.45;
  cursor: pointer;
}
.plan-wizard__option.selected {
  border-color: var(--themeColor);
  background: var(--itemBgColor);
}
.plan-wizard__option input {
  margin-top: 3px;
}
.plan-wizard__letter {
  flex: 0 0 auto;
  font-weight: 600;
}
.plan-wizard__text em {
  color: var(--themeColor);
  font-style: normal;
}
.plan-wizard__comment-label {
  display: block;
  font-size: 12px;
  color: var(--editorColor80);
}
.plan-wizard__comment {
  display: block;
  width: 100%;
  margin-top: 4px;
  padding: 6px 8px;
  border: 1px solid var(--floatBorderColor);
  border-radius: 6px;
  background: var(--editorBgColor);
  color: var(--editorColor);
  font: inherit;
  font-size: 13px;
  resize: vertical;
}
.plan-wizard__comment:focus {
  outline: none;
  border-color: var(--themeColor);
}
.plan-wizard__hint {
  margin: 8px 0 0;
  font-size: 11px;
  color: var(--editorColor50);
}
.plan-wizard__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.plan-wizard__progress {
  font-weight: 600;
}
.plan-wizard__progress.pending {
  color: #e5484d;
}
.plan-wizard__progress.done {
  color: #30a46c;
}
</style>
