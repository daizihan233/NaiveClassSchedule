import axios from 'axios'
import {APISRV} from '@/global.js'

// 伪数据 API：自动任务（支持分类内容与多选生效域）
// 合同：所有函数返回 Promise，并在 120-200ms 之间模拟延迟
// TaskItem: { id, type(0..3), scope: string[], content: object, priority(number), status('待生效'|'生效中'|'已过期') }

let seq = 20

export const AutorunType = {
  COMPENSATION: 0, // 调休：content = { date: 'YYYY-MM-DD', useDate: 'YYYY-MM-DD' }
  TIMETABLE: 1,    // 作息表调整：content = { date: 'YYYY-MM-DD', timetableId: string }
  SCHEDULE: 2,     // 课程表调整：content = { date: 'YYYY-MM-DD', schedule: object }
  ALL: 3           // 全部调整：content = { date: 'YYYY-MM-DD', schedule: object }
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

// 作用域编码与解析（新格式）：
// 学校: "{school}" 例如 "39"
// 年级: "{school}/{grade}" 例如 "39/2023"
// 班级: "{school}/{grade}/{class}" 例如 "39/2023/1"
export function encodeScope(level, school, grade, cls) {
  if (level === 'school') return `${school}`
  if (level === 'grade') return `${school}/${grade}`
  if (level === 'class') return `${school}/${grade}/${cls}`
  return String(level)
}
export function parseScope(value) {
  const raw = String(value || '')
  // 新格式：39 | 39/2023 | 39/2023/1
  const parts = raw.split('/').filter(s => s !== '')
  const [school, grade, cls] = parts
  let level = 'unknown'
  if (parts.length === 1) level = 'school'
  else if (parts.length === 2) level = 'grade'
  else if (parts.length >= 3) level = 'class'
  return { level, school, grade, class: cls }
}

let scopeTreeCache = null
function buildScopeTreeFromMenu(menu) {
  if (!Array.isArray(menu)) return []
  const result = []
  for (const node of menu) {
    // 只处理有 raw 的节点作为层级节点；过滤掉有 to 的导航项
    if (node && typeof node === 'object' && 'raw' in node && !node.to) {
      const schoolLabel = node.text || node.label || String(node.raw)
      const schoolVal = encodeScope('school', String(node.raw))
      const school = { label: schoolLabel, value: schoolVal, raw: String(node.raw), children: [] }
      const children = Array.isArray(node.children) ? node.children : []
      for (const g of children) {
        if (g && typeof g === 'object' && 'raw' in g && !g.to) {
          const gradeLabel = g.text || g.label || String(g.raw)
          const gradeVal = encodeScope('grade', String(node.raw), String(g.raw))
          const grade = { label: gradeLabel, value: gradeVal, raw: String(g.raw), children: [] }
          const classes = Array.isArray(g.children) ? g.children : []
          for (const c of classes) {
            if (c && typeof c === 'object' && 'raw' in c && !c.to) {
              const classLabel = c.text || c.label || String(c.raw)
              const classVal = encodeScope('class', String(node.raw), String(g.raw), String(c.raw))
              grade.children.push({ label: classLabel, value: classVal, raw: String(c.raw) })
            }
          }
          school.children.push(grade)
        }
      }
      result.push(school)
    }
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

export function makeScopeLabelMap(tree) {
  const map = new Map()
  const walk = (nodes) => nodes.forEach(n => { map.set(n.value, n.label); if (Array.isArray(n.children)) walk(n.children) })
  walk(tree || [])
  return map
}

// 初始伪数据（若干条）
const store = [
  {
    id: 'task-001',
    type: AutorunType.COMPENSATION,
    scope: [encodeScope('school','39')],
    content: { date: '2025-10-02', useDate: '2025-09-29' },
    priority: 10,
    status: '待生效'
  },
  {
    id: 'task-002',
    type: AutorunType.TIMETABLE,
    scope: [encodeScope('grade','39','2023')],
    content: { date: '2025-10-08', timetableId: 'exam' },
    priority: 20,
    status: '生效中'
  },
  {
    id: 'task-003',
    type: AutorunType.SCHEDULE,
    scope: [encodeScope('class','39','2023','1')],
    content: { date: '2025-10-09', schedule: { periods: [{ no:1, subject:'语文'},{ no:2, subject:'数学'}] } },
    priority: 30,
    status: '已过期'
  },
  {
    id: 'task-004',
    type: AutorunType.ALL,
    scope: [encodeScope('school','39')],
    content: { date: '2025-10-10', schedule: { periods: [{ no:1, subject:'班会'},{ no:2, subject:'体育'}] } },
    priority: 5,
    status: '待生效'
  }
]

// 覆盖 listTasks：改为请求后端 /web/autorun 获取表格数据
export async function listTasks() {
  const resp = await axios.get(`${APISRV}/web/autorun`)
  const payload = resp?.data
  const arr = Array.isArray(payload?.data) ? payload.data : []
  const data = arr.map((t) => {
    const id = t.hashid ?? t.id
    return {
      id,
      type: t.type,
      scope: Array.isArray(t.scope) ? t.scope : (t.scope ? [t.scope] : []),
      content: t.content || {},
      priority: Number(t.priority) || 0,
      status: t.status || '待生效'
    }
  })
  return { data }
}

// getTask 维持返回原始 scope（编码字符串数组）
export async function getTask(id) {
  await delay()
  const found = store.find(t => t.id === id)
  if (!found) { const error = new Error('Not Found'); error.status = 404; throw error }
  return { data: JSON.parse(JSON.stringify(found)) }
}

export async function createTask(payload) {
  await delay()
  const id = `task-${(seq++).toString().padStart(3, '0')}`
  const task = {
    id,
    type: payload.type,
    scope: Array.isArray(payload.scope) ? payload.scope.slice() : [],
    content: payload.content || {},
    priority: Number(payload.priority) || 0,
    status: '待生效' // 状态后端控制；新建默认为待生效
  }
  store.push(task)
  return { data: JSON.parse(JSON.stringify(task)) }
}

export async function updateTask(id, payload) {
  await delay()
  const idx = store.findIndex(t => t.id === id)
  if (idx === -1) { const error = new Error('Not Found'); error.status = 404; throw error }
  const next = {
    ...store[idx],
    type: payload.type ?? store[idx].type,
    scope: Array.isArray(payload.scope) ? payload.scope.slice() : store[idx].scope,
    content: payload.content ?? store[idx].content,
    priority: payload.priority != null ? Number(payload.priority) : store[idx].priority
    // status 仍由后端控制，不在此修改
  }
  store[idx] = next
  return { data: JSON.parse(JSON.stringify(next)) }
}

export async function deleteTask(id) {
  await delay()
  const idx = store.findIndex(t => t.id === id)
  if (idx !== -1) store.splice(idx, 1)
  return { data: true }
}

// 保存/更新自动任务：PUT /web/autorun/
// 参数：payload 为任务对象，password 为 Basic Auth 密码
// 返回：后端响应 data 原样透传
export async function saveAutorun(payload, password){
  // 仅处理调休类型与作息表调整类型
  if (payload && payload.type === AutorunType.COMPENSATION){
    const resp = await axios.put(`${APISRV}/web/autorun/compensation`, payload, {
      auth: { username: 'ElectronClassSchedule', password }
    })
    return resp?.data
  }
  if (payload && payload.type === AutorunType.TIMETABLE) {
    const resp = await axios.put(`${APISRV}/web/autorun/timetable`, payload, {
      auth: {username: 'ElectronClassSchedule', password}
    })
    return resp?.data
  }
  // 其他类型暂不处理
  return { skipped: true }
}

// 内容摘要，供列表展示
export function summarizeContent(task) {
  if (!task) return ''
  const t = task.type
  const c = task.content || {}
  if (t === AutorunType.COMPENSATION) return `${c.date || '?'} 上 ${c.useDate || '?'} 的课`
  if (t === AutorunType.TIMETABLE) return `${c.date || '?'} 使用作息表：${getTimetableLabel(c.timetableId || '?')}`
  if (t === AutorunType.SCHEDULE) return `为 ${c.date || '?'} 设置课程表（班级/范围见生效域）`
  if (t === AutorunType.ALL) return `全局为 ${c.date || '?'} 设置课程表`
  return ''
}

// 根据日期与作用域获取课程表模板
// 合同：GET /web/schedule/by-date?date=YYYY-MM-DD&scope=<encoded>
// 返回 { data: { periods: Array<{ no:number, subject:string }> } }
export async function fetchScheduleByDate(date, scope) {
  try {
    const resp = await axios.get(`${APISRV}/web/schedule/by-date`, { params: { date, scope } })
    const data = resp?.data?.data || {}
    const periods = Array.isArray(data.periods) ? data.periods : []
    return { data: { periods } }
  } catch (e) {
    console.warn('[autorun] fetchScheduleByDate fallback', e)
    // 兜底 8 节课模板
    const fallback = Array.from({ length: 8 }).map((_, i) => ({ no: i + 1, subject: `第${i + 1}节` }))
    return { data: { periods: fallback } }
  }
}

// 从班级配置抽取周几模板
// GET /web/config/{school}/{grade}/{cls}/schedule -> { daily_class: [ { classList: string[][], ... } ] }
// 返回 { data: { periods: Array<{ no:number, subject:string }> } }
export async function fetchClassScheduleTemplateByWeekday({ school, grade, cls, weekday }) {
  try {
    const resp = await axios.get(`${APISRV}/web/config/${school}/${grade}/${cls}/schedule`)
    const data = resp?.data || {}
    const days = Array.isArray(data.daily_class) ? data.daily_class : []
    const day = days[weekday] || { classList: [] }
    const classList = Array.isArray(day.classList) ? day.classList : []
    const periods = classList.map((arr, idx) => {
      const subject = Array.isArray(arr) && arr.length > 0 ? String(arr[0] ?? '') : ''
      return { no: idx + 1, subject }
    })
    return { data: { periods } }
  } catch (e) {
    console.warn('[autorun] fetchClassScheduleTemplateByWeekday fallback', e)
    return { data: { periods: [] } }
  }
}

// 获取年级作息表选项（含节次 need）
export async function fetchTimetableOptions(school, grade) {
  const resp = await axios.get(`${APISRV}/web/config/${school}/${grade}/timetable/options`)
  const list = Array.isArray(resp?.data?.options) ? resp.data.options : []
  const options = list.map(it => ({ label: it.label, value: it.value, need: it.need }))
  const needMap = new Map(options.map(o => [o.label, Number(o.need) || 0]))
  return { options, needMap }
}

// 获取年级学科选项
export async function fetchSubjectsOptions(school, grade) {
  const resp = await axios.get(`${APISRV}/web/config/${school}/${grade}/subjects/options`)
  const list = Array.isArray(resp?.data?.options) ? resp.data.options : []
  const options = list.map(it => ({ label: it.label, value: it.value }))
  return { options }
}

// 调休：给定节假日 -> 反推工作日
export async function fetchCompByHoliday(yyyyMmDd) {
  try {
    const [y,m,d] = String(yyyyMmDd).split('-')
    const resp = await axios.get(`${APISRV}/web/autorun/compensation/holiday/${y}/${m}/${d}`)
    return { data: resp?.data }
  } catch (e) {
    return { data: null }
  }
}

// 调休：给定工作日 -> 反推节假日
export async function fetchCompByWorkday(yyyyMmDd) {
  try {
    const [y,m,d] = String(yyyyMmDd).split('-')
    const resp = await axios.get(`${APISRV}/web/autorun/compensation/workday/${y}/${m}/${d}`)
    return { data: resp?.data }
  } catch (e) {
    return { data: null }
  }
}

// 调休：获取全年 pairs
export async function fetchCompYearPairs(year) {
  try {
    const resp = await axios.get(`${APISRV}/web/autorun/compensation/year/${year}`)
    const pairs = Array.isArray(resp?.data?.pairs) ? resp.data.pairs : []
    return { data: { year: resp?.data?.year ?? year, pairs } }
  } catch (e) {
    return { data: { year, pairs: [] } }
  }
}

// 简单延迟工具（用于伪数据路径）
async function delay(ms = 150) {
  await new Promise(r => setTimeout(r, ms))
}
