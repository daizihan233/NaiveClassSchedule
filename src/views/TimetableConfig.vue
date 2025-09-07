<script setup>
import {
  NButton,
  NCard,
  NCode,
  NCollapse,
  NCollapseItem,
  NDatePicker,
  NFlex,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NRadioButton,
  NRadioGroup,
  NSpace,
  NStatistic,
  useMessage
} from 'naive-ui'
import {computed, reactive, ref} from 'vue'
import axios from 'axios'
import {APISRV} from '@/global.js'
import {useRequest} from 'vue-request'
import {useRoute} from 'vue-router'

const route = useRoute()
const school = computed(() => route.params.school)
const grade = computed(() => route.params.grade)
const formRef = ref(null)
const pwd = ref('')

// 编辑内部结构：
// timetables: [ { name: '常日', segments: [ { start:'00:00', end:'07:09', valueType:'text', text:'早自习', index:null }, { start:'07:10', end:'07:49', valueType:'index', index:0 } ], dividerInput: '0,4,7' } ]
// start: 时间戳 (NDatePicker 需要 number) —— 后端需要 YYYY-MM-DD 字符串
const dynamicForm = reactive({
  timetables: [
    {
      name: '常日',
      segments: [
        // 默认空，真实数据加载后替换
      ],
      dividerInput: ''
    }
  ],
  start: Date.now()
})

// ---------- 工具函数 ----------
function pad(n) { return n.toString().padStart(2, '0') }
function parseTime(str){
  if(!str) return null
  const m = str.match(/^([01]\d|2[0-3]):([0-5]\d)$/)
  if(!m) return null
  return parseInt(m[1])*60 + parseInt(m[2])
}
function toHHMM(mins){
  if(mins<0) mins=0
  if(mins>1439) mins=1439
  const h = Math.floor(mins/60)
  const m = mins%60
  return pad(h)+":"+pad(m)
}

function dateToYMD(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function ymdToTs(str) {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

function buildPayload() {
  const timetableObj = {}
  const dividerObj = {}
  for (const t of dynamicForm.timetables) {
    if (!t.name) continue
    const segMap = {}
    for (const s of t.segments) {
      if (!s.start || !s.end) continue
      const range = `${s.start}-${s.end}`
      let val = null
      if (s.valueType === 'index') {
        if (s.index === '' || s.index === null || isNaN(s.index)) continue
        val = Number(s.index)
      } else {
        if (!s.text) continue
        val = s.text
      }
      segMap[range] = val
    }
    timetableObj[t.name] = segMap
    // divider 解析
    dividerObj[t.name] = t.dividerInput.trim() === '' ? [] : t.dividerInput.split(',').map(x => Number(x.trim())).filter(x => !isNaN(x))
  }
  return {
    timetable: timetableObj,
    divider: dividerObj,
    start: dateToYMD(dynamicForm.start)
  }
}

// ---------- 动态增删 ----------
function addTimetable() {
  // 基准：优先找名为“常日”，否则第一个
  const base = dynamicForm.timetables.find(t => t.name === '常日') || dynamicForm.timetables[0]
  const clonedSegments = base ? base.segments.map(s => ({
    start: s.start,
    end: s.end,
    valueType: s.valueType,
    text: s.text,
    index: s.index
  })) : []
  const clonedDivider = base ? base.dividerInput : ''
  dynamicForm.timetables.push({
    name: `新作息${dynamicForm.timetables.length + 1}`,
    segments: clonedSegments,
    dividerInput: clonedDivider
  })
  expandedTimetables.value.push(dynamicForm.timetables.length -1)
  normalizeTimetable(dynamicForm.timetables[dynamicForm.timetables.length -1], true)
}
function removeTimetable(idx) {
  dynamicForm.timetables.splice(idx, 1)
  expandedTimetables.value = expandedTimetables.value
    .filter(i => i !== idx)
    .map(i => i > idx ? i-1 : i)
}

function addSegment(timetable) {
  timetable.segments.push({
    start: '',
    end: '',
    valueType: 'text',
    text: '',
    index: null
  })
  normalizeTimetable(timetable, true)
}
function removeSegment(timetable, sIdx) {
  timetable.segments.splice(sIdx, 1)
  normalizeTimetable(timetable, true)
}

function createEmptySegment(){
  return { start:'', end:'', valueType:'text', text:'', index:null }
}
function insertSegmentAbove(timetable, idx){
  timetable.segments.splice(idx,0, createEmptySegment())
  normalizeTimetable(timetable, true)
}
function insertSegmentBelow(timetable, idx){
  timetable.segments.splice(idx+1,0, createEmptySegment())
  normalizeTimetable(timetable, true)
}

// ---------- 交互 ----------
let showModal = ref(false)
let disabledButton = ref(false)
let buttonText = ref('确认提交')
function submit() {
  if(!validateAll()) return; // 有错误直接返回
  showModal.value = true
}

const messages = useMessage()

// ---------- 请求 ----------
const putTimetable = () => {
  const payload = buildPayload()
  return Promise.resolve(
    axios.put(
      `${APISRV}/web/config/${school.value}/${grade.value}/timetable`,
      payload,
      {
        auth: { username: 'ElectronClassSchedule', password: pwd.value }
      }
    )
  )
}

function okay() {
  disabledButton.value = true
  buttonText.value = '你等会儿'
  useRequest(
    putTimetable,
    {
      onSuccess: (response) => {
        console.log(response.data)
        messages.success('服务端说行')
        showModal.value = false
      },
      onError: (error) => {
        console.log(error)
        if (error.status === 401) messages.error('你寻思寻思这密码它对吗？')
        else if (error.status === 400) messages.error('码姿不对，删了重写！（服务端校验不通过）')
        else messages.error(`服务端看完天塌了（状态码：${error}）`)
      }
    }
  )
  buttonText.value = '确认提交'
  disabledButton.value = false
}

const getTimetable = () => {
  return Promise.resolve(
    axios.get(`${APISRV}/web/config/${school.value}/${grade.value}/timetable`)
  )
}

useRequest(
  getTimetable,
  {
    refreshDeps: [school, grade],
    initialData: {
      timetable: {},
      divider: {},
      start: dateToYMD(Date.now())
    },
    onSuccess: (response) => {
      console.log(response.data)
      const data = response.data
      // start
      if (data.start) dynamicForm.start = ymdToTs(data.start)
      // timetables
      dynamicForm.timetables = []
      for (const name of Object.keys(data.timetable || {})) {
        const segs = data.timetable[name]
        const segments = []
        for (const range of Object.keys(segs)) {
          const [s, e] = range.split('-')
          const val = segs[range]
          if (typeof val === 'number') {
            segments.push({ start: s, end: e, valueType: 'index', index: val, text: '' })
          } else {
            segments.push({ start: s, end: e, valueType: 'text', text: val, index: null })
          }
        }
        // 排序：按开始时间
        segments.sort((a, b) => a.start.localeCompare(b.start))
        const dividerInput = (data.divider && data.divider[name]) ? data.divider[name].join(',') : ''
        dynamicForm.timetables.push({ name, segments, dividerInput })
      }
      if (dynamicForm.timetables.length === 0) {
        dynamicForm.timetables.push({ name: '常日', segments: [], dividerInput: '' })
      }
    }
  }
)

// 预览
const preview = computed(() => JSON.stringify(buildPayload(), null, 2))
const expandedTimetables = ref([0])
function expandAllTimetables(){ expandedTimetables.value = dynamicForm.timetables.map((_,i)=>i) }
function collapseAllTimetables(){ expandedTimetables.value = [] }

// ---------- 自动填充与校验 ----------
function normalizeTimetable(timetable, silent=false){
  const segs = timetable.segments
  // 只处理有合法 start 的段
  const valid = []
  for(const s of segs){
    const sm = parseTime(s.start)
    if(sm!==null){ valid.push({ seg:s, startM:sm }) }
  }
  valid.sort((a,b)=>a.startM-b.startM)
  if(valid.length===0) return { valid:true }
  if(valid[0].startM !== 0){
    valid[0].startM = 0
    valid[0].seg.start = '00:00'
    if(!silent) messages.info(`作息 ${timetable.name} 已将首段开始时间自动纠正为 00:00`)
  }
  let ok = true
  let errMsg = ''
  for(let i=0;i<valid.length;i++){
    const cur = valid[i]
    const next = valid[i+1]
    if(next){
      if(next.startM <= cur.startM){
        ok = false
        errMsg = `作息 ${timetable.name} 存在开始时间不递增 ( ${toHHMM(next.startM)} <= ${toHHMM(cur.startM)} )`
        break
      }
      cur.seg.end = toHHMM(next.startM - 1)
    } else {
      cur.seg.end = '23:59'
    }
  }
  if(!ok && !silent) messages.error(errMsg)
  // ---- 课程序号规范化 ----
  if(ok){
    const lessonSegs = valid.filter(v=>v.seg.valueType==='index')
    let changed = false
    for(let i=0;i<lessonSegs.length;i++){
      if(lessonSegs[i].seg.index !== i){
        lessonSegs[i].seg.index = i
        changed = true
      }
    }
    if(changed && !silent){
      messages.info(`作息 ${timetable.name} 课程序号已自动调整为 0~${lessonSegs.length-1}`)
    }
  }
  return { valid: ok, message: errMsg }
}
function onStartChange(timetable, seg, val){
  seg.start = val
  normalizeTimetable(timetable, true)
}
function onValueTypeChange(timetable){
  normalizeTimetable(timetable, true)
}
// 覆盖 submit：在显示弹窗前做全局校验
function validateAll(){
  let allOk = true
  for(const t of dynamicForm.timetables){
    const r = normalizeTimetable(t, false)
    if(!r.valid) allOk = false
  }
  return allOk
}
</script>

<template>
  <NFlex vertical>
    <NCard title="所选信息">
      <NFlex justify="center">
        <NCard class="stat">
          <NStatistic label="所选学校" :value="school.toString()" />
        </NCard>
        <NCard class="stat">
          <NStatistic label="所选年级" :value="grade.toString()" />
        </NCard>
      </NFlex>
    </NCard>

    <NCard title="配置表单">
      <n-form ref="formRef" :model="dynamicForm" class="center">
        <n-form-item label="开学日期 (start)">
          <NDatePicker v-model:value="dynamicForm.start" type="date" />
        </n-form-item>
        <n-space style="margin-bottom:8px;">
          <n-button size="small" @click="expandAllTimetables">全部展开</n-button>
          <n-button size="small" @click="collapseAllTimetables">全部折叠</n-button>
        </n-space>
        <n-collapse multiple v-model:expanded-names="expandedTimetables">
          <n-collapse-item
            v-for="(tb, tIdx) in dynamicForm.timetables"
            :key="tIdx"
            :name="tIdx"
            :title="tb.name + '  (' + tb.segments.length + ' 段)'"
          >
            <NCard size="small" :title="tb.name" style="margin-bottom:12px;">
              <NSpace vertical>
                <n-form-item :label="`作息名称`" :path="`timetables[${tIdx}].name`">
                  <NInput v-model:value="tb.name" placeholder="例如：常日" />
                  <NButton style="margin-left:12px" tertiary type="error" @click="removeTimetable(tIdx)" v-if="dynamicForm.timetables.length>1">删此作息</NButton>
                </n-form-item>
                <n-form-item :label="`Divider (逗号分隔课程序号)`" :path="`timetables[${tIdx}].dividerInput`">
                  <NInput v-model:value="tb.dividerInput" placeholder="例如：0,4,7" />
                </n-form-item>
                <NCard size="small" title="时间段 (按开始时间顺序)" segmented>
                  <NSpace vertical>
                    <NCard size="small" v-for="(seg, sIdx) in tb.segments" :key="sIdx" :title="`#${sIdx+1}`">
                      <NSpace vertical>
                        <n-form-item :label="'时间段'" :path="`timetables[${tIdx}].segments[${sIdx}].start`">
                          <NSpace align="center">
                            <NInput style="width:90px" v-model:value="seg.start" placeholder="07:10" @update:value="val=>onStartChange(tb, seg, val)" />
                            <span style="user-select:none;">~</span>
                            <NInput style="width:90px" v-model:value="seg.end" disabled placeholder="自动" />
                          </NSpace>
                        </n-form-item>
                        <n-form-item :label="'值类型'">
                          <NRadioGroup v-model:value="seg.valueType" @update:value="()=>onValueTypeChange(tb)">
                            <NRadioButton value="text">文本</NRadioButton>
                            <NRadioButton value="index">课程序号</NRadioButton>
                          </NRadioGroup>
                        </n-form-item>
                        <n-form-item v-if="seg.valueType==='text'" :label="'文本值'" :path="`timetables[${tIdx}].segments[${sIdx}].text`">
                          <NInput v-model:value="seg.text" placeholder="早自习 / 课间 / 放学" />
                        </n-form-item>
                        <n-form-item v-else :label="'课程序号 (自动)'" :path="`timetables[${tIdx}].segments[${sIdx}].index`">
                          <NInputNumber :value="seg.index" disabled placeholder="自动编号" />
                        </n-form-item>
                        <NSpace>
                          <NButton size="tiny" tertiary @click="insertSegmentAbove(tb, sIdx)">上方插入</NButton>
                          <NButton size="tiny" tertiary @click="insertSegmentBelow(tb, sIdx)">下方插入</NButton>
                          <NButton size="tiny" type="error" tertiary @click="removeSegment(tb, sIdx)">删此段</NButton>
                        </NSpace>
                      </NSpace>
                    </NCard>
                    <NButton dashed type="primary" @click="addSegment(tb)">+ 增加时间段</NButton>
                  </NSpace>
                </NCard>
              </NSpace>
            </NCard>
          </n-collapse-item>
        </n-collapse>
        <n-form-item>
          <NButton type="primary" dashed @click="addTimetable">+ 增加作息模板</NButton>
        </n-form-item>
        <n-form-item class="center">
          <n-flex justify="center" size="large" class="center">
            <n-button attr-type="button" @click="submit">提交</n-button>
          </n-flex>
        </n-form-item>
      </n-form>
    </NCard>

    <NCard title="提交前预览">
      <n-code :code="preview" language="json" show-line-numbers />
    </NCard>

    <n-modal v-model:show="showModal" preset="dialog" title="Dialog">
      <template #header>
        <div>你是入吗？</div>
      </template>
      <n-space vertical>
        <div>此操作需要密码</div>
        <n-input type="password" v-model:value="pwd" clearable />
      </n-space>
      <template #action>
        <n-button attr-type="button" @click="okay" :disabled="disabledButton">{{ buttonText }}</n-button>
      </template>
    </n-modal>
  </NFlex>
</template>