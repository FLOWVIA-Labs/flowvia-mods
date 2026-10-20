import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput, RenderChildren, RenderSurface, RenderElement, Timer } from 'claude-code'
import type { NeonSectionsEntry, NeonSectionsTurn, Prismantis } from '../types/index'
import { languageOption, messages, resolveLanguage, sectionKey, statusBadge } from './i18n'
import { openPanel, registerPanel, resetPanel } from './panel'
import { editable, effects } from './effects'
import { glowColor, titleColor } from './colors'
import { codeBoxes, registerCopy } from './code-box'
import type { Section } from '../types/index'
import { brighter, config, defaults, fenceAfter, names, parse, record, validColor } from './sections'

import { empty } from './state'
const session = atom({ plugin: 'neon-sections', key: 'session' } as const, empty)
// Only animated boxes subscribe; storing this in session would redraw every site on each tick.
const tick = atom({ plugin: 'neon-sections', key: 'tick' } as const, 0)
const appearance = atom({ plugin: 'neon-sections', key: 'appearance' } as const,
  { light: false, verbose: false })



function lastText(turn?: NeonSectionsTurn) {
  return turn?.entries.findLast(e => e.kind === 'text')
}

function summary(input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const values = input as Record<string, unknown>
  const value = values.command ?? values.file_path ?? values.pattern ?? values.query ?? values.url
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').slice(0, 120) : ''
}

type Animation = { sites: Set<string>; timer?: Timer }
function stop(animation: Animation) {
  animation.timer?.cancel()
  animation.timer = undefined
  animation.sites.clear()
}
function animate($: EngineInterface, animation: Animation, id: string, active: boolean) {
  if (active) animation.sites.add(id)
  else animation.sites.delete(id)
  if (!animation.sites.size) { stop(animation); return }
  if (!animation.timer) animation.timer = $.clock.every(250, async () => {
    const now = await $.clock.now()
    await update($, tick, () => now)
  })
}

async function body($: EngineInterface, e: RenderInput, text: string, columns: number, numberColor?: string,
  code?: { draw: ReturnType<typeof codeBoxes>; title: string }): Promise<RenderChildren> {
  const { Box, Text, Markdown } = $.ui.resolve(e)
  const markdown = async (text: string, width = columns) => {
    try {
      const tree = await ($ as EngineInterface & { prismantis: Prismantis<RenderSurface, RenderElement> }).prismantis.markdown({ surface: e.surface, text, columns: width })
      if (tree !== undefined) return tree
    } catch { /* Optional renderer: keep the native Markdown fallback. */ }
    return <Markdown text={text} />
  }
  const content = async (text: string, width = columns): Promise<RenderChildren> => {
    if (!code) return markdown(text, width)
    const parts: RenderChildren[] = [], lines = text.split('\n')
    let prose: string[] = []
    for (let i = 0; i < lines.length; i++) {
      const fence = fenceAfter(lines[i]!, '')
      if (!fence) { prose.push(lines[i]!); continue }
      const start = i
      if (prose.length) parts.push(await markdown(prose.join('\n'), width))
      prose = []
      const language = /^\s*(?:`{3,}|~{3,})\s*(\S+)?/.exec(lines[i]!)?.[1]
      const source: string[] = []
      while (i + 1 < lines.length && fenceAfter(lines[i + 1]!, fence)) source.push(lines[++i]!)
      const closed = i + 1 < lines.length
      if (closed) i++
      parts.push(await code.draw(source.join('\n'), language, closed, width, code.title) ??
        await markdown(lines.slice(start, i + 1).join('\n'), width))
    }
    if (prose.length) parts.push(await markdown(prose.join('\n'), width))
    return parts
  }
  const nodes: RenderChildren[] = []
  let pending: string[] = [], fence = ''
  let previousNumbered = false
  const flush = async (numbered = false) => {
    const gap = previousNumbered && numbered && !pending.join('\n').trim()
    if (pending.length && !gap) nodes.push(await content(pending.join('\n')))
    pending = []
    previousNumbered = numbered
    return gap
  }
  const lines = text.split('\n')
  const marker = /^(\d+(?:-\d+)?[.)])\s+(.*)$/
  const continues = (at: number, open = '') => at < lines.length && (Boolean(open) ||
    /^ {2,}\S/.test(lines[at]!) || (!lines[at]!.trim() &&
      /^ {2,}\S/.test(lines.slice(at + 1).find(line => line.trim()) ?? '')))
  let scanFence = '', numberWidth = 0
  if (numberColor) for (const line of lines) {
    const next = fenceAfter(line, scanFence)
    if (!scanFence && !next) {
      const match = marker.exec(line)
      if (match) numberWidth = Math.max(numberWidth, match[1]!.length + 1)
    }
    scanFence = next
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const nextFence = fenceAfter(line, fence)
    if (fence || nextFence) { pending.push(line); fence = nextFence; continue }
    const underlined = (numberColor ? /^(\s*(?:[-*+] |\d+(?:-\d+)?[.)]\s+)?)<u>(.*)/ :
      /^(\s*(?:[-*+] |\d+[.)] )?)<u>(.*)/).exec(line)
    if (underlined) {
      let content = underlined[2]!, end = i
      while (!content.includes('</u>') && end + 1 < lines.length) content += '\n' + lines[++end]
      if (content.endsWith('</u>') && content.indexOf('</u>') === content.length - 4 &&
          !(numberColor && marker.test(line) && continues(end + 1))) {
        const numbered = numberColor && marker.exec(line)
        const prefix = numbered ? numbered[1]!.padEnd(numberWidth) : underlined[1]!
        const gap = await flush(Boolean(numbered))
        const pieces = content.slice(0, -4).split(/(\*\*[^*]+\*\*)/g)
        nodes.push(<Box {...(numbered ? { alignItems: 'flex-start' } : {})} {...(gap ? { marginTop: 1 } : {})}><Text color={numberColor ?? 'inactive'} {...(numberColor ? { bold: true } : {})}>{prefix}</Text><Text underline color="text">
          {pieces.map(p => p.startsWith('**') && p.endsWith('**')
            ? <Text bold>{p.slice(2, -2)}</Text> : p)}
        </Text></Box>)
        i = end
        continue
      }
    }
    const numbered = numberColor && marker.exec(line)
    if (numbered) {
      const gap = await flush(true)
      const item = [numbered[2]!]
      const indent = new RegExp(`^ {1,${numbered[1]!.length + 1}}`)
      let itemFence = fenceAfter(item[0]!, '')
      while (continues(i + 1, itemFence)) {
        const line = lines[++i]!.replace(indent, '')
        item.push(line)
        itemFence = fenceAfter(line, itemFence)
      }
      let stripFence = ''
      const itemText = item.map(line => {
        const next = fenceAfter(line, stripFence)
        const value = stripFence || next ? line : line.replace(/<\/?u>/g, '')
        stripFence = next
        return value
      }).join('\n')
      const width = Math.max(0, columns - numberWidth)
      nodes.push(<Box alignItems="flex-start" {...(gap ? { marginTop: 1 } : {})}><Text color={numberColor} bold>{numbered[1]}{' '.repeat(numberWidth - numbered[1]!.length)}</Text>
        <Box flexDirection="column" flexGrow={1}>{numbered[2]!.startsWith('<u>')
          ? await body($, e, item.join('\n'), width, undefined, code) : await content(itemText, width)}</Box></Box>)
    } else pending.push(line.replace(/<\/?u>/g, ''))
  }
  await flush()
  return nodes
}

export const register: Register = (on, options) => {
  const preference = atom({ plugin: 'neon-sections', key: 'language' } as const, languageOption(options.language))
  const settings = atom({ plugin: 'neon-sections', key: 'config' } as const, config(options))
  // Only cancellation handles live here; all values read by drawings are host state.
  const animation: Animation = { sites: new Set() }
  registerPanel(on, options, () => stop(animation))
  const copySources = new Map<string, Map<string, string>>()
  registerCopy(on, copySources)

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({ name: 'ns-setting', description: messages[await resolveLanguage($, await read($, preference))].command })
    const rows = await $.config.list()
    await update($, appearance, () => ({
      light: String(rows.find(r => r.key === 'theme')?.value ?? '').startsWith('light'),
      verbose: rows.find(r => r.key === 'verbose')?.value === true,
    }))
    return result
  })

  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    return { sections: [...result.sections.filter(s => s.id !== 'neon-sections:format'),
      { id: 'neon-sections:format', text: messages[await resolveLanguage($, await read($, preference))].prompt, scope: 'session' as const }] }
  })

  on('turn.start', async ($, e, next) => {
    await update($, session, s => ({ ...s, active: e.turnId,
      turns: s.turns.some(t => t.id === e.turnId) ? s.turns : [...s.turns,
        { id: e.turnId, entries: [], completedAt: null, attention: false }] }))
    return next(e)
  })

  on('session.append', { door: 'response' }, async ($, e, next) => {
    const result = await next(e)
    if (e.agentId || !result.message) return result
    const entries: NeonSectionsEntry[] = []
    for (const block of result.message.content) {
      if (block.type === 'text' && typeof block.text === 'string') {
        entries.push({ kind: 'text', id: result.uuid, text: block.text })
      } else if (block.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string') {
        entries.push({ kind: 'tool', id: block.id, name: block.name, summary: summary(block.input), failed: false })
      }
    }
    await update($, session, s => ({ ...s, turns: s.turns.map(t => t.id !== s.active ? t : {
      ...t, entries: [...t.entries.filter(old => !entries.some(entry => entry.id === old.id)), ...entries],
    }) }))
    return result
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId) return next(e)
    await update($, session, s => ({ ...s, turns: s.turns.map(t => t.id !== s.active ? t : {
      ...t, entries: t.entries.some(entry => entry.id === e.tool_use_id) ? t.entries : [...t.entries,
        { kind: 'tool' as const, id: e.tool_use_id, name: String(e.tool), summary: summary(e), failed: false }],
    }) }))
    const result = await next(e)
    const errorResult = result.result as { isError?: boolean; isErrored?: boolean } | null
    const failed = result.isError === true || typeof result.deny === 'string' ||
      errorResult?.isError === true || errorResult?.isErrored === true
    await update($, session, s => ({ ...s, turns: s.turns.map(t => ({ ...t,
      entries: t.entries.map(entry => entry.kind === 'tool' && entry.id === e.tool_use_id
        ? { ...entry, failed } : entry),
    })) }))
    return result
  })

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) {
      const now = await $.clock.now()
      await update($, session, s => ({ ...s, latest: e.turnId,
        turns: s.turns.map(t => t.id === e.turnId ? { ...t, completedAt: now, attention: true } : t) }))
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    stop(animation)
    await update($, session, s => ({ ...s, turns: s.turns.map(t => ({ ...t, attention: false })) }))
    return next(e)
  })
  on('session.end', async ($, e, next) => {
    stop(animation)
    copySources.clear()
    await update($, session, () => empty)
    await resetPanel($)
    return next(e)
  })

  on('config.set', async ($, e, next) => {
    const result = await next(e)
    if (result.deny !== undefined) return result
    if (e.key === 'neon-sections.language') {
      await update($, preference, () => languageOption(result.value))
    } else if (e.key.startsWith('neon-sections.')) {
      const key = e.key.slice('neon-sections.'.length)
      await update($, settings, c => config({ ...c, [key]: result.value }))
    } else if (e.key === 'theme' || e.key === 'verbose') {
      await update($, appearance, a => e.key === 'theme'
        ? { ...a, light: String(result.value).startsWith('light') }
        : { ...a, verbose: result.value === true })
    }
    return result
  })

  on('command.run', { command: 'ns-setting' }, async ($, e) => {
    const t = messages[await resolveLanguage($, await read($, preference))]
    const args = e.args.trim()
    if (args === 'off' || args === 'on') {
      if (args === 'off') stop(animation)
      await update($, session, s => ({ ...s, enabled: args === 'on' }))
      return { text: `${t.answerSections} ${args}` }
    }
    const c = await read($, settings)
    if (!args) { await openPanel($, (await read($, appearance)).light, t.title); return {} }
    if (args === 'status') return { text: `${t.answerSections} ${(await read($, session)).enabled ? 'on' : 'off'}\n` +
      Object.entries(c).map(([key, value]) => `${key}: ${value}`).join('\n') }
    const color = /^color (.+) (#[\da-fA-F]{6})(?: (dark|light))?$/.exec(args)
    const effect = /^effect (glow|latest|hover|blink|breathe) (.+) (on|off)$/.exec(args)
    const section = sectionKey(color?.[1] ?? effect?.[2] ?? '')
    const fold = /^fold (on|off)$/.exec(args)
    let key: string, value: string | boolean
    if (fold) {
      key = 'foldTools'
      value = fold[1] === 'on'
    } else if (color && section && section !== 'rationale') {
      key = section +
        'Color' + (color[3] === 'light' ? 'Light' : 'Dark')
      value = color[2]!
    } else if (effect && section && section !== 'rationale') {
      key = section + effects.find(e => e.command === effect[1])!.key
      value = effect[3] === 'on'
    } else return { text: t.usage }
    const result = await $.config.set({ key: `neon-sections.${key}`, value })
    if (result.deny !== undefined) return { text: t.rejected(result.deny) }
    await update($, settings, old => config({ ...old, [key]: result.value }))
    return { text: `${key}: ${result.value}` }
  })

  on('ui.render', { component: ['AssistantMessage', 'ToolUse', 'ToolGroup', 'ToolResult'] }, async ($, e, next) => {
    const s = await read($, session), c = await read($, settings), a = await read($, appearance)
    const language = await resolveLanguage($, await read($, preference)), t = messages[language]
    const site = `${e.surface}:${e.requestId}`
    if (!s.enabled || a.verbose || ('isExpanded' in e.props && e.props.isExpanded === true)) {
      animate($, animation, site, false)
      return next(e)
    }
    const { Box, Text, Button } = $.ui.resolve(e)
    // Regular terminals lack clicks and ToolUse's isExpanded, so hidden rows cannot be restored.
    const foldable = e.surface !== 'terminal' || e.viewport?.isFullscreen === true
    if (e.component !== 'AssistantMessage') {
      if (!c.foldTools) return next(e)
      const ids = e.component === 'ToolGroup' ? e.props.calls.map(call => call.tool_use_id) : [e.props.tool_use_id]
      const canFold = ids.length > 0 && ids.every(id => s.turns.some(t => lastText(t) && t.entries.some(x => x.kind === 'tool' && x.id === id)))
      return canFold && foldable ? <Box /> : next(e)
    }
    const turn = s.turns.find(t => t.entries.some(x => x.kind === 'text' && x.id === e.requestId))
    const owner = lastText(turn)
    const isOwner = owner?.id === e.requestId
    if (c.foldTools && turn && !isOwner && turn.entries.some((x, i) => x.kind === 'tool' &&
        i > turn.entries.findIndex(entry => entry.id === e.requestId))) return foldable ? <Box /> : next(e)
    const streaming = s.turns.some(t => t.id === s.active && t.completedAt === null) &&
      (!turn || turn.id === s.active)
    const parsed = parse(e.props.text, streaming)
    const elapsed = turn?.completedAt == null ? 1000 : Math.max(0, (await $.clock.now()) - turn.completedAt)
    const canAnimate = parsed.boxed && isOwner && turn?.attention === true && e.props.onScreen !== null && foldable
    const pulse = canAnimate && elapsed < 1000 && editable.some(s => parsed.sections[s.key] && c[`${s.key}Blink`])
    const breathe = canAnimate && editable.some(s => parsed.sections[s.key] && c[`${s.key}Breathe`])
    animate($, animation, site, !!(pulse || breathe))
    if (pulse || breathe) await read($, tick)
    const sections: RenderChildren[] = []
    const drawCode = codeBoxes($, e, a.light, copySources, language)
    // Match prismantis response width (columnsOf): subtract 4 columns of padding, defaulting to 100 columns before measurement.
    const columns = Math.max(20, Math.floor(e.viewport?.columns ?? 100) - 4)
    if (parsed.recognized) {
      if (parsed.preamble) sections.push(await body($, e, parsed.preamble, columns))
      for (const name of names) {
        const text = parsed.sections[name]
        if (!text) continue
        if (!parsed.boxed) { sections.push(await body($, e, text, columns)); continue }
        const prefix = name === 'rationale' ? '' : name
        const key = `${prefix}Color${a.light ? 'Light' : 'Dark'}` as 'conclusionColorDark'
        const base = name === 'rationale' ? (a.light ? '#949494' : '#626262') : (validColor(c[key]) ? c[key] : defaults[key])
        const title = name === 'rationale' ? (a.light ? '#585858' : '#BCBCBC') : titleColor(base, a.light)
        const effect = (suffix: 'Glow' | 'LatestOnly' | 'Hover' | 'Blink' | 'Breathe') =>
          name !== 'rationale' && c[`${prefix as Section}${suffix}`]
        const color = pulse && effect('Blink') ? brighter(base, 0.6 * Math.sin(Math.PI * elapsed / 1000)) :
          breathe && effect('Breathe') ? brighter(base, 0.35 * (1 - Math.cos(Math.PI * elapsed / 1000)) / 2) : base
        const dim = foldable && effect('LatestOnly') && !!s.latest && turn?.id !== s.latest
        const hover = foldable && effect('Hover') ? { borderStyle: 'bold', borderColor: brighter(base), borderDimColor: false } : undefined
        const headingLanguage = parsed.languages[name]!
        const status = name === 'conclusion' ? statusBadge(parsed.status, headingLanguage) : undefined
        const box = <Box key={`section-${name}`} flexDirection="column" borderStyle="round" borderColor={color}
          {...(dim ? { borderDimColor: true } : {})} {...(hover ? { hover } : {})} paddingX={1} marginBottom={1}>
          <Box justifyContent="space-between"><Text bold color={title}>{messages[headingLanguage].sections[name]}</Text>
            {status ? <Text bold color={status[1]}>{status[0]}</Text> : null}</Box>
          {await body($, e, text, Math.max(0, columns - 4 - (effect('Glow') ? 2 : 0)), name === 'next' ? base : undefined, { draw: drawCode, title })}
        </Box>
        sections.push(effect('Glow') ? <Box flexDirection="column" borderStyle="round" borderColor={glowColor(color, a.light)} {...(dim ? { borderDimColor: true } : {})}>{box}</Box> : box)
      }
    } else sections.push(await next(parsed.visible === e.props.text ? e : { ...e, props: { ...e.props, text: parsed.visible } }))
    const tools = turn?.entries.filter(x => x.kind === 'tool') ?? []
    if (c.foldTools && isOwner && turn && tools.length) {
      const progress = turn.entries.filter((x, i) => x.kind === 'text' && turn.entries.slice(i + 1).some(after => after.kind === 'tool'))
      const expanded = foldable && s.expanded[turn.id] === true
      const counts = ` · ${t.tools(tools.length)}${progress.length ? ` · ${t.progress(progress.length)}` : ''}`
      const label = `${expanded ? '▾' : '▸'} ${t.workLog}${counts}`
      if (foldable) sections.push(<Button key={`process-${turn.id}`} plain label={label} onPress={() => update($, session,
        old => ({ ...old, expanded: { ...old.expanded, [turn.id]: !old.expanded[turn.id] } }))}>
        <Text color={a.light ? '#585858' : '#BCBCBC'}>{expanded ? '▾' : '▸'}{' '}{t.workLog}</Text>
        <Text color="inactive">{counts}</Text>
      </Button>)
      if (expanded) for (const entry of turn.entries) {
        if (entry.kind === 'text') {
          if (progress.includes(entry)) sections.push(<Text color={a.light ? '#585858' : '#BCBCBC'}>{entry.text}</Text>)
        } else sections.push(<Text><Text color={entry.failed ? 'error' : 'success'}>{entry.failed ? '✗' : '✓'} </Text>
          <Text bold>{entry.name}</Text><Text color="inactive">{' '}{entry.summary}</Text></Text>)
      }
      sections.push(<Text color="inactive">{record(turn.entries, language)}</Text>)
    }
    if (!parsed.recognized && (!c.foldTools || !tools.length)) return sections[0] as Awaited<ReturnType<typeof next>>
    return <Box flexDirection="column">{sections}</Box>
  }).catch(($, e, next) => next(e))
}
