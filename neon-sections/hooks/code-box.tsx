import { messages } from './i18n'
import type { Language } from './i18n'
import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderInput, RenderSurface } from 'claude-code'
import { contrastOnDark } from './colors'

const copy = atom({ plugin: 'neon-sections', key: 'copy' } as const, {})

function cells(char: string): number {
  if (/\p{Mark}/u.test(char) || char === '\u200d') return 0
  const n = char.codePointAt(0)!
  return n >= 0x1100 && (n <= 0x115f || n === 0x2329 || n === 0x232a ||
    (n >= 0x2e80 && n <= 0xa4cf && n !== 0x303f) ||
    (n >= 0xac00 && n <= 0xd7a3) || (n >= 0xf900 && n <= 0xfaff) ||
    (n >= 0xfe10 && n <= 0xfe19) || (n >= 0xfe30 && n <= 0xfe6f) ||
    (n >= 0xff01 && n <= 0xff60) || (n >= 0xffe0 && n <= 0xffe6) ||
    (n >= 0x1f300 && n <= 0x1faff) || (n >= 0x20000 && n <= 0x3fffd)) ? 2 : 1
}

export function wrapCode(source: string, columns: number, firstWidth = columns, pad = true): string[] {
  let first = true
  return source.split('\n').flatMap(line => {
    const chars = Array.from(line.replace(/\t/g, '    '))
    const rows: string[] = []
    for (let start = 0; start < chars.length;) {
      const width = first ? firstWidth : columns
      first = false
      let end = start, used = 0, space = -1
      while (end < chars.length && used + cells(chars[end]!) <= width) {
        used += cells(chars[end]!)
        if (chars[end] === ' ') space = end
        end++
      }
      if (end === start) { rows.push(' '.repeat(width)); start++; continue }
      let next = end
      if (end < chars.length) {
        if (chars[end] === ' ') next++
        else if (space >= start) next = end = space + 1
      }
      const row = chars.slice(start, end)
      rows.push(row.join('') + (pad ? ' '.repeat(width - row.reduce((n, c) => n + cells(c), 0)) : ''))
      start = next
    }
    const width = first ? firstWidth : columns
    first = false
    return rows.length ? rows : [pad ? ' '.repeat(width) : ' ']
  })
}

async function copySource($: EngineInterface, id: string, source: string, surface: RenderSurface) {
  const started = await update($, copy, old => ({ ...old,
    [id]: { revision: (old[id]?.revision ?? 0) + 1, label: null, failed: false } }))
  const revision = started[id]!.revision
  let success = false
  try { success = (await $.ui.copy({ text: source, surface })).isCopied } catch { /* Show the same failure as a refused copy. */ }
  await update($, copy, old => old[id]?.revision !== revision ? old : { ...old,
    [id]: { revision, label: success ? 'COPIED' as const : 'FAILED' as const, failed: !success } })
  const timer = $.clock.every(success ? 1500 : 2000, async () => {
    timer.cancel()
    await update($, copy, old => old[id]?.revision !== revision ? old : {
      ...old, [id]: { ...old[id]!, label: null },
    })
  })
}

export function registerCopy(on: On, sources: Map<string, Map<string, string>>) {
  on('ui.message', { component: 'AssistantMessage' }, async ($, e) => {
    if (e.surface === 'terminal' || e.module !== 'hooks/copy.tsx' ||
        !/^copy-(0|[1-9]\d*)$/.test(e.element) || e.data !== 'copy') return {}
    const source = sources.get(`${e.surface}:${e.requestId}`)?.get(e.element)
    if (source === undefined) return {}
    await copySource($, `${e.requestId}:${e.element.slice(5)}`, source, e.surface)
    return {}
  })
}

export function codeBoxes($: EngineInterface, e: RenderInput, light: boolean, sources: Map<string, Map<string, string>>, locale: Language = 'ko') {
  const codes = new Map<string, string>()
  if (e.surface !== 'terminal') sources.set(`${e.surface}:${e.requestId}`, codes)
  let index = 0
  return async (source: string, language: string | undefined, closed: boolean, width: number, title: string) => {
    const n = index++, id = `${e.requestId}:${n}`, key = `copy-${n}`
    if (width < 5) return undefined
    const { Box, Text, Button, Code } = $.ui.resolve(e)
    const desktop = e.surface !== 'terminal'
    const clickable = closed && (desktop || e.viewport?.isFullscreen === true) && width >= (desktop ? 15 : 13)
    const state = clickable ? (await read($, copy))[id] : undefined
    const color = !light && contrastOnDark(title) < 4.5 ? '#EEEEEE' : title
    const statusColor = state?.label === 'COPIED'
      ? (desktop ? '#4EBA65' : light ? '#008700' : '#5FAF5F')
      : (desktop ? '#FF6B80' : light ? '#AF005F' : '#FF5F87')
    const button = clickable && !desktop ? <Button key={key} plain label={state?.label ?? '[COPY]'} onPress={press => copySource($, id, source, press.surface)}>
      {state?.label ? <Text color={statusColor}>{state.label}</Text> : [
        <Text color={color}>[</Text>, <Text color={color} bold>COPY</Text>, <Text color={color}>]</Text>,
      ]}
    </Button> : null
    const notice = state?.failed ? <Text dimColor color="inactive">{messages[locale].copyFailed}</Text> : null
    if (desktop) {
      const { Client } = $.ui.resolve({ surface: 'desktop', component: e.component })
      if (clickable) codes.set(key, source)
      const lines = wrapCode(source, width - 4, width - 4 - (clickable ? 10 : 0), false)
      return <Box flexDirection="column">
        <Box flexDirection="column" borderStyle="round" borderColor="#4E4E4E" backgroundColor="#262625" paddingX={1}>
          {clickable ? <Box justifyContent="space-between" columnGap={2}>
            <Box flexShrink={1} minWidth={0}><Text mono>{lines[0]}</Text></Box>
            <Box width={6} flexShrink={0}>
              <Client key={key} module="./copy.tsx" width={6} height={1} props={{ color, label: state?.label ?? null }} />
            </Box>
          </Box> : <Text mono>{lines[0]}</Text>}
          {lines.slice(1).map(line => <Text mono>{line}</Text>)}
        </Box>{notice}
      </Box>
    }
    const border = light ? '#B2B2B2' : '#4E4E4E'
    return <Box flexDirection="column">
      <Box>{button ? [
        <Text color={border}>{'╭' + '─'.repeat(width - 11) + ' '}</Text>,
        <Box width={6} flexShrink={0}>{button}</Box>, <Text color={border}>{' ─╮'}</Text>,
      ] : <Text color={border}>{'╭' + '─'.repeat(width - 2) + '╮'}</Text>}</Box>
      {wrapCode(source, width - 4).map(line => <Box>
        <Text color={border}>{'│ '}</Text><Box width={width - 4} flexShrink={0}><Code source={line} language={language} wrap="wrap" /></Box><Text color={border}>{' │'}</Text>
      </Box>)}
      <Text color={border}>{'╰' + '─'.repeat(width - 2) + '╯'}</Text>
      {notice}
    </Box>
  }
}
