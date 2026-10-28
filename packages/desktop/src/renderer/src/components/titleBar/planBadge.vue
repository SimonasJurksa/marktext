<template>
  <button
    v-if="summary.total"
    type="button"
    class="plan-badge title-no-drag"
    :class="summary.answered === summary.total ? 'done' : 'pending'"
    :title="t('planQuestions.badgeTitle', { answered: summary.answered, total: summary.total })"
    :aria-label="t('planQuestions.badgeTitle', { answered: summary.answered, total: summary.total })"
    @click.stop="openWizard"
  >
    {{ summary.answered }}/{{ summary.total }}
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import bus from '@/bus'
import { parsePlanQuestions } from '@/planQuestions'

const props = defineProps<{ markdown?: string | null }>()
const { t } = useI18n()

const summary = computed(() => parsePlanQuestions(props.markdown))

const openWizard = () => bus.emit('plan-wizard::open')
</script>

<style scoped>
.plan-badge {
  margin-right: 8px;
  padding: 1px 7px;
  border: none;
  border-radius: 9px;
  font-size: 12px;
  font-weight: 600;
  line-height: 16px;
  color: #fff;
  cursor: pointer;
  -webkit-app-region: no-drag;
}
.plan-badge.pending {
  background: #e5484d;
}
.plan-badge.done {
  background: #30a46c;
}
.plan-badge:hover {
  filter: brightness(1.1);
}
</style>
