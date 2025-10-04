<script setup>
import {NSpace, NTag} from 'naive-ui'
import {parseScope} from '@/api/autorun.js'

const {scopes} = defineProps({
  scopes: {type: Array, default: () => []}
})

function getScopeTagType(level) {
  if (level === 'school') return 'info'
  if (level === 'grade') return 'success'
  if (level === 'class') return 'warning'
  return 'default'
}

function fallbackScopeLabel(p) {
  if (!p) return ''
  if (p.level === 'school') return `${p.school} 学校`
  if (p.level === 'grade') return `${p.school} 学校 ${p.grade} 级`
  if (p.level === 'class') return `${p.school} 学校 ${p.grade} 级 ${p.class} 班`
  return `${p.school || ''} ${p.grade ? p.grade + ' 级' : ''} ${p.class ? p.class + ' 班' : ''}`.trim()
}
</script>

<template>
  <n-space :size="4" wrap>
    <template v-for="v in (Array.isArray(scopes) ? scopes : [])" :key="String(v)">
      <n-tag v-if="v==='ALL'" :bordered="false" size="small" type="info">ALL</n-tag>
      <template v-else>
        <!--suppress JSValidateTypes -->
        <n-tag :bordered="false" :type="getScopeTagType(parseScope(v).level)" size="small">
          {{ fallbackScopeLabel(parseScope(v)) }}
        </n-tag>
      </template>
    </template>
  </n-space>
</template>
