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
  NSelect,
  NSpace,
  NText,
  useMessage
} from 'naive-ui'
import {
  AutorunType,
  autorunTypeOptions,
  fetchClassScheduleTemplateByWeekday,
  fetchScheduleByDate,
  fetchScopeTree,
  fetchSubjectsOptions,
  fetchTimetableOptions,
  flattenScope,
  getTask,
  saveAutorun
} from '@/api/autorun.js'
import {applyDisabledToScopeOptions, findNodeByValue, normalizeScopes} from '@/utils/scope.js'
import ConfirmPasswordModal from '@/components/ConfirmPasswordModal.vue'

const scopeSelectOptions = ref([])
const scopeTreeRef = ref([])
useRequest(fetchScopeTree, {
  manual: false,
  onSuccess: (res) => { scopeSelectOptions.value = flattenScope(res?.data || []); scopeTreeRef.value = res?.data || [] },
  onError: (e) => { console.warn('[scope] 获取失败', e); scopeSelectOptions.value = []; scopeTreeRef.value = [] }
})

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
      periods: []
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
  const clsVal = arr.find(v => v && v.split('/').length >= 3)
  if (clsVal) {
    const [school, grade, cls] = clsVal.split('/')
    return {school, grade, cls}
  }
  // 其次年级
  const gradeVal = arr.find(v => v && v.split('/').length === 2)
  if (gradeVal) {
    const [school, grade] = gradeVal.split('/');
    return {school, grade}
  }
  // 学校 -> 取第一个年级
  const schoolVal = arr.find(v => v && v.split('/').length === 1)
  if (schoolVal){
    const node = findNodeByValue(scopeTreeRef.value, schoolVal)
    const firstGrade = (node?.children || []).find(n => n.value && n.value.split('/').length === 2)
    if (firstGrade) {
      const [school, grade] = firstGrade.value.split('/');
      return {school, grade}
    }
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

function onScopeChange(v) {
  form.scope = normalizeScopes(v)
  loadGradeOptions()
}

watch(() => form.scope.slice(), () => {
  loadGradeOptions()
})
watch(() => [form.type, form.content.timetableId], () => {
  if (form.type === AutorunType.ALL) loadGradeOptions()
})

function validateSchedule(){
  if (!Array.isArray(form.scope) || form.scope.length === 0) { message.warning('请选择生效域'); return false }
  if (!form.content.date) { message.warning('请选择日期'); return false }
  if (form.type===AutorunType.ALL && !form.content.timetableId) { message.warning('请选择作息表'); return false }
  const n = periodCount.value
  if (n<=0) { message.warning('当前作息表无节次'); return false }
  const list = form.content.schedule?.periods || []
  if (!Array.isArray(list) || list.length !== n) { message.warning('节次数与作息表不一致'); return false }
  for (const item of list) {
    if (!item || !item.subject || String(item.subject).trim() === '') {
      message.warning('请为每一节选择科目');
      return false
    }
  }
  return true
}

const autoFilling = ref(false)
async function autoFillSchedule() {
  const date = form.content.date
  const firstScope = Array.isArray(form.scope) && form.scope.length > 0 ? form.scope[0] : null
  if (!date || !firstScope) {
    message.warning('请先选择生效域与日期');
    return
  }
  autoFilling.value = true
  try {
    const {data} = await fetchScheduleByDate(date, firstScope)
    const periods = Array.isArray(data?.periods) ? data.periods : []
    if (periods.length > 0) {
      form.content.schedule.periods = periods.map((p, idx) => ({
        no: Number(p.no) || idx + 1,
        subject: String(p.subject || '')
      }))
      return
    }
    const picked = pickSchoolGrade(form.scope)
    if (picked && picked.cls) {
      const weekday = new Date(date).getDay()
      const {data: tpl} = await fetchClassScheduleTemplateByWeekday({
        school: picked.school,
        grade: picked.grade,
        cls: picked.cls,
        weekday
      })
      const ps = Array.isArray(tpl?.periods) ? tpl.periods : []
      if (ps.length > 0) {
        form.content.schedule.periods = ps.map((p, idx) => ({
          no: Number(p.no) || idx + 1,
          subject: String(p.subject || '')
        }))
      }
    }
  } finally {
    autoFilling.value = false
  }
}

// 保存（带密码 PUT /web/autorun/）
const saving = ref(false)
const showPwd = ref(false)

function onCancel() {
  router.back()
}

function openSave() {
  if (!validateSchedule()) return
  showPwd.value = true
}

async function confirmSave(pwd) {
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
</script>

<template>
  <n-card :title="title" :bordered="false">
    <n-form ref="formRef" :model="form" label-placement="left" label-width="100">
      <n-alert type="warning" title="🚧 施工中 🚧" style="margin-bottom: 12px;">此页面功能仍在完善，部分接口对接中。</n-alert>
      <n-form-item v-if="isEdit" label="唯一ID">
        <n-input v-model:value="form.id" disabled/>
      </n-form-item>
      <n-form-item label="类型">
        <n-select v-model:value="form.type" :options="scheduleTypeOptions"/>
      </n-form-item>
      <n-form-item label="生效域">
        <n-select v-model:value="form.scope" :options="computedScopeOptions" multiple placeholder="选择生效范围，可多选"
                  tag @update:value="onScopeChange"/>
      </n-form-item>
      <n-form-item label="优先级">
        <n-input-number v-model:value="form.priority" :show-button="false" placeholder="执行顺序（数字）"/>
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
/* schedule/ALL form styles */
</style>
