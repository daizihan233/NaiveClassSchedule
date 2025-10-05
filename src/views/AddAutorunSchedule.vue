<script setup>
import {computed, reactive, ref, watch} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {useRequest} from 'vue-request'
import axios from 'axios'
import {APISRV} from '@/global.js'
import {
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
  NText,
  useMessage
} from 'naive-ui'
import {
  AutorunType,
  autorunTypeOptions,
  fetchClassScheduleTemplateByWeekday,
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
// 需要两张映射表：value->need（ALL 下用），label->need（根据班级当天作息表 label 推断）
const needByValueMap = computed(() => new Map(timetableOpts.value.map(o => [o.value, Number(o.need) || 0])))
const needByLabelMap = ref(new Map())

// 将后端返回的 need 转为真实节次数：need < 0 视为 0 节，否则 need + 1
function toCount(rawNeed) {
  const n = Number(rawNeed)
  if (!Number.isFinite(n)) return 0
  return n < 0 ? 0 : n + 1
}

// 自动检测的“当日作息表”结果（存原始 need 值）
const detectedNeedRaw = ref(null) // number | null
const detectedTimetableId = ref('')
const detectedTimetableLabel = computed(() => {
  const opt = timetableOpts.value.find(o => o.value === detectedTimetableId.value)
  return opt ? opt.label : ''
})
const isRestDay = computed(() => detectedNeedRaw.value !== null && toCount(detectedNeedRaw.value) === 0)

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
  if (!pair) {
    timetableOpts.value = [];
    subjectsOpts.value = [];
    needByLabelMap.value = new Map();
    return
  }
  const [{options, needMap: labelNeedMap}, {options: subs}] = await Promise.all([
    fetchTimetableOptions(pair.school, pair.grade),
    fetchSubjectsOptions(pair.school, pair.grade)
  ])
  timetableOpts.value = options
  needByLabelMap.value = labelNeedMap instanceof Map ? labelNeedMap : new Map(options.map(o => [o.label, Number(o.need) || 0]))
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
    const needById = needByValueMap.value.get(form.content.timetableId)
    if (needById !== undefined) return toCount(needById)
    if (detectedNeedRaw.value !== null) return toCount(detectedNeedRaw.value)
    return 0
  }
  // SCHEDULE 类型：优先使用已检测到的当日作息表节次数
  if (detectedNeedRaw.value !== null) return toCount(detectedNeedRaw.value)
  if (form.content.schedule.periods.length>0) return form.content.schedule.periods.length
  return timetableOpts.value.length > 0 ? toCount(Number(timetableOpts.value[0].need) || 0) : 0
})

watch(periodCount, (n)=>{
  if (n<=0) { form.content.schedule.periods = []; return }
  const arr = form.content.schedule.periods.slice(0, n)
  while (arr.length < n) arr.push({ no: arr.length+1, subject: '' })
  for (let idx = 0; idx < arr.length; idx++) {
    arr[idx].no = idx + 1
  }
  form.content.schedule.periods = arr
})

// 日期变化时重置自动检测结果
watch(() => form.content.date, () => {
  detectedNeedRaw.value = null
  detectedTimetableId.value = ''
})

function onScopeChange(v) {
  form.scope = normalizeScopes(v)
  // 重置自动检测结果
  detectedNeedRaw.value = null
  detectedTimetableId.value = ''
  loadGradeOptions()
}

watch(() => form.scope.slice(), () => {
  // 重置自动检测结果
  detectedNeedRaw.value = null
  detectedTimetableId.value = ''
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
  if (n === 0) { // 休息日，无需课程
    form.content.schedule.periods = []
    return true
  }
  if (n < 0) {
    message.warning('当前作息表无节次');
    return false
  }
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

// 根据选择的作用域收集对应的所有班级
function collectClassesFromScopes(scopes) {
  const result = []
  const seen = new Set()
  const arr = Array.isArray(scopes) ? scopes : []
  for (const v of arr) {
    if (!v) continue
    const parts = String(v).split('/').filter(Boolean)
    if (parts.length >= 3) {
      // 直接是班级
      const [school, grade, cls] = parts
      const value = `${school}/${grade}/${cls}`
      if (!seen.has(value)) {
        result.push({school, grade, cls, value});
        seen.add(value)
      }
    } else if (parts.length === 2) {
      // 年级 -> 展开为所有班级
      const gradeNode = findNodeByValue(scopeTreeRef.value, v)
      const classes = Array.isArray(gradeNode?.children) ? gradeNode.children : []
      for (const c of classes) {
        const pv = String(c.value || '')
        const [school, grade, cls] = pv.split('/').filter(Boolean)
        if (!school || !grade || !cls) continue
        if (!seen.has(pv)) {
          result.push({school, grade, cls, value: pv});
          seen.add(pv)
        }
      }
    } else if (parts.length === 1) {
      // 学校 -> 展开为所有年级的所有班级
      const schoolNode = findNodeByValue(scopeTreeRef.value, v)
      const grades = Array.isArray(schoolNode?.children) ? schoolNode.children : []
      for (const g of grades) {
        const classes = Array.isArray(g?.children) ? g.children : []
        for (const c of classes) {
          const pv = String(c.value || '')
          const [school, grade, cls] = pv.split('/').filter(Boolean)
          if (!school || !grade || !cls) continue
          if (!seen.has(pv)) {
            result.push({school, grade, cls, value: pv});
            seen.add(pv)
          }
        }
      }
    }
  }
  return result
}

const autoFilling = ref(false)
async function autoFillSchedule() {
  const date = form.content.date
  if (!date) {
    message.warning('请选择日期');
    return
  }
  const classList = collectClassesFromScopes(form.scope)
  if (!Array.isArray(classList) || classList.length === 0) {
    message.warning('请选择包含班级的生效域');
    return
  }
  autoFilling.value = true
  try {
    const weekday = new Date(date).getDay()
    // 并行请求全部班级的该日模板
    const results = await Promise.allSettled(classList.map(c => fetchClassScheduleTemplateByWeekday({
      school: c.school,
      grade: c.grade,
      cls: c.cls,
      weekday
    })))
    const ok = []
    for (let idx = 0; idx < results.length; idx++) {
      const r = results[idx]
      if (r.status === 'fulfilled') {
        const data = r.value?.data || {}
        const periods = Array.isArray(data.periods) ? data.periods : []
        const timetableLabel = String(data.timetableLabel || '')
        const needRaw = timetableLabel ? Number(needByLabelMap.value.get(timetableLabel)) : -1 // -1 代表休息日 -> 0 节
        const option = timetableLabel ? timetableOpts.value.find(o => o.label === timetableLabel) : null
        ok.push({cls: classList[idx], periods, timetableLabel, needRaw, option})
      }
    }
    if (ok.length === 0) {
      message.error('未能获取到任何班级的课程模板');
      return
    }
    // 按“实际节次数”判定冲突（统一转换为 count）
    const counts = new Set(ok.map(x => toCount(x.needRaw)))
    if (counts.size > 1) {
      const detail = ok
          .map(x => `${x.cls.value}：作息表“${x.timetableLabel || '未知'}” -> ${toCount(x.needRaw)} 节`)
          .join('\n')
      conflictMsg.value = `所选作用域内不同班级在该日的作息表节次数不一致，无法自动填充：\n${detail}`
      showConflict.value = true
      return
    }
    // 随机取一个成功的班级用于填充
    const pickIdx = Math.floor(Math.random() * ok.length)
    const chosen = ok[pickIdx]
    // 1) 自动填充课程
    form.content.schedule.periods = chosen.periods.map((p, idx) => ({
      no: Number(p.no) || idx + 1,
      subject: String(p.subject || '')
    }))
    // 2) 根据“API 返回的作息表 label”确定 needRaw 与（在 ALL 下）作息表 ID
    const needRaw = Number.isFinite(chosen.needRaw) ? chosen.needRaw : -1
    detectedNeedRaw.value = needRaw
    if (chosen.option) {
      detectedTimetableId.value = chosen.option.value
      if (form.type === AutorunType.ALL) {
        form.content.timetableId = chosen.option.value
      }
    } else {
      detectedTimetableId.value = ''
      if (form.type === AutorunType.ALL) {
        message.warning('未能从班级配置中识别出当日作息表，请手动选择作息表');
      }
    }
    message.success(`已按班级 ${chosen.cls.value} 自动填充，并基于“${chosen.timetableLabel || '未知'}”作息表（${toCount(needRaw)} 节）调整表单`)
  } finally {
    autoFilling.value = false
  }
}

// 保存（带密码 PUT /web/autorun/）
const saving = ref(false)
const showPwd = ref(false)

// 冲突弹窗
const showConflict = ref(false)
const conflictMsg = ref('')

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
    // 编辑：先删旧再提交新规则
    if (isEdit.value && form.id) {
      await axios.delete(`${APISRV}/web/autorun/${form.id}`, {
        auth: {username: 'ElectronClassSchedule', password: pwd}
      })
    }
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
        <n-text v-if="detectedNeedRaw !== null && !detectedTimetableLabel" depth="3" style="margin-left:8px;">
          已检测到节次数：{{ toCount(detectedNeedRaw) }}（无法唯一匹配作息表）
        </n-text>
        <n-text v-if="detectedNeedRaw !== null && detectedTimetableLabel" depth="3" style="margin-left:8px;">
          已检测到当日作息表：{{ detectedTimetableLabel }}（共 {{ toCount(detectedNeedRaw) }} 节）
        </n-text>
      </n-form-item>

      <n-form-item label="课程表（节次/科目）">
        <n-card size="small" style="width:100%" :bordered="true">
          <n-space vertical style="width:100%">
            <n-text v-if="periodCount===0" depth="3">{{
                isRestDay ? '检测到休息日，无需填写课程' : '请先选择作息表或等待模板加载'
              }}
            </n-text>
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
      title="保存"
      @confirm="confirmSave"
      @update:show="val=> showPwd = val"
  />

  <n-modal v-model:show="showConflict" preset="dialog" title="节次数冲突">
    <n-space vertical>
      <div style="white-space: pre-line;">{{ conflictMsg }}</div>
      <div style="font-size:12px;color:#888">请调整生效域使其落到节次数一致的班级集合，或单选一个具体班级。</div>
    </n-space>
  </n-modal>
</template>

<style scoped>
/* schedule/ALL form styles */
</style>
