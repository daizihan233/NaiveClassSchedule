import axios from 'axios'
import {APISRV} from '@/global.js'

// 伪数据 API：自动任务（支持分类内容与多选生效）
// 合同：所有函数返回 Promise，并在 120-200ms 之间模拟延迟
// TaskItem: { id, type(0..3), scope: string[], content: object, priority(number), status('待生效'|'生效中'|'已过期') }

export const AutorunType = {
  COMPENSATION: 0,
  TIMETABLE: 1,
  SCHEDULE: 2,
  ALL: 3
}

export const autorunTypeOptions = [
  { label: '调休', value: AutorunType.COMPENSATION },
  { label: '作息表调整', value: AutorunType.TIMETABLE },
  { label: '课程表调整', value: AutorunType.SCHEDULE },
  { label: '全部调整', value: AutorunType.ALL }
]

export const timetableOptions = [
  { label: '默认作息表', value: 'default' },
  { label: '考试周作息表', value: 'exam' },
  { label: '暑期作息表', value: 'summer' }
]

export function getAutorunTypeLabel(typeValue) {
  const found = autorunTypeOptions.find(o => o.value === typeValue)
  return found ? found.label : String(typeValue)
}

export function getTimetableLabel(id) {
  const found = timetableOptions.find(o => o.value === id)
  return found ? found.label : String(id)
}

export function encodeScope(level, school, grade, cls) {
  if (level === 'school') return `${school}`
  if (level === 'grade') return `${school}/${grade}`
  if (level === 'class') return `${school}/${grade}/${cls}`
  return String(level)
}
export function parseScope(value) {
  const raw = String(value || '')
  const parts = raw.split('/').filter(s => s !== '')
  const [school, grade, cls] = parts
  let level = 'unknown'
  if (parts.length === 1) level = 'school'
  else if (parts.length === 2) level = 'grade'
  else if (parts.length >= 3) level = 'class'
  return { level, school, grade, class: cls }
}

let scopeTreeCache = null

function isLevelNode(node) {
  return node && typeof node === 'object' && 'raw' in node && !node.to
}

function makeClassNode(schoolRaw, gradeRaw, c) {
  const classLabel = c.text || c.label || String(c.raw)
  const classVal = encodeScope('class', String(schoolRaw), String(gradeRaw), String(c.raw))
  return {label: classLabel, value: classVal, raw: String(c.raw)}
}

function makeGradeNode(schoolRaw, g) {
  const gradeLabel = g.text || g.label || String(g.raw)
  const gradeVal = encodeScope('grade', String(schoolRaw), String(g.raw))
  const grade = {label: gradeLabel, value: gradeVal, raw: String(g.raw), children: []}
  const classes = Array.isArray(g.children) ? g.children : []
  for (const c of classes) {
    if (isLevelNode(c)) grade.children.push(makeClassNode(schoolRaw, g.raw, c))
  }
  return grade
}

function makeSchoolNode(n) {
  const schoolLabel = n.text || n.label || String(n.raw)
  const schoolVal = encodeScope('school', String(n.raw))
  const school = {label: schoolLabel, value: schoolVal, raw: String(n.raw), children: []}
  const children = Array.isArray(n.children) ? n.children : []
  for (const g of children) {
    if (isLevelNode(g)) school.children.push(makeGradeNode(n.raw, g))
  }
  return school
}

function buildScopeTreeFromMenu(menu) {
  if (!Array.isArray(menu)) return []
  const result = []
  for (const node of menu) {
    if (isLevelNode(node)) result.push(makeSchoolNode(node))
  }
  return result
}

export async function fetchScopeTree() {
  if (scopeTreeCache) return { data: scopeTreeCache }
  const resp = await axios.get(`${APISRV}/web/menu`)
  const payload = resp?.data?.data || []
  scopeTreeCache = buildScopeTreeFromMenu(payload)
  return { data: scopeTreeCache }
}

export function flattenScope(nodes, prefix = '') {
  const out = []
  for (const n of nodes || []) {
    const label = prefix ? `${prefix} / ${n.label}` : n.label
    out.push({ label, value: n.value })
    if (Array.isArray(n.children) && n.children.length) out.push(...flattenScope(n.children, label))
  }
  return out
}

// 初始伪数据（若干条）
const store = [
  {
    id: 'task-001',
    type: AutorunType.COMPENSATION,
    scope: [encodeScope('school', '39')],
    content: {date: '2025-10-02', useDate: '2025-09-29'},
    priority: 10,
    status: '待生效'
  },
  {
    id: 'task-002',
    type: AutorunType.TIMETABLE,
    scope: [encodeScope('grade', '39', '2023')],
    content: {date: '2025-10-08', timetableId: 'exam'},
    priority: 20,
    status: '生效中'
  },
  {
    id: 'task-003',
    type: AutorunType.SCHEDULE,
    scope: [encodeScope('class', '39', '2023', '1')],
    content: {date: '2025-10-09', schedule: {periods: [{no: 1, subject: '语文'}, {no: 2, subject: '数学'}]}},
    priority: 30,
    status: '已过期'
  },
  {
    id: 'task-004',
    type: AutorunType.ALL,
    scope: [encodeScope('school', '39')],
    content: {date: '2025-10-10', schedule: {periods: [{no: 1, subject: '班会'}, {no: 2, subject: '体育'}]}},
    priority: 5,
    status: '待生效'
  }
]

export async function listTasks() {
  const resp = await axios.get(`${APISRV}/web/autorun`)
  const payload = resp?.data
  const arr = Array.isArray(payload?.data) ? payload.data : []
  const data = arr.map((t) => {
    const id = t.id
    let scope = []
    if (Array.isArray(t.scope)) scope = t.scope
    else if (t.scope) scope = [t.scope]
    return {
      id,
      type: t.type,
      scope,
      content: t.content || {},
      priority: Number(t.priority) || 0,
      status: t.status || '待生效'
    }
  })
  return { data }
}

export async function getTask(id) {
  await delay()
  const found = store.find(t => t.id === id)
  if (!found) { const error = new Error('Not Found'); error.status = 404; throw error }
  return { data: JSON.parse(JSON.stringify(found)) }
}

export async function saveAutorun(payload, password){
  if (payload && payload.type === AutorunType.COMPENSATION){
    const resp = await axios.put(`${APISRV}/web/autorun/compensation`, payload, {
      auth: {
        username: 'ElectronClassSchedule',
        password
      }
    })
    return resp?.data
  }
  if (payload && payload.type === AutorunType.TIMETABLE) {
    const resp = await axios.put(`${APISRV}/web/autorun/timetable`, payload, {
      auth: {
        username: 'ElectronClassSchedule',
        password
      }
    })
    return resp?.data
  }
  if (payload && payload.type === AutorunType.SCHEDULE) {
    const resp = await axios.put(`${APISRV}/web/autorun/schedule`, payload, {
      auth: {
        username: 'ElectronClassSchedule',
        password
      }
    })
    return resp?.data
  }
  if (payload && payload.type === AutorunType.ALL) {
    const resp = await axios.put(`${APISRV}/web/autorun/all`, payload, {
      auth: {
        username: 'ElectronClassSchedule',
        password
      }
    })
    return resp?.data
  }
  return { skipped: true }
}

function normalizeType(t) {
  if (typeof t === 'number') {
    if (t === AutorunType.COMPENSATION) return 'COMPENSATION'
    if (t === AutorunType.TIMETABLE) return 'TIMETABLE'
    if (t === AutorunType.SCHEDULE) return 'SCHEDULE'
    if (t === AutorunType.ALL) return 'ALL'
  }
  return String(t)
}

export function summarizeContent(task) {
  if (!task) return ''
  const tt = normalizeType(task.type)
  const c = task.content || {}
  if (tt === 'COMPENSATION') return `${c.date || '?'} 上 ${c.useDate || '?'} 的课`
  if (tt === 'TIMETABLE') return `${c.date || '?'} 使用作息表：${getTimetableLabel(c.timetableId || '?')}`
  if (tt === 'SCHEDULE') return `为 ${c.date || '?'} 设置课程表（班级/范围见生效域）`
  if (tt === 'ALL') return `为 ${c.date || '?'} 设置课程表`
  return ''
}

export async function fetchClassScheduleTemplateByWeekday({ school, grade, cls, weekday }) {
  try {
    const resp = await axios.get(`${APISRV}/web/config/${school}/${grade}/${cls}/schedule`)
    const data = resp?.data || {}
    const days = Array.isArray(data.daily_class) ? data.daily_class : []
    const day = days[weekday] || {classList: [], timetable: ''}
    const classList = Array.isArray(day.classList) ? day.classList : []
    const timetableLabel = String(day.timetable || '')
    const periods = classList.map((arr, idx) => {
      const subject = Array.isArray(arr) && arr.length > 0 ? String(arr[0] ?? '') : ''
      return { no: idx + 1, subject }
    })
    return {data: {periods, timetableLabel}}
  } catch (e) {
    console.warn('[autorun] fetchClassScheduleTemplateByWeekday fallback', e)
    return {data: {periods: [], timetableLabel: ''}}
  }
}

export async function fetchTimetableOptions(school, grade) {
  const resp = await axios.get(`${APISRV}/web/config/${school}/${grade}/timetable/options`)
  const list = Array.isArray(resp?.data?.options) ? resp.data.options : []
  const options = list.map(it => ({ label: it.label, value: it.value, need: it.need }))
  const needMap = new Map(options.map(o => [o.label, Number(o.need) || 0]))
  return { options, needMap }
}

export async function fetchSubjectsOptions(school, grade) {
  const resp = await axios.get(`${APISRV}/web/config/${school}/${grade}/subjects/options`)
  const list = Array.isArray(resp?.data?.options) ? resp.data.options : []
  const options = list.map(it => ({ label: it.label, value: it.value }))
  return { options }
}

export async function fetchCompByHoliday(yyyyMmDd) {
  try {
    const [y,m,d] = String(yyyyMmDd).split('-')
    const resp = await axios.get(`${APISRV}/web/autorun/compensation/holiday/${y}/${m}/${d}`)
    return { data: resp?.data }
  } catch (e) {
    console.warn('[autorun] fetchCompByHoliday error', e)
    return { data: null }
  }
}

export async function fetchCompByWorkday(yyyyMmDd) {
  try {
    const [y,m,d] = String(yyyyMmDd).split('-')
    const resp = await axios.get(`${APISRV}/web/autorun/compensation/workday/${y}/${m}/${d}`)
    return { data: resp?.data }
  } catch (e) {
    console.warn('[autorun] fetchCompByWorkday error', e)
    return { data: null }
  }
}

export async function fetchCompYearPairs(year) {
  try {
    const resp = await axios.get(`${APISRV}/web/autorun/compensation/year/${year}`)
    const pairs = Array.isArray(resp?.data?.pairs) ? resp.data.pairs : []
    return { data: { year: resp?.data?.year ?? year, pairs } }
  } catch (e) {
    console.warn('[autorun] fetchCompYearPairs error', e)
    return { data: { year, pairs: [] } }
  }
}

async function delay(ms = 150) {
  await new Promise(r => setTimeout(r, ms))
}
