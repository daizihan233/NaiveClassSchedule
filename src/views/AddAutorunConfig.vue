<script setup>
import { reactive, ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRequest } from 'vue-request'
import {
    NForm, NFormItem, NCard, NInput, NInputNumber, NSelect, NButton, NSpace, useMessage, NDatePicker, NDivider, NAlert,
    NModal
} from 'naive-ui'
import {
  AutorunType, autorunTypeOptions, timetableOptions, getTask, fetchScopeTree, parseScope, fetchCompByHoliday,
  fetchCompByWorkday, fetchCompYearPairs, saveAutorun
} from '@/api/autorun.js'

// 扁平化工具
function flattenScope(nodes, prefix = '') {
  const out = []
  for (const n of nodes || []) {
    const label = prefix ? `${prefix} / ${n.label}` : n.label
    out.push({ label, value: n.value })
    if (Array.isArray(n.children) && n.children.length) {
      out.push(...flattenScope(n.children, label))
    }
  }
  return out
}
const scopeSelectOptions = ref([])
useRequest(fetchScopeTree, {
  manual: false,
  onSuccess: (res) => { scopeSelectOptions.value = flattenScope(res?.data || []) },
  onError: (e) => { console.warn('[scope] 获取失败', e); scopeSelectOptions.value = [] }
})

function applyDisabledToScopeOptions(options, selected){
  const arr = Array.isArray(options) ? options : []
  const sel = Array.isArray(selected) ? selected : []
  const schoolSet = new Set()
  const gradeSet = new Set()
  for (const v of sel){
    const p = parseScope(v)
    if (p.level === 'school') schoolSet.add(p.school)
    else if (p.level === 'grade') gradeSet.add(`${p.school}|${p.grade}`)
  }
  return arr.map(opt => {
    const p = parseScope(opt.value)
    let disabled = false
    if (p.level === 'grade') disabled = schoolSet.has(p.school)
    else if (p.level === 'class') disabled = schoolSet.has(p.school) || gradeSet.has(`${p.school}|${p.grade}`)
    return { ...opt, disabled }
  })
}
const computedScopeOptions = computed(() => applyDisabledToScopeOptions(scopeSelectOptions.value, form.scope))

const route = useRoute()
const router = useRouter()
const message = useMessage()

const isEdit = computed(() => !!route.params.id)
const title = computed(() => isEdit.value ? '编辑自动任务（调休/作息表）' : '新增自动任务（调休/作息表）')

const basicTypeOptions = autorunTypeOptions.filter(o => o.value === AutorunType.COMPENSATION || o.value === AutorunType.TIMETABLE)

const formRef = ref(null)
const form = reactive({
  id: '',
  type: AutorunType.COMPENSATION,
  scope: [], // 多选
  priority: 0,
  content: { date: null, useDate: null, timetableId: '' } // 将日期默认改为 null
})

function setFormFromData(d){
  form.id = d.id
  form.type = d.type
  form.scope = Array.isArray(d.scope) ? d.scope.slice() : []
  form.priority = d.priority || 0
  // content
  const c = d.content || {}
  form.content = { date: c.date || null, useDate: c.useDate || null, timetableId: c.timetableId || '' }
}

// 读取编辑数据（仅在编辑模式）
const { run: runGet, loading: loadingGet } = useRequest(() => getTask(route.params.id), {
  manual: true,
  onSuccess: (resp) => { const d = resp?.data; if (d) setFormFromData(d) },
  onError: (e) => { message.error('读取失败'); console.error(e) }
})
if (isEdit.value) runGet()

function validateBasic(){
  if (!Array.isArray(form.scope) || form.scope.length === 0) { message.warning('请选择生效域'); return false }
  if (form.type === AutorunType.COMPENSATION) {
    if (!form.content.date || !form.content.useDate) { message.warning('请完整填写调休日期与被借用的上课日期'); return false }
  } else if (form.type === AutorunType.TIMETABLE) {
    if (!form.content.date || !form.content.timetableId) { message.warning('请完整填写日期与作息表'); return false }
  } else {
    message.warning('仅支持在本页面编辑 调休/作息表 类型'); return false
  }
  return true
}

// 保存（带密码 PUT /web/autorun/）
const saving = ref(false)
const showPwd = ref(false)
const pwd = ref('')
function openSave(){
  if (!validateBasic()) return
  showPwd.value = true
}
async function confirmSave(){
  saving.value = true
  try{
    const payload = { type: form.type, scope: form.scope, priority: form.priority, content: { ...form.content } }
    if (isEdit.value && form.id) payload.id = form.id
      showPwd.value = false
    await saveAutorun(payload, pwd.value)
    message.success('已保存')
    showPwd.value = false
    router.push('/autorun')
  } catch(e){
    const status = e?.status || e?.response?.status
    if (status === 401) message.error('你寻思寻思这密码它对吗？')
    else if (status === 400) message.error('码姿不对，删了重写！（服务端校验不通过）')
    else message.error(`服务端看完天塌了（状态码：${status??'未知'}）`)
  } finally { saving.value = false }
}

function onCancel() { router.back() }

// 归并逻辑：选择学校则移除同校的年级/班级，选择年级则移除同年级的班级
function normalizeScopes(list){
  const arr = Array.isArray(list) ? Array.from(new Set(list)) : []
  const schoolSet = new Set()
  const gradeSet = new Set() // key: `${school}|${grade}`
  // 收集已选父层级
  for (const v of arr){
    const p = parseScope(v)
    if (p.level === 'school') schoolSet.add(p.school)
    else if (p.level === 'grade') gradeSet.add(`${p.school}|${p.grade}`)
  }
  // 过滤子层级
  const out = []
  for (const v of arr){
    const p = parseScope(v)
    if (p.level === 'school') { out.push(v); continue }
    if (p.level === 'grade') { if (!schoolSet.has(p.school)) out.push(v); continue }
    if (p.level === 'class') { if (!schoolSet.has(p.school) && !gradeSet.has(`${p.school}|${p.grade}`)) out.push(v); continue }
  }
  return out
}
function onScopeChange(v){
  form.scope = normalizeScopes(v)
}

// 调休：自动互相反推
const autoFilling = ref(false)
async function fillWorkdayFromHoliday(){
  const holiday = form.content.useDate
  if(!holiday) return
  autoFilling.value = true
  try{
    const { data } = await fetchCompByHoliday(holiday)
    const wd = data?.compensation
    if (wd) form.content.date = wd
  } finally { autoFilling.value = false }
}
async function fillHolidayFromWorkday(){
  const workday = form.content.date
  if(!workday) return
  autoFilling.value = true
  try{
    const { data } = await fetchCompByWorkday(workday)
    const hd = data?.compensation
    if (hd) form.content.useDate = hd
  } finally { autoFilling.value = false }
}
watch(()=>[form.type, form.content.date, form.content.useDate], ([t, d, u])=>{
  if (t!==AutorunType.COMPENSATION) return
  // 当只填了其中一个时尝试反推另一个
  if (u && !d) fillWorkdayFromHoliday()
  else if (d && !u) fillHolidayFromWorkday()
})

// 批量导入全年调休
const showImport = ref(false)
const importYear = ref(new Date().getFullYear())
const importAllScope = ref(true) // 若为 true 则作用域设为 ['ALL']
const importPwd = ref('') // 导入批量保存用的密码（Basic Auth）
const importing = ref(false)
async function openImport(){ showImport.value = true }
async function doImport(){
  importing.value = true
  try{
    const { data } = await fetchCompYearPairs(importYear.value)
    const pairs = Array.isArray(data?.pairs) ? data.pairs : []
    if (pairs.length===0){ message.warning('该年无调休数据'); return }
    const scopePayload = importAllScope.value ? ['ALL'] : (Array.isArray(form.scope)? form.scope : [])
    if (!importAllScope.value && scopePayload.length === 0){ message.warning('请选择生效域或勾选使用 ALL'); return }
    let ok = 0, fail = 0
    for (const p of pairs){
      const holiday = p.holiday
      const workday = p.workday
      if (!holiday || !workday) { fail++; continue }
      const payload = {
        type: AutorunType.COMPENSATION,
        scope: scopePayload,
        priority: form.priority || 0,
        content: { date: workday, useDate: holiday }
      }
      try{
        await saveAutorun(payload, importPwd.value)
        ok++
      } catch(e){
        const status = e?.status || e?.response?.status
        if (status === 401){
          message.error('密码错误，已终止导入')
          throw e
        }
        fail++
      }
    }
    if (ok>0) message.success(`已导入 ${ok} 条${fail?`，失败 ${fail} 条`:''}`)
    else message.error('导入失败')
    if (ok>0) showImport.value = false
  } catch(e){
    // 已在循环内分类提示，这里保持兜底
    if (!e?.response?.status) console.error(e)
  } finally { importing.value = false }
}
</script>

<template>
  <n-card :title="title" :bordered="false">
    <n-form ref="formRef" :model="form" label-placement="left" label-width="100">
      <n-alert v-if="isEdit" type="warning" title="🚧 施工中 🚧" style="margin-bottom: 12px;">此页面功能仍在完善，部分接口对接中。</n-alert>
      <n-form-item v-if="isEdit" label="唯一ID">
        <n-input v-model:value="form.id" disabled />
      </n-form-item>
      <n-form-item label="类型">
        <n-select v-model:value="form.type" :options="basicTypeOptions" />
      </n-form-item>
      <n-form-item v-if="form.type===0">
        <n-space>
          <n-button size="small" @click="openImport">导入全年调休</n-button>
          <n-button size="small" :loading="autoFilling" @click="fillWorkdayFromHoliday" :disabled="!form.content.useDate">由节假日反推工作日</n-button>
          <n-button size="small" :loading="autoFilling" @click="fillHolidayFromWorkday" :disabled="!form.content.date">由工作日反推节假日</n-button>
        </n-space>
      </n-form-item>
      <n-form-item label="生效域">
        <n-select v-model:value="form.scope" multiple tag :options="computedScopeOptions" placeholder="选择生效范围，可多选" @update:value="onScopeChange" />
      </n-form-item>
      <n-form-item label="优先级">
        <n-input-number v-model:value="form.priority" :show-button="false" placeholder="执行顺序（数字）" />
      </n-form-item>

      <n-divider>类型相关参数</n-divider>

      <template v-if="form.type === 0">
        <n-form-item label="工作日 (date)">
          <n-date-picker v-model:formatted-value="form.content.date" type="date" value-format="yyyy-MM-dd" />
        </n-form-item>
        <n-form-item label="节假日 (useDate)">
          <n-date-picker v-model:formatted-value="form.content.useDate" type="date" value-format="yyyy-MM-dd" />
        </n-form-item>
      </template>
      <template v-else-if="form.type === 1">
        <n-form-item label="调整日期">
          <n-date-picker v-model:formatted-value="form.content.date" type="date" value-format="yyyy-MM-dd" />
        </n-form-item>
        <n-form-item label="作息表">
          <n-select v-model:value="form.content.timetableId" :options="timetableOptions" placeholder="选择作息表" />
        </n-form-item>
      </template>

      <n-form-item>
        <n-space>
          <n-button type="primary" :loading="saving || loadingGet" @click="openSave">保存</n-button>
          <n-button tertiary @click="onCancel">取消</n-button>
        </n-space>
      </n-form-item>
    </n-form>
  </n-card>

  <!-- 导入全年调休对话框 -->
  <n-modal v-model:show="showImport" preset="dialog" title="导入全年调休">
    <n-space vertical>
      <n-form-item label="年份">
        <n-input-number v-model:value="importYear" :show-button="false" :min="1970" :max="2100" />
      </n-form-item>
      <n-form-item label="作用域使用 ALL">
        <n-select v-model:value="importAllScope" :options="[{label:'是',value:true},{label:'否',value:false}]" />
      </n-form-item>
      <n-form-item label="密码">
        <n-input v-model:value="importPwd" type="password" clearable placeholder="输入保存密码（Basic Auth）" />
      </n-form-item>
      <div style="font-size:12px;color:#888">将按 pairs 中的 workday 作为 date、holiday 作为 useDate 创建调休任务，并逐条提交到服务端。</div>
    </n-space>
    <template #action>
      <n-button type="primary" :loading="importing" @click="doImport">开始导入</n-button>
    </template>
  </n-modal>

  <!-- 保存密码弹窗 -->
  <n-modal v-model:show="showPwd" preset="dialog" title="保存">
    <n-space vertical>
      <div>此操作需要密码</div>
      <n-input type="password" v-model:value="pwd" clearable placeholder="输入密码" />
    </n-space>
    <template #action>
      <n-button type="primary" :loading="saving" @click="confirmSave">确认保存</n-button>
    </template>
  </n-modal>
</template>

<style scoped>
/* form for compensation/timetable */
</style>