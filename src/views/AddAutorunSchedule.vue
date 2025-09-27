<script setup>
import { reactive, ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRequest } from 'vue-request'
import { NForm, NFormItem, NCard, NInput, NInputNumber, NSelect, NButton, NSpace, useMessage, NDatePicker, NDivider, NAlert, NText } from 'naive-ui'
import { AutorunType, autorunTypeOptions, fetchScopeTree, getTask, updateTask, parseScope, fetchClassScheduleTemplateByWeekday, fetchScheduleByDate, fetchTimetableOptions, fetchSubjectsOptions, saveAutorun } from '@/api/autorun.js'

// 扁平化菜单树为下拉可多选项
function flattenScope(nodes, prefix = '') {
  const out = []
  for (const n of nodes || []) {
    const label = prefix ? `${prefix} / ${n.label}` : n.label
    out.push({ label, value: n.value })
    if (Array.isArray(n.children) && n.children.length) out.push(...flattenScope(n.children, label))
  }
  return out
}
const scopeSelectOptions = ref([])
const scopeTreeRef = ref([])
useRequest(fetchScopeTree, {
  manual: false,
  onSuccess: (res) => { scopeSelectOptions.value = flattenScope(res?.data || []); scopeTreeRef.value = res?.data || [] },
  onError: (e) => { console.warn('[scope] 获取失败', e); scopeSelectOptions.value = []; scopeTreeRef.value = [] }
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
const title = computed(() => isEdit.value ? '编辑自动任务（课程表/ALL）' : '新增自动任务（课程表/ALL）')

const scheduleTypeOptions = autorunTypeOptions.filter(o => o.value === AutorunType.SCHEDULE || o.value === AutorunType.ALL)

// 表单与默认
const formRef = ref(null)
const form = reactive({
  id: '',
  type: AutorunType.SCHEDULE,
  scope: [],
  priority: 0,
  content: {
    date: null,
    timetableId: '', // 仅 ALL 使用
    schedule: {
      periods: [] // 固定节次数，由 need 或模板决定
    }
  }
})

// 作息表与学科选项
const timetableOpts = ref([])
const subjectsOpts = ref([])
const needMap = computed(() => new Map(timetableOpts.value.map(o => [o.value, Number(o.need)||0])))

// 根据所选作用域推断 (school, grade)
function pickSchoolGrade(selected){
  const arr = Array.isArray(selected) ? selected : []
  // 优先班级
  const clsVal = arr.find(v => parseScope(v).level==='class')
  if (clsVal){ const p=parseScope(clsVal); return { school:p.school, grade:p.grade } }
  // 其次年级
  const gradeVal = arr.find(v => parseScope(v).level==='grade')
  if (gradeVal){ const p=parseScope(gradeVal); return { school:p.school, grade:p.grade } }
  // 学校 -> 取第一个年级
  const schoolVal = arr.find(v => parseScope(v).level==='school')
  if (schoolVal){
    const node = findNodeByValue(scopeTreeRef.value, schoolVal)
    const firstGrade = (node?.children||[]).find(n => parseScope(n.value).level==='grade')
    if (firstGrade){ const p=parseScope(firstGrade.value); return { school:p.school, grade:p.grade } }
  }
  return null
}

async function loadGradeOptions(){
  const pair = pickSchoolGrade(form.scope)
  if (!pair){ timetableOpts.value = []; subjectsOpts.value = []; return }
  const [{ options }, { options: subs }] = await Promise.all([
    fetchTimetableOptions(pair.school, pair.grade),
    fetchSubjectsOptions(pair.school, pair.grade)
  ])
  timetableOpts.value = options
  subjectsOpts.value = subs
  if (form.type===AutorunType.ALL && !form.content.timetableId && timetableOpts.value.length>0){
    form.content.timetableId = timetableOpts.value[0].value
  }
}

function setFormFromData(d){
  form.id = d.id
  form.type = d.type
  form.scope = Array.isArray(d.scope) ? d.scope.slice() : []
  form.priority = d.priority || 0
  const c = d.content || {}
  form.content.date = c.date || null
  form.content.timetableId = c.timetableId || ''
  form.content.schedule.periods = Array.isArray(c.schedule?.periods)
    ? c.schedule.periods.map(p => ({ no: Number(p.no)||0, subject: String(p.subject||'') }))
    : []
}

const { run: runGet, loading: loadingGet } = useRequest(() => getTask(route.params.id), {
  manual: true,
  onSuccess: (resp) => { const d = resp?.data; if (d) setFormFromData(d) },
  onError: (e) => { message.error('读取失败'); console.error(e) }
})
if (isEdit.value) runGet()

const periodCount = computed(()=>{
  if (form.type===AutorunType.ALL){
    return needMap.value.get(form.content.timetableId) || 0
  }
  if (form.content.schedule.periods.length>0) return form.content.schedule.periods.length
  return timetableOpts.value.length>0 ? (Number(timetableOpts.value[0].need)||0) : 0
})

watch(periodCount, (n)=>{
  if (n<=0) { form.content.schedule.periods = []; return }
  const arr = form.content.schedule.periods.slice(0, n)
  while (arr.length < n) arr.push({ no: arr.length+1, subject: '' })
  arr.forEach((p, idx)=>{ p.no = idx+1 })
  form.content.schedule.periods = arr
})

// 校验
function validateSchedule(){
  if (!Array.isArray(form.scope) || form.scope.length === 0) { message.warning('请选择生效域'); return false }
  if (!form.content.date) { message.warning('请选择日期'); return false }
  if (form.type===AutorunType.ALL && !form.content.timetableId) { message.warning('请选择作息表'); return false }
  const n = periodCount.value
  if (n<=0) { message.warning('当前作息表无节次'); return false }
  const list = form.content.schedule?.periods || []
  if (!Array.isArray(list) || list.length !== n) { message.warning('节次数与作息表不一致'); return false }
  for (const item of list) {
    if (!item || !item.subject || String(item.subject).trim()==='') { message.warning('请为每一节选择科目'); return false }
  }
  return true
}

// 保存（带密码 PUT /web/autorun/）
const saving = ref(false)
const showPwd = ref(false)
const pwd = ref('')
function openSave(){ showPwd.value = true }
async function confirmSave(){
  saving.value = true
  try {
    const payload = {
      type: form.type,
      scope: form.scope,
      priority: form.priority,
      content: {
        date: form.content.date,
        timetableId: form.type===AutorunType.ALL ? form.content.timetableId : undefined,
        schedule: { periods: form.content.schedule.periods.map(p => ({ no: Number(p.no)||0, subject: String(p.subject||'') })) }
      }
    }
    if (isEdit.value && form.id) payload.id = form.id
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
</script>

<template>
  <n-card :title="title" :bordered="false">
    <n-form ref="formRef" :model="form" label-placement="left" label-width="100">
      <n-alert type="warning" title="🚧 施工中 🚧" style="margin-bottom: 12px;">此页面功能仍在完善，部分接口对接中。</n-alert>
      <n-form-item v-if="isEdit" label="唯一ID">
        <n-input v-model:value="form.id" disabled />
      </n-form-item>
      <n-form-item label="类型">
        <n-select v-model:value="form.type" :options="scheduleTypeOptions" />
      </n-form-item>
      <n-form-item label="生效域">
        <n-select v-model:value="form.scope" multiple tag :options="computedScopeOptions" placeholder="选择生效范围，可多选" @update:value="onScopeChange" />
      </n-form-item>
      <n-form-item label="优先级">
        <n-input-number v-model:value="form.priority" :show-button="false" placeholder="执行顺序（数字）" />
      </n-form-item>

      <n-divider>类型相关参数</n-divider>

      <n-form-item v-if="form.type === 3" label="作息表（ALL 专用）">
        <n-select v-model:value="form.content.timetableId" :options="timetableOpts.map(o=>({ label:o.label, value:o.value }))" placeholder="请选择作息表" />
      </n-form-item>

      <n-form-item label="对应日期">
        <n-date-picker v-model:formatted-value="form.content.date" type="date" value-format="yyyy-MM-dd" />
        <n-button size="small" style="margin-left:8px" :loading="autoFilling" @click="autoFillSchedule">自动填充</n-button>
      </n-form-item>

      <n-form-item label="课程表（节次/科目）">
        <n-card size="small" style="width:100%" :bordered="true">
          <n-space vertical style="width:100%">
            <n-text v-if="periodCount===0" depth="3">请先选择作息表或等待模板加载</n-text>
            <div v-for="i in periodCount" :key="i" style="display:flex; align-items:center; gap:12px; width:100%">
              <div style="width:60px; text-align:right;">第 {{ i }} 节</div>
              <n-select v-model:value="form.content.schedule.periods[i-1].subject" :options="subjectsOpts" placeholder="选择科目" style="flex:1;" />
            </div>
          </n-space>
        </n-card>
      </n-form-item>

      <n-form-item>
        <n-space>
          <n-button type="primary" :loading="saving || loadingGet" @click="openSave">保存</n-button>
          <n-button tertiary @click="onCancel">取消</n-button>
        </n-space>
      </n-form-item>
    </n-form>
  </n-card>

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
/* schedule/ALL form styles */
</style>
