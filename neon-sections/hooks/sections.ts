import type { NeonSectionsConfig, NeonSectionsEntry, EffectKey } from '../types/index'

import { messages, sectionKeys as names } from './i18n'
import type { Language } from './i18n'
export { names }
export type SectionName = typeof names[number]
export const defaults: NeonSectionsConfig = {
  foldTools: true,
  conclusionColorDark: '#00D7FF', conclusionColorLight: '#0087AF',
  attentionColorDark: '#FFD700', attentionColorLight: '#AF8700',
  nextColorDark: '#FF5FFF', nextColorLight: '#D700D7',
  conclusionGlow: false, conclusionLatestOnly: false, conclusionHover: false, conclusionBlink: false, conclusionBreathe: false,
  attentionGlow: false, attentionLatestOnly: false, attentionHover: false, attentionBlink: false, attentionBreathe: false,
  nextGlow: false, nextLatestOnly: false, nextHover: false, nextBlink: false, nextBreathe: false,
}
export const validColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)

export function config(values: Record<string, unknown>): NeonSectionsConfig {
  const result = { ...defaults }
  for (const key of Object.keys(defaults) as (keyof NeonSectionsConfig)[]) {
    if (typeof defaults[key] === 'boolean') {
      const k = key as EffectKey | 'foldTools'
      result[k] = typeof values[key] === 'boolean' ? values[key] : defaults[k]
    } else {
      const k = key as 'conclusionColorDark'
      result[k] = validColor(values[key]) ? values[key] : defaults[k]
    }
  }
  return result
}

// Track the fence's character and length so headings in code remain literal.
export function fenceAfter(line: string, fence: string): string {
  const mark = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]
  if (!mark) return fence
  if (!fence) return mark
  return mark[0] === fence[0] && mark.length >= fence.length &&
    line.trim() === mark ? '' : fence
}

export function parse(text: string, streaming: boolean) {
  const sections: Partial<Record<SectionName, string>> = {}
  const languages: Partial<Record<SectionName, Language>> = {}
  const headings = (['ko', 'en'] as const).flatMap(language => names.map(key => ({ key, language, heading: `### ${messages[language].sections[key]}` })))
  let preamble = '', current: SectionName | undefined, status = '', fence = ''
  let visible = text
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!, trimmed = line.trim()
    if (!fence && streaming && i === lines.length - 1 && trimmed &&
        headings.flatMap(h => h.key === 'conclusion' ? [h.heading, `${h.heading} · `] : [h.heading]).some(h => h.startsWith(trimmed) && h !== trimmed)) {
      visible = lines.slice(0, -1).join('\n')
      break
    }
    const nextFence = fenceAfter(line, fence)
    const match = !fence && nextFence === '' && headings.find(h => trimmed === h.heading ||
      (h.key === 'conclusion' && trimmed.startsWith(`${h.heading} · `)))
    if (match) {
      current = match.key
      languages[current] = match.language
      if (sections[current] !== undefined) sections[current] += '\n'
      else sections[current] = ''
      if (current === 'conclusion') status = trimmed.slice(match.heading.length + 3) || status
    } else if (current) sections[current] += `${line}\n`
    else preamble += `${line}\n`
    fence = nextFence
  }
  for (const name of names) if (sections[name] !== undefined) sections[name] = sections[name]!.trim()
  return { sections, languages, status, preamble: preamble.trim(), visible,
    recognized: sections.conclusion !== undefined,
    boxed: sections.conclusion !== undefined && Object.keys(sections).length > 1 }
}

export function record(entries: NeonSectionsEntry[], language: Language = 'ko'): string {
  const tools = entries.filter(e => e.kind === 'tool')
  if (!tools.length) return ''
  const counts = new Map<string, number>()
  for (const tool of tools) counts.set(tool.name, (counts.get(tool.name) ?? 0) + 1)
  const failures = tools.flatMap((tool, i) => tool.failed
    ? [`${tool.name} ✗${tools[i + 1] ? ` → ${tools[i + 1]!.name}` : ''}`] : [])
  const t = messages[language]
  return `${t.tools(tools.length)} · ` + [...counts].sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `${name} ${count}`).join(' · ') +
    (failures.length ? ` · ${t.failed(failures.length, failures.join(', '))}` : '')
}

export function brighter(hex: string, amount = 0.35): string {
  return '#' + [1, 3, 5].map(i => {
    const n = parseInt(hex.slice(i, i + 2), 16)
    return Math.round(n + (255 - n) * amount).toString(16).padStart(2, '0')
  }).join('')
}
