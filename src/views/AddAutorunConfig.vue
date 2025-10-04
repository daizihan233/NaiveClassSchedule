<script setup>
import {computed, reactive, ref, watch} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {useRequest} from 'vue-request'
import {
  NAlert,
  NButton,
  NCard,
  NDatePicker,
  NDivider,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NSelect,
  NSpace,
  useMessage
} from 'naive-ui'
import {
  AutorunType,
  autorunTypeOptions,
  fetchCompByHoliday,
  fetchCompByWorkday,
  fetchCompYearPairs,
  fetchScopeTree,
  fetchTimetableOptions,
  flattenScope,
  getTask,
  saveAutorun
} from '@/api/autorun.js'
import {applyDisabledToScopeOptions, normalizeScopes, parseGradePairsFromScopes} from '@/utils/scope.js'
import ConfirmPasswordModal from '@/components/ConfirmPasswordModal.vue'

const scopeSelectOptions = ref([])
useRequest(fetchScopeTree, {
  manual: false,
  onSuccess: (res) => { scopeSelectOptions.value = flattenScope(res?.data || []) },
  onError: (e) => { console.warn('[scope] 获取失败', e); scopeSelectOptions.value = [] }
})

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
  scope: [],
  priority: 0,
  content: {date: null, useDate: null, timetableId: ''}
})

function setFormFromData(d){
  form.id = d.id
  form.type = d.type
  form.scope = Array.isArray(d.scope) ? d.scope.slice() : []
  form.priority = d.priority || 0
  const c = d.content || {}
  form.content = { date: c.date || null, useDate: c.useDate || null, timetableId: c.timetableId || '' }
}

const { run: runGet, loading: loadingGet } = useRequest(() => getTask(route.params.id), {
  manual: true,
  onSuccess: (resp) => { const d = resp?.data; if (d) setFormFromData(d) },
  onError: (e) => { message.error('读取失败'); console.error(e) }
})
if (isEdit.value) runGet()

function validateBasic(){
  if (!Array.isArray(form.scope) || form.scope.length === 0) { message.warning('请选择生效域'); return false }
  if (form.type === AutorunType.COMPENSATION) {
    if (!form.content.date || !form.content.useDate) {
      message.warning('请完整填写调休日与被借用的上课日期');
      return false
    }
  } else if (form.type === AutorunType.TIMETABLE) {
    if (!form.content.date || !form.content.timetableId) { message.warning('请完整填写日期与作息表'); return false }
    if (timetableLoading.value === false && timetableOptionsDyn.value.length === 0) {
      message.warning('未找到可用作息表，请选择具体年级/班级作为生效域');
      return false
    }
  } else {
    message.warning('仅支持在本页面编辑 调休/作息表 类型'); return false
  }
  return true
}

// 保存（带密码）
const saving = ref(false)
const showPwd = ref(false)
function openSave(){
  if (!validateBasic()) return
  showPwd.value = true
}

async function confirmSave(pwd) {
  saving.value = true
  try{
    const payload = { type: form.type, scope: form.scope, priority: form.priority, content: { ...form.content } }
    if (isEdit.value && form.id) payload.id = form.id
    await saveAutorun(payload, pwd)
    message.success('已保存')
    showPwd.value = false
    await router.push('/autorun')
  } catch(e){
    const status = e?.status || e?.response?.status
    if (status === 401) message.error('你寻思寻思这密码它对吗？')
    else if (status === 400) message.error('码姿不对，删了重写！（服务端校验不通过）')
    else message.error(`服务端看完天塌了（状态码：${status??'未知'}）`)
  } finally { saving.value = false }
}

function onCancel() { router.back() }

function onScopeChange(v){
  form.scope = normalizeScopes(v)
}

// ---------- 作息表选项（按 scope 动态拉取） ----------
const timetableOptionsDyn = ref([])
const timetableLoading = ref(false)
const timetableHint = ref('')

// 帮助函数：计算多个年级作息表选项的交集
function intersectTimetableOptions(results) {
  let intersect = null
  const labelMap = new Map()
  for (const r of results) {
    const values = new Set((r.options || []).map(o => o.value))
    for (const o of (r.options || [])) {
      if (!labelMap.has(o.value)) labelMap.set(o.value, o.label)
    }
    if (intersect === null) intersect = values
    else intersect = new Set([...intersect].filter(v => values.has(v)))
  }
  return [...(intersect || new Set())].map(v => ({label: labelMap.get(v) || String(v), value: v}))
}

async function refreshTimetableOptions() {
  timetableHint.value = ''
  timetableOptionsDyn.value = []
  if (form.type !== AutorunType.TIMETABLE) return
  const pairs = parseGradePairsFromScopes(form.scope)
  if (pairs.length === 0) {
    timetableHint.value = '请选择具体年级/班级作为生效域以获取作息表选项';
    return
  }
  timetableLoading.value = true
  try {
    const results = await Promise.allSettled(pairs.map(p => fetchTimetableOptions(p.school, p.grade)))
    const ok = results.filter(r => r.status === 'fulfilled').map(r => r.value)
    if (ok.length === 0) {
      timetableHint.value = '未获取到任何作息表选项'
      timetableOptionsDyn.value = []
    } else {
      const list = intersectTimetableOptions(ok)
      timetableOptionsDyn.value = list
      if (list.length === 0) timetableHint.value = '所选多个年级没有共同的作息表选项，请调整生效域'
      if (form.content.timetableId && !list.some(o => o.value === form.content.timetableId)) form.content.timetableId = ''
    }
  } catch (e) {
    console.warn('[timetable options] 获取失败', e)
    timetableHint.value = '获取作息表选项失败'
    timetableOptionsDyn.value = []
  } finally {
    timetableLoading.value = false
  }
}

watch(() => [form.type, JSON.stringify(form.scope)], () => {
  refreshTimetableOptions()
})

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
  if (u && !d) fillWorkdayFromHoliday()
  else if (d && !u) fillHolidayFromWorkday()
})

// 批量导入全年调休
const showImport = ref(false)
const importYear = ref(new Date().getFullYear())
const importAllScope = ref(true)
const importPwd = ref('')
const importing = ref(false)

// 导入辅助：构建作用域、逐条处理 pairs
function buildImportScope() {
  if (importAllScope.value) return ['ALL']
  return Array.isArray(form.scope) ? form.scope : []
}

async function processImportPairs(pairs, scopePayload) {
  let ok = 0, fail = 0, aborted = false
  for (const p of pairs) {
    if (aborted) break
    const {holiday, workday} = p || {}
    if (!holiday || !workday) {
      fail++;
      continue
    }
    const payload = {
      type: AutorunType.COMPENSATION,
      scope: scopePayload,
      priority: form.priority || 0,
      content: {date: workday, useDate: holiday}
    }
    try {
      await saveAutorun(payload, importPwd.value);
      ok++
    } catch (e) {
      const status = e?.status || e?.response?.status;
      if (status === 401) {
        message.error('密码错误，已终止导入');
        aborted = true;
        break
      }
      fail++
    }
  }
  return {ok, fail, aborted}
}

async function openImport(){ showImport.value = true }
async function doImport(){
  importing.value = true
  try{
    const { data } = await fetchCompYearPairs(importYear.value)
    const pairs = Array.isArray(data?.pairs) ? data.pairs : []
    if (pairs.length===0){ message.warning('该年无调休数据'); return }
    const scopePayload = buildImportScope()
    if (!importAllScope.value && scopePayload.length === 0){ message.warning('请选择生效域或勾选使用 ALL'); return }
    const {ok, fail, aborted} = await processImportPairs(pairs, scopePayload)
    if (ok > 0) {
      const failPart = fail > 0 ? `，失败 ${fail} 条` : '';
      message.success(`已导入 ${ok} 条${failPart}`)
    } else if (!aborted) {
      message.error('导入失败')
    }
    if (ok > 0 && !aborted) showImport.value = false
  } catch (e) {
    if (!e?.response?.status) console.error(e)
  } finally {
    importing.value = false
  }
}

const computedScopeOptions = computed(() => applyDisabledToScopeOptions(scopeSelectOptions.value, form.scope))
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
          <n-select v-model:value="form.content.timetableId" :loading="timetableLoading" :options="timetableOptionsDyn"
                    placeholder="先选择包含年级/班级的生效域后再选择作息表"/>
          <div v-if="timetableHint" style="font-size:12px;color:#888;margin-top:6px;">{{ timetableHint }}</div>
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
  <confirm-password-modal
      :loading="saving"
      :show="showPwd"
      confirm-text="确认保存"
      title="保存"
      @confirm="confirmSave"
      @update:show="val=> showPwd = val"
  />
</template>

<style scoped>
/* form for compensation/timetable */
</style>
