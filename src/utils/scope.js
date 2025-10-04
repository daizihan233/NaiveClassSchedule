// 通用作用域工具
import {parseScope} from '@/api/autorun.js'

export function normalizeScopes(list) {
  const arr = Array.isArray(list) ? Array.from(new Set(list)) : []
  const schoolSet = new Set()
  const gradeSet = new Set() // key: `${school}/${grade}`
  for (const v of arr) {
    const p = parseScope(v)
    if (p.level === 'school') schoolSet.add(p.school)
    else if (p.level === 'grade') gradeSet.add(`${p.school}/${p.grade}`)
  }
  const out = []
  for (const v of arr) {
    const p = parseScope(v)
    if (p.level === 'school') out.push(v)
    else if (p.level === 'grade') {
      if (!schoolSet.has(p.school)) out.push(v)
    } else if (p.level === 'class') {
      if (!schoolSet.has(p.school) && !gradeSet.has(`${p.school}/${p.grade}`)) out.push(v)
    }
  }
  return out
}

export function applyDisabledToScopeOptions(options, selected) {
  const arr = Array.isArray(options) ? options : []
  const sel = Array.isArray(selected) ? selected : []
  const schoolSet = new Set()
  const gradeSet = new Set()
  for (const v of sel) {
    const p = parseScope(v)
    if (p.level === 'school') schoolSet.add(p.school)
    else if (p.level === 'grade') gradeSet.add(`${p.school}/${p.grade}`)
  }
  return arr.map(opt => {
    const p = parseScope(opt.value)
    let disabled = false
    if (p.level === 'grade') disabled = schoolSet.has(p.school)
    else if (p.level === 'class') disabled = schoolSet.has(p.school) || gradeSet.has(`${p.school}/${p.grade}`)
    return {...opt, disabled}
  })
}

export function parseGradePairsFromScopes(scopes) {
  const pairs = []
  const seen = new Set()
  for (const v of scopes || []) {
    const p = parseScope(v)
    if (p.level === 'grade' || p.level === 'class') {
      const key = `${p.school}/${p.grade}`
      if (!seen.has(key) && p.school && p.grade) {
        pairs.push({school: p.school, grade: p.grade});
        seen.add(key)
      }
    }
  }
  return pairs
}

// 在一棵 { value, children } 树中查找节点
export function findNodeByValue(nodes, value) {
  const stack = Array.isArray(nodes) ? [...nodes] : []
  while (stack.length) {
    const n = stack.shift()
    if (n?.value === value) return n
    if (Array.isArray(n?.children)) stack.push(...n.children)
  }
  return null
}

