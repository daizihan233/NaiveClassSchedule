<script setup>
import { h, ref } from 'vue'
import { NDataTable, NTag, NButton, NSpace, NCard, NModal, NInput, useMessage } from 'naive-ui'
import { useRequest } from 'vue-request'
import { useRouter } from 'vue-router'
import axios from 'axios'
import { APISRV } from '@/global.js'
import { listTasks, getAutorunTypeLabel, summarizeContent, AutorunType, fetchScopeTree, makeScopeLabelMap } from '@/api/autorun.js'

const router = useRouter()
const message = useMessage()

const rows = ref([])
const { run, loading } = useRequest(listTasks, {
  manual: false,
  onSuccess: (res) => { rows.value = res?.data ?? [] },
  onError: (e) => { console.error('[autorun] 获取失败', e); rows.value = [] }
})

// 作用域标签映射
const scopeLabelMap = ref(new Map())
useRequest(fetchScopeTree, {
  manual: false,
  onSuccess: (res) => { scopeLabelMap.value = makeScopeLabelMap(res?.data || []) },
  onError: (e) => { console.warn('[autorun] 作用域菜单获取失败', e) }
})

const statusTypeMap = { '待生效': 'warning', '生效中': 'success', '已过期': 'error' }

function renderPriorityTag(priority) { return h(NTag, { size: 'small', bordered: false }, { default: () => String(priority) }) }

function renderScope(labels) {
  const list = Array.isArray(labels) ? labels : []
  return h(NSpace, { size: 4, wrap: true }, {
    default: () => list.map(s => h(NTag, { size: 'small', bordered: false }, { default: () => s }))
  })
}

function getScopeLabels(scopeArr) {
  const map = scopeLabelMap.value
  const list = Array.isArray(scopeArr) ? scopeArr : []
  return list.map(v => map.get(v) || v)
}

function onEdit(row) {
  if (row.type === AutorunType.SCHEDULE || row.type === AutorunType.ALL) {
    router.push(`/autorun/edit-schedule/${row.id}`)
  } else {
    router.push(`/autorun/edit/${row.id}`)
  }
}

// 删除逻辑（需密码）
const showDelete = ref(false)
const deleting = ref(false)
const deletePwd = ref('')
const deleteId = ref('')
function askDelete(row){ deleteId.value = row.id; deletePwd.value=''; showDelete.value = true }
async function doDelete(){
  if(!deleteId.value) return
  deleting.value = true
  try {
    await axios.delete(`${APISRV}/web/autorun/${deleteId.value}`,
      { auth: { username: 'ElectronClassSchedule', password: deletePwd.value } }
    )
    message.success('已删除')
    showDelete.value = false
    deletePwd.value = ''
    deleteId.value = ''
    run()
  } catch (e) {
    const status = e?.status || e?.response?.status
    if (status === 401) message.error('你寻思寻思这密码它对吗？')
    else if (status === 400) message.error('码姿不对，删了重写！（服务端校验不通过）')
    else message.error(`服务端看完天塌了（状态码：${status??'未知'}）`)
  } finally {
    deleting.value = false
  }
}

const columns = [
  { title: '唯一ID', key: 'id', width: 140, ellipsis: { tooltip: true } },
  { title: '类型', key: 'type', width: 120, render: (row) => h(NTag, { size: 'small', bordered: false }, { default: () => getAutorunTypeLabel(row.type) }) },
  { title: '生效域', key: 'scope', width: 260, render: (row) => renderScope(getScopeLabels(row.scope)) },
  { title: '内容', key: 'content', ellipsis: { tooltip: true }, render: (row) => summarizeContent(row) },
  { title: '优先级', key: 'priority', width: 100, align: 'center', render: (row) => renderPriorityTag(row.priority) },
  { title: '状态', key: 'status', width: 110, align: 'center', render: (row) => { const type = statusTypeMap[row.status] || 'default'; return h(NTag, { type, size: 'small', bordered: false }, { default: () => row.status }) } },
  { title: '快捷操作', key: 'actions', width: 220, align: 'center', render: (row) => h(NSpace, { justify: 'center' }, { default: () => [
      h(NButton, { size: 'small', tertiary: true, onClick: () => onEdit(row) }, { default: () => '修改' }),
      h(NButton, { size: 'small', tertiary: true, type: 'error', onClick: () => askDelete(row) }, { default: () => '删除' })
    ] }) }
]

function refresh() { run() }
function goAddBasic() { router.push('/autorun/add') }
function goAddSchedule() { router.push('/autorun/add-schedule') }
</script>

<template>
  <n-card title="自动任务状态预览" :bordered="false">
    <template #header-extra>
      <n-space>
        <n-button size="small" @click="goAddBasic">新增（调休/作息表）</n-button>
        <n-button size="small" @click="goAddSchedule">新增（课程表/ALL）</n-button>
        <n-button size="small" @click="refresh" :loading="loading">刷新</n-button>
      </n-space>
    </template>

    <n-data-table :columns="columns" :data="rows" :loading="loading" :pagination="false" />

    <n-modal v-model:show="showDelete" preset="dialog" title="删除确认">
      <template #header>你是入吗？</template>
      <n-space vertical>
        <n-input type="password" v-model:value="deletePwd" clearable placeholder="输入密码" />
      </n-space>
      <template #action>
        <n-button type="error" :loading="deleting" @click="doDelete">确认删除</n-button>
      </template>
    </n-modal>
  </n-card>
</template>

<style scoped>
</style>