import { test as baseTest, expect, mock } from 'claude-code/testing'
import type { TestRest } from 'claude-code/testing'
const test = (name: string, ...args: TestRest) => {
  if (typeof args[0] === 'function') baseTest(name, { options: { language: 'ko' } }, args[0])
  else baseTest(name, { ...args[0], options: { ...args[0].options, language: 'ko' } }, args[1]!)
}
import type { Engine } from 'claude-code/testing'
import type { On, RenderElement, RenderSurface } from 'claude-code'
const BASE_PROMPT = "[답변 섹션 표기 — neon-sections mod]\n답변이 두 부분 이상이면 아래 소제목을 이 순서로, 줄 맨 앞에 정확히 쓴다. 내용이 없는 섹션은 쓰지 않는다.\n### 결론\n### 근거\n### 확인 필요\n### 다음 단계\n- 작업 결과를 보고하는 답이면 결론 소제목 뒤에 상태를 붙인다: \"### 결론 · 완료\", \"### 결론 · 대기\", \"### 결론 · 막힘\". 질문에 답하는 경우처럼 상태가 없는 답에는 붙이지 않는다.\n- 결론은 한두 문장으로 쓴다.\n- 근거의 핵심 문장은 **굵게** 쓴다. 문장 하나를 통째로 강조할 때만 그 목록 항목이나 문단 전체를 <u>와 </u>로 감싼다.\n- 확인 필요에는 사용자가 답하거나 정해야 하는 것만 쓴다.\n- 한두 문장으로 끝나는 짧은 답과 도구 호출 사이의 진행 상황 문장에는 소제목을 쓰지 않는다.\n- 다른 규칙이나 스킬이 출력 형식을 정했으면 이 소제목을 쓰지 않고 그 형식을 따른다."
const NEXT_RULE = '- 다음 단계는 할 일을 줄 맨 앞 번호(1. 2.)로 쓴다. 한 번호 안에 할 일이 둘 이상이면 1-1. 1-2.로 나눈다. 항목에 딸린 문장과 코드 블록은 번호 뒤 글자 시작 위치만큼 들여 써서 그 항목 안에 둔다.'
const PROMPT = BASE_PROMPT.replace('- 확인 필요에는 사용자가 답하거나 정해야 하는 것만 쓴다.\n', '- 확인 필요에는 사용자가 답하거나 정해야 하는 것만 쓴다.\n' + NEXT_RULE + '\n')
import { PROMPT as ACTUAL_PROMPT } from '../hooks/prompt'
import { wrapCode } from '../hooks/code-box'
import { defaults, parse, record } from '../hooks/sections'
import type { Prismantis } from '../types/index'

declare module 'claude-code' {
  interface EngineInterface {
    prismantis: Prismantis<RenderSurface, RenderElement>;
  }
}

const plugin = 'neon-sections'
const all = '### 결론 · 완료\n완료했습니다.\n### 근거\n**검증됨**\n### 확인 필요\n선택해 주세요.\n### 다음 단계\n1. 검토합니다.'
const viewport = { columns: 100, rows: 40, isFullscreen: true }
const compose = { model: 'test', promptModel: 'test', surfaces: [], tools: [], outputStyle: null, traits: [] }

function elements(tree: RenderElement): RenderElement[] {
  return [tree, ...('children' in tree ? (tree.children ?? []).flatMap(child =>
    typeof child === 'string' ? [] : elements(child)) : [])]
}

function setConfig($: Engine, key: string, value: string | boolean) {
  return $.config.set({ key, value, previous: false,
    provider: { plugin: 'engine', tier: 'core' }, origin: { kind: 'composer' } })
}

function command($: Engine, args: string) {
  return $.command.run({ command: 'ns-setting', args, origin: { kind: 'composer' }, presentation: viewport })
}

function setup(on: On, observed: { texts?: string[]; writes?: string[]; registered?: string[]; renders?: Record<string, number> } = {}) {
  const clock = mock.clock(on)
  on('ui.render', ($, e) => {
    if (observed.renders) {
      const id = `${e.component}:${e.requestId}`
      observed.renders[id] = (observed.renders[id] ?? 0) + 1
    }
    if (e.component === 'AssistantMessage') observed.texts?.push(e.props.text)
    return { type: 'engine', ref: 0 }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => { observed.registered?.push(e.name); return { value: { command: e.name } } })
  on('config.list', () => ({ value: [] }))
  on('config.set', ($, e) => { observed.writes?.push(e.key); return { value: e.value } })
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('prompt.compose', () => ({ sections: [{ id: 'system', text: 'original', scope: 'shared' }] }))
  on('tool.call', ($, e) => e.tool === 'WebFetch'
    ? { result: 'failed', isError: true, text: 'failed' }
    : { result: { stdout: 'ok', stderr: '', interrupted: false } })
  return clock
}

test('C3 duplicate injection is replaced without changing other sections', async ($, on) => {
  on('prompt.compose', () => ({ sections: [
    { id: 'system', text: 'original', scope: 'shared' },
    { id: 'neon-sections:format', text: 'stale', scope: 'session' },
  ] }))
  const result = await $.prompt.compose(compose)
  expect(result.sections).toEqual([{ id: 'system', text: 'original', scope: 'shared' },
    { id: 'neon-sections:format', text: PROMPT, scope: 'session' }])
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`C5 ${surface} statuses and unknown status`, async ($, on) => {
    setup(on)
    for (const [status, label, color] of [['완료', '✓ 완료', 'success'], ['대기', '… 대기', 'warning'], ['막힘', '✗ 막힘', 'error']]) {
      const ui = await mount($, surface, all.replace('완료', status!), status)
      expect((await ui.find({ type: 'Text', text: label }))?.props.color).toBe(color)
    }
    const ui = await mount($, surface, all.replace('완료', '기타'), 'unknown')
    expect(JSON.stringify(await ui.drawn())).not.toContain('기타')
  })

  test(`C6 C7 C8 ${surface} fallback, conclusion only, empty, order, fences`, async ($, on) => {
    setup(on)
    for (const text of ['안녕하세요.', '## 판정\n채택', '### 근거\n본문', '```md\n### 결론\n```']) {
      const ui = await mount($, surface, text, text)
      expect(await ui.drawn()).toMatchObject({ type: 'engine', ref: 0 })
    }
    const ui = await mount($, surface, '앞말\n### 결론\n본문\n### 결론\n추가')
    expect((await ui.findAll({ type: 'Box' })).filter(b => b.props.borderStyle)).toHaveLength(0)
    expect((await ui.findAll({ type: 'Markdown' })).map(b => b.props.text)).toEqual(['앞말', '본문\n\n추가'])
    await ui.redraw({ text: '### 다음 단계\n나중\n### 근거\n\n### 결론\n먼저\n```md\n### 확인 필요\n```', isFirstOfReply: true })
    const boxes = (await ui.findAll({ type: 'Box' })).filter(b => b.key?.startsWith('section-'))
    expect(boxes.map(b => b.props.borderColor)).toEqual(['#00D7FF', '#FF5FFF'])
    if (surface === 'desktop') expect(elements(await ui.drawn()).filter(n => n.type === 'Text' && n.props?.mono).map(drawnText)).toEqual(['### 확인 필요'])
    else expect((await ui.findAll({ type: 'Code' })).map(n => String(n.props.source).trimEnd())).toEqual(['### 확인 필요'])
  })

  test(`C9 ${surface} streaming prefixes and completed header`, async ($, on) => {
    const texts: string[] = []
    setup(on, { texts })
    await $.turn.start({ turnId: 'stream', text: 'test' })
    const ui = await mount($, surface, 'hello\n### 결')
    expect(texts.at(-1)).toBe('hello')
    await ui.redraw({ text: '### 결론\n완료\n### 근', isFirstOfReply: true })
    expect(JSON.stringify(await ui.drawn())).not.toContain('### 근')
    await ui.redraw({ text: '### 결론\n완료\n### 근거\n검증', isFirstOfReply: true })
    expect((await ui.findAll({ type: 'Box' })).filter(b => b.props.borderStyle)).toHaveLength(2)
    await complete($, 'stream')
    await ui.redraw({ text: '완료된 답\n### 결', isFirstOfReply: true })
    expect(texts.at(-1)).toBe('완료된 답\n### 결')
  })

  test(`C10 ${surface} markdown, full underline, inline tags, diff preservation`, async ($, on) => {
    setup(on)
    const diff = '```diff\n@@ -1 +1 @@\n-old\n+new\n```'
    const ui = await mount($, surface, '### 결론\n끝\n### 근거\n**굵게**\n\n- <u>전체 **강조**</u>\n\n부분 <u>단어</u>\n\n' + diff)
    expect(await ui.find({ type: 'Markdown', text: '**굵게**' })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: '전체 ' }))?.props.underline).toBe(true)
    expect((await ui.findAll({ type: 'Text', text: '강조' })).some(e => e.props.bold)).toBe(true)
    if (surface === 'desktop') expect(elements(await ui.drawn()).filter(n => n.type === 'Text' && n.props?.mono).map(drawnText).join('\n')).toBe('@@ -1 +1 @@\n-old\n+new')
    else expect((await ui.findAll({ type: 'Code' })).map(n => String(n.props.source).trimEnd()).join('\n')).toBe('@@ -1 +1 @@\n-old\n+new')
    expect((await ui.findAll({ type: 'Code' })).every(n => n.props.language === 'diff')).toBe(true)
    expect(await ui.find({ type: 'Markdown', text: diff })).toBeUndefined()
    expect(JSON.stringify(await ui.drawn())).not.toContain('<u>')
  })

  test(`C11 C13 ${surface} tool sites folded and expanded group passed through`, async ($, on) => {
    setup(on)
    await toolsTurn($)
    const props = { tool_use_id: 'tool-1', tool: 'Bash', input: { command: 'pwd' }, isRunning: false, isErrored: false, isInterrupted: false }
    const use = await $.ui.mount({ plugin, surface, viewport, requestId: 'tool-1', component: 'ToolUse', props })
    const result = await $.ui.mount({ plugin, surface, viewport, requestId: 'tool-1', component: 'ToolResult',
      props: { tool_use_id: 'tool-1', tool: 'Bash', output: {}, isErrored: false } })
    const group = await $.ui.mount({ plugin, surface, viewport, requestId: 'group', component: 'ToolGroup',
      props: { calls: [props], isActive: false, isExpanded: false } })
    expect(await use.drawn()).toMatchObject({ type: 'Box' })
    expect(await result.drawn()).toMatchObject({ type: 'Box' })
    expect(await group.drawn()).toMatchObject({ type: 'Box' })
    await group.redraw({ calls: [props], isActive: false, isExpanded: true })
    expect(await group.drawn()).toMatchObject({ type: 'engine' })
  })

  test(`C18 C20 ${surface} glow and hover exclude evidence`, { options: { conclusionGlow: true, attentionGlow: true, nextGlow: true, conclusionHover: true, attentionHover: true, nextHover: true } }, async ($, on) => {
    setup(on)
    const ui = await mount($, surface)
    const boxes = (await ui.findAll({ type: 'Box' })).filter(b => b.props.borderStyle)
    expect(boxes).toHaveLength(7)
    expect(boxes.filter(b => ['#005F87', '#875F00', '#875F87'].includes(String(b.props.borderColor)))).toHaveLength(3)
    const raw = elements(await ui.drawn()).filter(e => e.type === 'Box')
    expect(raw.filter(e => e.hover)).toHaveLength(3)
    expect(raw.find(e => e.props?.key === 'section-rationale')?.hover).toBeUndefined()
    expect(raw.find(e => e.props?.key === 'section-conclusion')?.hover).toEqual({ borderStyle: 'bold', borderColor: '#59e5ff', borderDimColor: false })
  })

  test(`C22 ${surface} off on, tools and prompt unchanged`, async ($, on) => {
    setup(on)
    await toolsTurn($)
    const ui = await mount($, surface)
    await command($, 'off')
    expect(await ui.drawn()).toMatchObject({ type: 'engine' })
    expect(await ui.find({ type: 'Button' })).toBeUndefined()
    expect((await $.prompt.compose(compose)).sections.at(-1)?.text).toBe(PROMPT)
    const use = await $.ui.mount({ plugin, surface, viewport, requestId: 'tool-1', component: 'ToolResult',
      props: { tool_use_id: 'tool-1', tool: 'Bash', output: {}, isErrored: false } })
    expect(await use.drawn()).toMatchObject({ type: 'engine' })
    await command($, 'on')
    expect(await ui.find({ key: 'section-conclusion' })).toBeDefined()
    expect((await $.prompt.compose(compose)).sections.at(-1)?.text).toBe(PROMPT)
  })

  test(`C23 ${surface} unclosed fence, large text, headings only`, async ($, on) => {
    setup(on)
    for (const [i, text] of ['### 결론\n```\n### 근거\nunclosed', '### 결론\n' + 'a'.repeat(100000), '### 결론\n### 근거\n'].entries()) {
      const ui = await mount($, surface, text, String(i))
      expect((await ui.drawn()).type).toBe('Box')
    }
  })
}

test('C14 pure record stable counts, consecutive errors and trailing failure', () => {
  expect(record([])).toBe('')
  expect(record([
    { kind: 'tool', id: '1', name: 'B', summary: '', failed: true },
    { kind: 'tool', id: '2', name: 'A', summary: '', failed: true },
  ])).toBe('도구 2회 · B 1 · A 1 · 실패 2: B ✗ → A, A ✗')
  expect(record([{ kind: 'tool', id: '1', name: 'B', summary: '', failed: false }])).toBe('도구 1회 · B 1')
})

test('C14 no tools gives no process; tools-only turn remains native', async ($, on) => {
  setup(on)
  const ui = await mount($, 'desktop')
  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  await $.turn.start({ turnId: 'tools-only', text: 'test' })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'tool-only', command: 'pwd' })
  await complete($, 'tools-only', '')
  const tool = await $.ui.mount({ plugin, surface: 'desktop', component: 'ToolResult', requestId: 'tool-only',
    props: { tool_use_id: 'tool-only', tool: 'Bash', output: {}, isErrored: false } })
  expect(await tool.drawn()).toMatchObject({ type: 'engine' })
})

test('C14 tool-ended turn attaches to last text', async ($, on) => {
  setup(on)
  await $.turn.start({ turnId: 'tool-ended', text: 'test' })
  await append($, 'last', '실행합니다.')
  await $.tool.call({ tool: 'Bash', tool_use_id: 'tool', command: 'pwd' })
  await complete($, 'tool-ended', '')
  const ui = await mount($, 'desktop', '실행합니다.', 'last')
  expect((await ui.find({ type: 'Button' }))?.props.label).toBe('▸ 작업 과정 · 도구 1회 · 진행 문장 1개')
})

test('C16 command changes configuration and rejects invalid inputs without writes', async ($, on) => {
  const writes: string[] = []
  setup(on, { writes })
  expect((await command($, 'color 결론 #00FF88')).text).toBe('conclusionColorDark: #00FF88')
  for (const args of ['color 근거 #00FF88', 'color 결론 00FF88', 'color 결론 #12345', 'color 결론 red', 'effect unknown on']) {
    expect((await command($, args)).text).toContain('거부:')
  }
  expect(writes).toEqual(['neon-sections.conclusionColorDark'])
  const ui = await mount($, 'desktop')
  expect((await ui.find({ key: 'section-conclusion' }))?.props.borderColor).toBe('#00FF88')
  expect((await command($, 'status')).text).toContain('conclusionBlink: false')
})

test('C19 latest redraws previous final answer', { options: { conclusionLatestOnly: true, attentionLatestOnly: true, nextLatestOnly: true } }, async ($, on) => {
  setup(on)
  await $.turn.start({ turnId: 'one', text: 'test' })
  await append($, 'one-answer', all)
  await complete($, 'one')
  const first = await mount($, 'desktop', all, 'one-answer')
  expect((await first.find({ key: 'section-conclusion' }))?.props.borderDimColor).toBeUndefined()
  await $.turn.start({ turnId: 'two', text: 'test' })
  await append($, 'two-answer', all)
  await complete($, 'two')
  const second = await mount($, 'desktop', all, 'two-answer')
  expect((await first.find({ key: 'section-conclusion' }))?.props.borderDimColor).toBe(true)
  expect((await second.find({ key: 'section-conclusion' }))?.props.borderDimColor).toBeUndefined()
  expect((await first.find({ key: 'section-rationale' }))?.props.borderDimColor).toBeUndefined()
})

test('C23 exception falls back to engine drawing', async ($, on) => {
  setup(on)
  on('state.get', { plugin, key: 'session' }, () => ({ value: null as never, version: 1 }))
  const ui = await mount($, 'desktop')
  expect(await ui.drawn()).toMatchObject({ type: 'engine' })
})

test('C8 parser preserves long and unclosed fences', () => {
  const parsed = parse('### 결론\n앞\n````md\n```\n### 근거\n````\n### 다음 단계\n끝', false)
  expect(parsed.sections.rationale).toBeUndefined()
  expect(parsed.sections.conclusion).toContain('### 근거')
  expect(parsed.sections.next).toBe('끝')
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`C15 ${surface} six custom colors and fixed evidence`, { options: {
    conclusionColorDark: '#112233', attentionColorDark: '#223344', nextColorDark: '#334455',
    conclusionColorLight: '#445566', attentionColorLight: '#556677', nextColorLight: '#667788',
  } }, async ($, on) => {
    setup(on)
    const ui = await mount($, surface)
    expect((await ui.findAll({ type: 'Box' })).filter(b => b.props.borderStyle).map(b => b.props.borderColor))
      .toEqual(['#112233', '#626262', '#223344', '#334455'])
    await setConfig($, 'theme', 'light')
    expect((await ui.findAll({ type: 'Box' })).filter(b => b.props.borderStyle).map(b => b.props.borderColor))
      .toEqual(['#445566', '#949494', '#556677', '#667788'])
    for (const [name, color] of [['결론', '#445566'], ['확인 필요', '#556677'], ['다음 단계', '#667788']]) {
      expect((await ui.find({ type: 'Text', text: new RegExp(`^${name}$`) }))?.props.color).toBe(color)
    }
    expect((await ui.find({ type: 'Text', text: /^1\. / }))?.props.color).toBe('#667788')
  })

  test(`C15 ${surface} invalid colors fall back and light titles darken`, { options: {
    conclusionColorDark: '#12345', attentionColorDark: 'red', nextColorDark: '',
    conclusionColorLight: '#12345', attentionColorLight: 'red', nextColorLight: '',
  } }, async ($, on) => {
    setup(on)
    const ui = await mount($, surface)
    expect((await ui.find({ key: 'section-conclusion' }))?.props.borderColor).toBe(defaults.conclusionColorDark)
    expect((await ui.find({ key: 'section-attention' }))?.props.borderColor).toBe(defaults.attentionColorDark)
    expect((await ui.find({ key: 'section-next' }))?.props.borderColor).toBe(defaults.nextColorDark)
    await setConfig($, 'theme', 'light')
    expect((await ui.find({ key: 'section-conclusion' }))?.props.borderColor).toBe('#0087AF')
    expect((await ui.find({ type: 'Text', text: /^결론$/ }))?.props.color).toBe('#005F87')
    expect((await ui.find({ type: 'Text', text: /^확인 필요$/ }))?.props.color).toBe('#875F00')
    expect((await ui.find({ type: 'Text', text: /^다음 단계$/ }))?.props.color).toBe('#AF00AF')
  })

  test(`C21 ${surface} pulse ends, breathing stops on prompt, >=250ms ticks`, { options: { conclusionBlink: true, attentionBreathe: true } }, async ($, on) => {
    const periods: number[] = []
    on('clock.every', { ms: 250 }, ($, e, next) => { periods.push(e.ms); return next(e) })
    const clock = setup(on)
    await $.turn.start({ turnId: 'one', text: 'test' })
    await append($, 'answer', all)
    await complete($, 'one')
    const ui = await mount($, surface)
    expect((await ui.find({ key: 'section-conclusion' }))?.props.borderColor).toBe('#00d7ff')
    await clock.advance(500)
    expect((await ui.find({ key: 'section-conclusion' }))?.props.borderColor).toBe('#99efff')
    await clock.advance(500)
    expect((await ui.find({ key: 'section-conclusion' }))?.props.borderColor).toBe('#00D7FF')
    expect((await ui.find({ key: 'section-attention' }))?.props.borderColor).toBe('#ffe559')
    expect(periods.length).toBeGreaterThan(0)
    expect(periods.every(ms => ms >= 250)).toBe(true)
    await $.prompt.submit({ text: 'next', wait: false, origin: { kind: 'composer' } })
    expect((await ui.find({ key: 'section-attention' }))?.props.borderColor).toBe('#FFD700')
    const count = periods.length
    await clock.advance(3000)
    expect(periods.length).toBe(count)
  })

  test(`C21 ${surface} offscreen and disabling cancel timer`, { options: { conclusionBlink: true, attentionBreathe: true } }, async ($, on) => {
    const periods: number[] = []
    on('clock.every', { ms: 250 }, ($, e, next) => { periods.push(e.ms); return next(e) })
    const clock = setup(on)
    await $.turn.start({ turnId: 'one', text: 'test' })
    await append($, 'answer', all)
    await complete($, 'one')
    const ui = await mount($, surface)
    await clock.advance(500)
    await ui.redraw({ text: all, isFirstOfReply: true, onScreen: null })
    expect((await ui.find({ key: 'section-attention' }))?.props.borderColor).toBe('#FFD700')
    let count = periods.length
    await clock.advance(1000)
    expect(periods.length).toBe(count)
    await ui.redraw({ text: all, isFirstOfReply: true, onScreen: { first: 0, last: 10, of: 11 } })
    await clock.advance(250)
    await command($, 'effect blink 결론 off')
    await command($, 'effect breathe 확인 필요 off')
    count = periods.length
    await clock.advance(1000)
    expect(periods.length).toBe(count)
    expect((await ui.find({ key: 'section-attention' }))?.props.borderColor).toBe('#FFD700')
  })
}

test('C13 verbose bypasses all assistant and tool customization', async ($, on) => {
  setup(on)
  await toolsTurn($)
  await setConfig($, 'verbose', true)
  const ui = await mount($, 'desktop')
  const tool = await $.ui.mount({ plugin, surface: 'desktop', component: 'ToolResult', requestId: 'tool-1',
    props: { tool_use_id: 'tool-1', tool: 'Bash', output: {}, isErrored: false } })
  expect(await ui.drawn()).toMatchObject({ type: 'engine' })
  expect(await tool.drawn()).toMatchObject({ type: 'engine' })
})

test('C13 isExpanded when supplied bypasses assistant, tool use and result', async ($, on) => {
  setup(on)
  await toolsTurn($)
  const assistant = { text: all, isFirstOfReply: true, isExpanded: true }
  const tool = { tool_use_id: 'tool-1', tool: 'Bash', input: {}, isRunning: false, isErrored: false, isInterrupted: false, isExpanded: true }
  const result = { tool_use_id: 'tool-1', tool: 'Bash', output: {}, isErrored: false, isExpanded: true }
  for (const surface of ['terminal', 'desktop'] as const) {
    const a = await $.ui.mount({ plugin, surface, component: 'AssistantMessage', requestId: 'answer', props: assistant })
    const b = await $.ui.mount({ plugin, surface, component: 'ToolUse', requestId: 'tool-1', props: tool })
    const c = await $.ui.mount({ plugin, surface, component: 'ToolResult', requestId: 'tool-1', props: result })
    expect(await a.drawn()).toMatchObject({ type: 'engine' })
    expect(await b.drawn()).toMatchObject({ type: 'engine' })
    expect(await c.drawn()).toMatchObject({ type: 'engine' })
  }
})

test('C7 empty section stays hidden even when its streaming heading completes', async ($, on) => {
  setup(on)
  await $.turn.start({ turnId: 'stream', text: 'test' })
  const ui = await mount($, 'desktop', '### 결론\n결과\n### 근거\n')
  expect(await ui.find({ key: 'section-rationale' })).toBeUndefined()
  await ui.redraw({ text: '### 결론\n결과\n### 근거\n본문', isFirstOfReply: true })
  expect(await ui.find({ key: 'section-rationale' })).toBeDefined()
})

test('session start registers ns-setting without touching stored responses', async ($, on) => {
  setup(on)
  const rows = mock.session(on)
  await $.session.start({ cwd: '/test', surface: 'terminal', isInteractive: true })
  await $.turn.start({ turnId: 'one', text: 'test' })
  await append($, 'answer', all)
  await mount($, 'desktop')
  expect(rows.appended().at(-1)?.message.content).toEqual([{ type: 'text', text: all }])
})

test('C17 default effects schedule no timers', async ($, on) => {
  let scheduled = 0
  on('clock.every', { ms: 250 }, ($, e, next) => { scheduled++; return next(e) })
  const clock = setup(on)
  await toolsTurn($)
  const ui = await mount($, 'desktop')
  await clock.advance(5000)
  expect(scheduled).toBe(0)
  expect(elements(await ui.drawn()).some(e => e.type === 'Box' && e.hover)).toBe(false)
})

test('C21 no pulse replay on return from offscreen; clear cancels intervals and resets session', { options: { conclusionBlink: true, attentionBreathe: true } }, async ($, on) => {
  let scheduled = 0
  on('clock.every', { ms: 250 }, ($, e, next) => { scheduled++; return next(e) })
  const clock = setup(on)
  await toolsTurn($)
  const ui = await mount($, 'desktop')
  await clock.advance(249)
  expect((await ui.find({ key: 'section-conclusion' }))?.props.borderColor).toBe('#00d7ff')
  await ui.redraw({ text: all, isFirstOfReply: true, onScreen: null })
  await clock.advance(5000)
  await ui.redraw({ text: all, isFirstOfReply: true, onScreen: { first: 0, last: 10, of: 11 } })
  expect((await ui.find({ key: 'section-conclusion' }))?.props.borderColor).toBe('#00D7FF')
  await command($, 'off')
  await $.session.end({ reason: 'clear', sessionId: 'session', resume: { id: 'session' } })
  const count = scheduled
  await clock.advance(5000)
  expect(scheduled).toBe(count)
  expect((await command($, 'status')).text).toContain('답변 섹션 on')
})

test('C16 light colors, all effect commands and refusal preserve settings', async ($, on) => {
  on('config.set', { key: 'neon-sections.conclusionColorDark' }, () => ({ deny: 'locked' }))
  setup(on)
  expect((await command($, 'color 결론 #000000')).text).toBe('거부: locked')
  expect((await command($, 'status')).text).toContain('conclusionColorDark: #00D7FF')
  for (const [name, key] of [['확인 필요', 'attentionColorLight'], ['다음 단계', 'nextColorLight']]) {
    expect((await command($, `color ${name} #AABBCC light`)).text).toBe(`${key}: #AABBCC`)
  }
  for (const [effect, key] of [['glow', 'conclusionGlow'], ['latest', 'conclusionLatestOnly'], ['hover', 'conclusionHover'], ['blink', 'conclusionBlink'], ['breathe', 'conclusionBreathe']]) {
    expect((await command($, `effect ${effect} 결론 on`)).text).toBe(`${key}: true`)
    expect((await command($, `effect ${effect} 결론 off`)).text).toBe(`${key}: false`)
  }
})

test('C14 no-progress count omitted and concurrent results keep call order', async ($, on) => {
  const clock = mock.clock(on)
  on('tool.call', { tool: 'Bash' }, async () => {
    await clock.sleep(500)
    return { result: { stdout: '', stderr: '', interrupted: false } }
  })
  on('ui.render', () => ({ type: 'engine', ref: 0 }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('tool.call', { tool: 'WebFetch' }, () => ({ deny: 'refused' }))
  await $.turn.start({ turnId: 'one', text: 'test' })
  const first = $.tool.call({ tool: 'Bash', tool_use_id: 'a', command: 'pwd' })
  await clock.settle()
  await $.tool.call({ tool: 'WebFetch', tool_use_id: 'b', url: 'test', prompt: 'read' })
  await clock.advance(500)
  await first
  await append($, 'answer', all)
  await complete($, 'one')
  const ui = await mount($, 'desktop')
  expect((await ui.find({ type: 'Button' }))?.props.label).toBe('▸ 작업 과정 · 도구 2회')
  expect(await ui.find({ type: 'Text', text: '도구 2회 · Bash 1 · WebFetch 1 · 실패 1: WebFetch ✗' })).toBeDefined()
})

function mount<P extends RenderSurface>($: Engine, surface: P, text = all, requestId = 'answer') {
  return $.ui.mount({ plugin, surface, component: 'AssistantMessage', requestId, viewport,
    props: { text, isFirstOfReply: true, onScreen: { first: 0, last: 20, of: 21 } } })
}

async function append($: Engine, uuid: string, text: string) {
  await $.session.append({ uuid, door: 'response', origin: { kind: 'model', model: 'test' },
    message: { type: 'assistant', role: 'assistant', content: [{ type: 'text', text }] } })
}

async function complete($: Engine, turnId: string, answer = all) {
  await $.turn.complete({ turnId, answer, durationMs: 10, isAborted: false, reason: 'answer' })
}

async function toolsTurn($: Engine) {
  await $.turn.start({ turnId: 'turn-1', text: 'test' })
  await append($, 'progress-1', '첫 진행')
  await $.tool.call({ tool: 'Bash', tool_use_id: 'tool-1', command: 'pwd' })
  await append($, 'progress-2', '둘째 진행')
  await $.tool.call({ tool: 'WebFetch', tool_use_id: 'tool-2', url: 'test', prompt: 'read' })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'tool-3', command: 'ls' })
  await append($, 'answer', all)
  await complete($, 'turn-1')
}

for (const terminalViewport of [{ ...viewport, isFullscreen: false }, undefined]) {
  test(`C27 terminal ${terminalViewport ? 'scrollback' : 'no viewport'} preserves native history; desktop folds`, async ($, on) => {
    setup(on)
    await toolsTurn($)
    for (const surface of ['terminal', 'desktop'] as const) {
      const target = { plugin, surface, viewport: terminalViewport }
      for (const [requestId, text] of [['progress-1', '첫 진행'], ['progress-2', '둘째 진행']] as const) {
        const ui = await $.ui.mount({ ...target, requestId, component: 'AssistantMessage',
          props: { text, isFirstOfReply: true } })
        expect(await ui.drawn()).toMatchObject(surface === 'terminal' ? { type: 'engine', ref: 0 } : { type: 'Box' })
      }
      for (const [id, tool] of [['tool-1', 'Bash'], ['tool-2', 'WebFetch'], ['tool-3', 'Bash']] as const) {
        const props = { tool_use_id: id, tool, input: {}, isRunning: false, isErrored: false, isInterrupted: false }
        const use = await $.ui.mount({ ...target, requestId: id, component: 'ToolUse', props })
        const result = await $.ui.mount({ ...target, requestId: id, component: 'ToolResult',
          props: { tool_use_id: id, tool, output: {}, isErrored: false } })
        const group = await $.ui.mount({ ...target, requestId: `group-${id}`, component: 'ToolGroup',
          props: { calls: [props], isActive: false, isExpanded: false } })
        for (const ui of [use, result, group]) {
          expect(await ui.drawn()).toMatchObject(surface === 'terminal' ? { type: 'engine', ref: 0 } : { type: 'Box' })
        }
      }
      const ui = await $.ui.mount({ ...target, requestId: 'answer', component: 'AssistantMessage',
        props: { text: all, isFirstOfReply: true } })
      expect((await ui.findAll({ type: 'Box' })).filter(b => b.props.borderStyle).length).toBe(4)
      expect(await ui.find({ type: 'Text', text: '도구 3회 · Bash 2 · WebFetch 1 · 실패 1: WebFetch ✗ → Bash' })).toBeDefined()
      if (surface === 'terminal') expect(await ui.find({ type: 'Button' })).toBeUndefined()
      else expect((await ui.find({ type: 'Button' }))?.props.label).toBe('▸ 작업 과정 · 도구 3회 · 진행 문장 2개')
    }
  })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`C28 ${surface} breathing does not redraw unrelated native sites for two seconds`, { options: { conclusionBlink: true, attentionBreathe: true } }, async ($, on) => {
    const renders: Record<string, number> = {}
    const clock = setup(on, { renders })
    await $.turn.start({ turnId: 'one', text: 'test' })
    await append($, 'answer', all)
    await complete($, 'one')
    const animated = await mount($, surface)
    const plain = await mount($, surface, '별도 짧은 답변', 'plain')
    const tool = await $.ui.mount({ plugin, surface, viewport, requestId: 'unrelated-tool', component: 'ToolResult',
      props: { tool_use_id: 'unrelated-tool', tool: 'Bash', output: {}, isErrored: false } })
    expect(await plain.drawn()).toEqual({ type: 'engine', ref: 0 })
    expect(await tool.drawn()).toEqual({ type: 'engine', ref: 0 })
    const before = { ...renders }
    expect(before['AssistantMessage:plain']).toBeGreaterThan(0)
    expect(before['ToolResult:unrelated-tool']).toBeGreaterThan(0)
    await clock.advance(1000)
    expect((await animated.find({ key: 'section-attention' }))?.props.borderColor).toBe('#ffe559')
    await clock.advance(1000)
    expect((await animated.find({ key: 'section-attention' }))?.props.borderColor).toBe('#ffd700')
    await plain.drawn()
    await tool.drawn()
    expect(renders).toEqual(before)
  })
}

test('C3 prompt exact, last and session scoped', async ($, on) => {
  setup(on)
  const result = await $.prompt.compose({ model: 'test', promptModel: 'test', surfaces: [], tools: [], outputStyle: null, traits: [] })
  expect(result.sections).toEqual([{ id: 'system', text: 'original', scope: 'shared' },
    { id: 'neon-sections:format', text: PROMPT, scope: 'session' }])
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`C4 C17 ${surface} four boxes default order/colors and no effects`, async ($, on) => {
    setup(on)
    const ui = await mount($, surface)
    const boxes = (await ui.findAll({ type: 'Box' })).filter(b => b.props.borderStyle)
    expect(boxes.map(b => b.props.borderColor)).toEqual(['#00D7FF', '#626262', '#FFD700', '#FF5FFF'])
    expect(boxes.every(b => !b.props.hover && !b.props.borderDimColor)).toBe(true)
    expect(JSON.stringify(await ui.drawn())).not.toContain('###')
    expect(await ui.find({ type: 'Text', text: '✓ 완료' })).toBeDefined()
  })

  test(`C11 C12 C14 ${surface} collapse, press, history and summary`, async ($, on) => {
    setup(on)
    await toolsTurn($)
    const ui = await mount($, surface)
    expect((await ui.find({ type: 'Button' }))?.props.label).toBe('▸ 작업 과정 · 도구 3회 · 진행 문장 2개')
    expect(await ui.find({ type: 'Text', text: '도구 3회 · Bash 2 · WebFetch 1 · 실패 1: WebFetch ✗ → Bash' })).toBeDefined()
    const progress = await mount($, surface, '첫 진행', 'progress-1')
    expect(await progress.drawn()).toMatchObject({ type: 'Box' })
    expect((await progress.drawn() as { children?: unknown }).children).toBeUndefined()
    await ui.press({ key: 'process-turn-1' })
    expect((await ui.find({ type: 'Button' }))?.props.label).toBe('▾ 작업 과정 · 도구 3회 · 진행 문장 2개')
    expect(await ui.find({ type: 'Text', text: '첫 진행' })).toBeDefined()
    await ui.press({ key: 'process-turn-1' })
    expect(await ui.find({ type: 'Text', text: '첫 진행' })).toBeUndefined()
  })
}

import { palettes, contrastOnWhite, titleColor, glowColor, approximation } from '../hooks/colors'
import { editable, effects } from '../hooks/effects'
import type { PaneOpenArgs, JsonValue } from 'claude-code'

const paneId = 'neon-sections-settings'
function pane($: Engine, surface: 'terminal' | 'desktop' = 'desktop', isFullscreen = true, bodyColumns = 58) {
  return $.ui.mount({ plugin, surface, component: 'Pane', requestId: paneId,
    viewport: { ...viewport, columns: bodyColumns + 4, isFullscreen },
    props: { title: '답변 섹션 설정', isFocused: true, bodyColumns,
      placement: isFullscreen ? 'dock' : 'inline', scroll: { offset: 0, bodyRows: 70 }, view: {} } })
}

function effectValues(status: string | undefined) {
  return Object.fromEntries((status ?? '').split('\n').slice(1).map(line => line.split(': ')))
}

test('S4 S24 ns-setting alone opens one pane address, status has all values, only ns-setting registers', async ($, on) => {
  const opened: PaneOpenArgs[] = [], registered: string[] = []
  setup(on, { registered })
  on('ui.open', ($, e) => { opened.push(e); return { value: { isPlaced: true } } })
  await $.session.start({ cwd: '/test', surface: 'terminal', isInteractive: true })
  expect(registered).toEqual(['ns-setting'])
  expect((await command($, '')).text).toBeUndefined()
  expect((await command($, '')).text).toBeUndefined()
  expect(opened).toEqual(Array(2).fill({ id: paneId, title: '답변 섹션 설정', focus: true, closeOnEscape: true }))
  const status = (await command($, 'status')).text
  expect(status).toContain('답변 섹션 on')
  expect(effectValues(status)).toEqual(Object.fromEntries(Object.entries(defaults).map(([k, v]) => [k, String(v)])))
})

for (const [surface, fullscreen, columns] of [['terminal', true, 58], ['terminal', false, 118], ['desktop', false, 58]] as const) {
  test(`S5 S6 S13 panel controls and layout ${surface} ${fullscreen}`, async ($, on) => {
    setup(on)
    const ui = await pane($, surface, fullscreen, columns)
    expect((await ui.find({ key: 'enabled' }))?.props.hotkey).toBe('o')
    expect((await ui.find({ key: 'theme' }))?.props.hotkey).toBe('t')
    expect(await ui.find({ type: 'Text', text: '근거 · 바꿀 수 없습니다 · 효과 없음' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Tab 다음 칸  Enter 고르기  o 표시  f 접기  t 테마  Esc 닫기' })).toBeDefined()
    for (const section of editable) {
      expect((await ui.find({ key: `colors-${section.key}` }))?.children.at(-1)).toMatchObject({ type: 'Text', children: [' '] })
      expect(await ui.find({ key: `hex-${section.key}` })).toMatchObject({ type: 'Input' })
      expect(await ui.find({ key: `reset-${section.key}` })).toMatchObject({ type: 'Button' })
      expect(await ui.find({ key: `preview-${section.key}` })).toMatchObject({ type: 'Box' })
      const rows = (await ui.findAll({ type: 'Box' })).filter(b => String(b.props.key).startsWith(`palette-row-${section.key}-`))
      expect(rows).toHaveLength(columns >= 110 ? 1 : 2)
      for (const row of rows) expect(elements(row as RenderElement).filter(e => e.type === 'Button')).toHaveLength(columns >= 110 ? 18 : 9)
      const buttons = (await ui.findAll({ type: 'Button' })).filter(b => String(b.props.key).startsWith(`palette-${section.key}-`))
      expect(buttons).toHaveLength(18)
      expect(buttons.map(b => elements(b as RenderElement).find(e => e.type === 'Text')?.props?.color)).toEqual(palettes.dark.map(p => p[1]))
      const selected = buttons.filter(b => JSON.stringify(b).includes('[██]'))
      expect(selected).toHaveLength(1)
      expect(JSON.stringify(selected[0])).toContain(defaults[`${section.key}ColorDark`])
    }
    expect((await ui.findAll({ type: 'Button', ...(surface !== 'terminal' || fullscreen ? { in: 'effects-grid' } : {}) })).filter(b => /^effect-\d-\d$/.test(String(b.props.key)))).toHaveLength(15)
    if (surface === 'terminal' && !fullscreen) expect(await ui.find({ type: 'Client' })).toBeUndefined()
    else expect(await ui.find({ type: 'Client' })).toBeDefined()
    await ui.press({ key: 'theme' })
    for (const section of editable) {
      const buttons = (await ui.findAll({ type: 'Button' })).filter(b => String(b.props.key).startsWith(`palette-${section.key}-`))
      expect(buttons.map(b => elements(b as RenderElement).find(e => e.type === 'Text')?.props?.color)).toEqual(palettes.light.map(p => p[1]))
    }
  })
}

test('S7 S8 S9 S18 S20 palette, hex, reset and enabled persist immediately without touching other values', async ($, on) => {
  const writes: string[] = []
  setup(on, { writes })
  const ui = await pane($), answer = await mount($, 'desktop')
  await ui.press({ key: 'palette-conclusion-4' })
  expect(writes).toEqual(['neon-sections.conclusionColorDark'])
  expect((await answer.find({ key: 'section-conclusion' }))?.props.borderColor).toBe('#00FF87')
  await ui.input({ key: 'hex-conclusion', text: '#5f87ff' })
  expect((await answer.find({ key: 'section-conclusion' }))?.props.borderColor).toBe('#5f87ff')
  const before = writes.length
  for (const text of ['5F87FF', '#12345', 'red']) {
    await ui.input({ key: 'hex-conclusion', text })
    expect(await ui.find({ type: 'Text', text: '색 오류:' })).toBeDefined()
  }
  expect(writes).toHaveLength(before)
  expect((await ui.find({ key: 'colors-attention' }))?.children.at(-1)).toMatchObject({ type: 'Text', children: [' '] })
  expect((await ui.find({ key: 'colors-next' }))?.children.at(-1)).toMatchObject({ type: 'Text', children: [' '] })
  await ui.input({ key: 'hex-conclusion', text: '#00D8FF' })
  expect((await command($, 'status')).text).toContain('conclusionColorDark: #00D8FF')
  expect(await ui.find({ type: 'Text', text: '256색 화면에서는 #00D7FF(45)로 보임' })).toBeDefined()
  await ui.press({ key: 'theme' })
  expect((await ui.find({ key: 'colors-conclusion' }))?.props.backgroundColor).toBe('#FFFFFF')
  expect((await ui.find({ key: 'previews' }))?.props.backgroundColor).toBe('#FFFFFF')
  await ui.press({ key: 'palette-conclusion-4' })
  expect(writes.at(-1)).toBe('neon-sections.conclusionColorLight')
  expect((await command($, 'status')).text).toContain('conclusionColorLight: #00875F')
  const settingsBefore = effectValues((await command($, 'status')).text)
  await ui.press({ key: 'reset-conclusion' })
  expect(effectValues((await command($, 'status')).text)).toEqual({ ...settingsBefore, conclusionColorLight: '#0087AF' })
  await ui.press({ key: 'enabled' })
  expect(await answer.drawn()).toMatchObject({ type: 'engine' })
  expect((await ui.find({ key: 'enabled' }))?.props.label).toBe('[ ] 답변 섹션 표시')
  await ui.press({ key: 'enabled' })
  expect(await answer.find({ key: 'section-conclusion' })).toBeDefined()
  await command($, 'off')
  expect((await ui.find({ key: 'enabled' }))?.props.label).toBe('[ ] 답변 섹션 표시')
  await command($, 'on')
  expect((await ui.find({ key: 'enabled' }))?.props.label).toBe('[✓] 답변 섹션 표시')
})

test('S6 S10 S11 palette constants, accessible titles, glow reference values and nearest 256 color', () => {
  expect(palettes.dark.map(p => p[1]).join(',')).toBe('#FF5F5F,#FF8700,#FFD700,#AFFF00,#00FF87,#00D7FF,#5F87FF,#AF5FFF,#FF5FFF,#FFAF87,#FFFF87,#87FFD7,#00AFAF,#AFD7FF,#D7AFFF,#FFAFD7,#FF0087,#EEEEEE')
  expect(palettes.light.map(p => p[1]).join(',')).toBe('#D70000,#D75F00,#AF8700,#5F8700,#00875F,#0087AF,#005FD7,#8700D7,#D700D7,#D75F5F,#AF5F00,#008787,#5F87D7,#0000AF,#875FD7,#D75FAF,#D7005F,#3A3A3A')
  expect(titleColor('#AF8700', true)).toBe('#875F00')
  expect(titleColor('#005FD7', true)).toBe('#005FD7')
  expect(contrastOnWhite(titleColor('#FFD700', true))).toBeGreaterThanOrEqual(4.5)
  expect(contrastOnWhite(titleColor('#FFFFFF', true))).toBeGreaterThanOrEqual(4.5)
  expect(titleColor('#FFD700', false)).toBe('#FFD700')
  for (const [color, light, expected] of [['#00D7FF', false, '#005F87'], ['#FF5FFF', false, '#875F87'], ['#0087AF', true, '#87D7D7'], ['#D700D7', true, '#FF87FF']] as const) expect(glowColor(color, light)).toBe(expected)
  expect(approximation('#00D8FF')).toBe('256색 화면에서는 #00D7FF(45)로 보임')
  expect(approximation('#EEEEEE')).toBe('')
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`S12 Client keyboard and button post only the selected section effect ${surface}`, async ($, on) => {
    const writes: string[] = []
    setup(on, { writes })
    const ui = await pane($, surface)
    await ui.key({ key: 'right' })
    await ui.key({ key: 'down' })
    await ui.key({ key: ' ' })
    expect(writes).toEqual(['neon-sections.attentionLatestOnly'])
    expect(effectValues((await command($, 'status')).text)).toEqual({ ...Object.fromEntries(Object.entries(defaults).map(([k, v]) => [k, String(v)])), attentionLatestOnly: 'true' })
    expect(await ui.find({ type: 'Text', text: '확인 필요에 켜 둠', in: 'effects-grid' })).toBeDefined()
    await ui.key({ key: ' ' })
    expect((await command($, 'status')).text).toContain('attentionLatestOnly: false')
    await ui.press({ key: 'effect-4-2' })
    expect((await command($, 'status')).text).toContain('nextBreathe: true')
    expect(writes.at(-1)).toBe('neon-sections.nextBreathe')
  })
}

test('S14 unsupported terminal cell preserves saved value; focus clears notice; glow works', { options: { attentionBreathe: true } }, async ($, on) => {
  const writes: string[] = []
  setup(on, { writes })
  on('ui.focus', () => ({}))
  const ui = await pane($, 'terminal', false, 118)
  expect(JSON.stringify(await ui.find({ key: 'effect-4-1' }))).toContain(' ╌ ')
  await ui.press({ key: 'effect-0-0' })
  expect(writes).toEqual(['neon-sections.conclusionGlow'])
  await ui.press({ key: 'effect-4-1' })
  expect(writes).toHaveLength(1)
  expect((await command($, 'status')).text).toContain('attentionBreathe: true')
  expect(await ui.find({ type: 'Text', text: '숨쉬기 — 이 화면에서 안 됨 · 데스크톱·전체화면에서 바꾸세요' })).toBeDefined()
  await $.ui.focus({ component: 'Pane', requestId: paneId, plugin, element: 'effect-1-0', origin: { kind: 'person' } })
  expect(await ui.find({ type: 'Text', text: '숨쉬기 — 이 화면에서 안 됨' })).toBeUndefined()
})

test('S10 S11 S15 renderer and previews share section colors, titles and glows', { options: { conclusionGlow: true, nextGlow: true, attentionHover: true } }, async ($, on) => {
  setup(on)
  const answer = await mount($, 'desktop'), ui = await pane($)
  for (const [light, conclusion, next] of [[false, '#005F87', '#875F87'], [true, '#87D7D7', '#FF87FF']] as const) {
    if (light) { await ui.press({ key: 'theme' }); await setConfig($, 'theme', 'light') }
    expect((await ui.find({ key: 'preview-glow-conclusion' }))?.props.borderColor).toBe(conclusion)
    expect((await ui.find({ key: 'preview-glow-next' }))?.props.borderColor).toBe(next)
    const borders = (await answer.findAll({ type: 'Box' })).filter(b => b.props.borderStyle)
    expect(borders).toHaveLength(6)
    expect(borders.map(b => b.props.borderColor)).toContain(conclusion)
    expect(borders.map(b => b.props.borderColor)).toContain(next)
    const raw = elements(await answer.drawn()).filter(e => e.type === 'Box')
    expect(raw.filter(e => e.hover)).toHaveLength(1)
    expect(raw.find(e => e.props?.key === 'section-attention')?.hover).toBeDefined()
    expect(await ui.find({ key: 'preview-glow-attention' })).toBeUndefined()
  }
  await ui.input({ key: 'hex-attention', text: '#FFD700' })
  expect(contrastOnWhite(String((await answer.find({ type: 'Text', text: /^확인 필요$/ }))?.props.color))).toBeGreaterThanOrEqual(4.5)
})

test('S15 latest only dims next; ordinary terminal ignores all four unsupported effects', { options: { nextLatestOnly: true, attentionHover: true, conclusionBlink: true, attentionBreathe: true } }, async ($, on) => {
  const clock = setup(on)
  await $.turn.start({ turnId: 'one', text: 'test' }); await append($, 'one-answer', all); await complete($, 'one')
  const first = await mount($, 'desktop', all, 'one-answer')
  await $.turn.start({ turnId: 'two', text: 'test' }); await append($, 'two-answer', all); await complete($, 'two')
  const plain = await $.ui.mount({ plugin, surface: 'terminal', viewport: { ...viewport, isFullscreen: false }, component: 'AssistantMessage', requestId: 'one-answer', props: { text: all, isFirstOfReply: true } })
  expect((await first.findAll({ type: 'Box' })).filter(b => b.props.borderDimColor)).toHaveLength(1)
  expect((await first.find({ key: 'section-next' }))?.props.borderDimColor).toBe(true)
  await clock.advance(500)
  expect(elements(await plain.drawn()).filter(e => e.type === 'Box').some(e => e.hover || e.props?.borderDimColor)).toBe(false)
  expect((await plain.find({ key: 'section-conclusion' }))?.props.borderColor).toBe('#00D7FF')
  expect((await plain.find({ key: 'section-attention' }))?.props.borderColor).toBe('#FFD700')
})

test('S17 legacy effects and evidence are rejected without writes; all 15 effect commands stay independent', async ($, on) => {
  const writes: string[] = []
  setup(on, { writes })
  for (const args of ['effect animate on', 'effect glow 근거 on', 'effect glow on']) {
    expect((await command($, args)).text).toContain('/ns-setting effect <glow|latest|hover|blink|breathe>')
  }
  expect(writes).toHaveLength(0)
  for (const section of editable) for (const effect of effects) {
    expect((await command($, `effect ${effect.command} ${section.name} on`)).text).toBe(`${section.key}${effect.key}: true`)
    expect(writes.at(-1)).toBe(`neon-sections.${section.key}${effect.key}`)
  }
  expect(writes).toHaveLength(15)
})

test('S19 obsolete options are ignored and only six colors plus fifteen false effects remain', { options: { effectGlow: true, effectLatestOnly: true, effectHover: true, effectAnimate: true } }, async ($, on) => {
  setup(on)
  const { foldTools, ...status } = effectValues((await command($, 'status')).text)
  expect(foldTools).toBe('true')
  expect(Object.keys(status)).toHaveLength(21)
  expect(Object.entries(status).filter(([key]) => !key.includes('Color')).every(([, value]) => value === 'false')).toBe(true)
  const ui = await mount($, 'desktop')
  expect((await ui.findAll({ type: 'Box' })).filter(b => b.props.borderStyle)).toHaveLength(4)
})

test('S21 a failed panel state read does not affect answer or tool drawings', async ($, on) => {
  setup(on)
  on('state.get', { plugin, key: 'panel' }, () => ({ value: null as never, version: 1 }))
  const ui = await pane($)
  expect(await ui.drawn()).toMatchObject({ type: 'engine' })
  expect(await (await mount($, 'desktop')).find({ key: 'section-conclusion' })).toBeDefined()
  const tool = await $.ui.mount({ plugin, surface: 'desktop', viewport, requestId: 'unrelated', component: 'ToolResult', props: { tool_use_id: 'unrelated', tool: 'Bash', output: {}, isErrored: false } })
  expect(await tool.drawn()).toMatchObject({ type: 'engine' })
})

test('panel refuses malformed client messages and shows denied config writes', async ($, on) => {
  const writes: string[] = []
  on('config.set', { key: 'neon-sections.conclusionColorDark' }, () => ({ deny: 'locked' }))
  setup(on, { writes })
  const ui = await pane($)
  const invalidMessages: JsonValue[] = [null, {}, { row: -1, column: 0, toggle: true }, { row: 0, column: 3, toggle: true }, { row: 0.5, column: 0, toggle: true }, { row: 0, column: 0, toggle: 'yes' }]
  for (const data of invalidMessages) await ui.post(data)
  expect(writes).toHaveLength(0)
  await ui.press({ key: 'palette-conclusion-4' })
  expect(await ui.find({ type: 'Text', text: '거부: locked' })).toBeDefined()
  expect((await command($, 'status')).text).toContain('conclusionColorDark: #00D7FF')
})

for (const section of editable) {
  test(`S16 ${section.key} blink and breathe each affect only that section`, async ($, on) => {
    const clock = setup(on)
    await command($, `effect blink ${section.name} on`)
    await $.turn.start({ turnId: 'one', text: 'test' }); await append($, 'answer', all); await complete($, 'one')
    const ui = await mount($, 'desktop')
    await clock.advance(500)
    for (const other of editable) {
      const color = (await ui.find({ key: `section-${other.key}` }))?.props.borderColor
      if (other.key === section.key) expect(color).not.toBe(defaults[`${other.key}ColorDark`])
      else expect(color).toBe(defaults[`${other.key}ColorDark`])
    }
    await clock.advance(500)
    expect((await ui.find({ key: `section-${section.key}` }))?.props.borderColor).toBe(defaults[`${section.key}ColorDark`])
    await command($, `effect blink ${section.name} off`)
    await command($, `effect breathe ${section.name} on`)
    const atPeak = (await ui.find({ key: `section-${section.key}` }))?.props.borderColor
    expect(atPeak).not.toBe(defaults[`${section.key}ColorDark`])
    await clock.advance(1000)
    expect(String((await ui.find({ key: `section-${section.key}` }))?.props.borderColor).toUpperCase()).toBe(defaults[`${section.key}ColorDark`])
    await clock.advance(1000)
    expect((await ui.find({ key: `section-${section.key}` }))?.props.borderColor).toBe(atPeak)
    for (const other of editable.filter(s => s.key !== section.key)) expect((await ui.find({ key: `section-${other.key}` }))?.props.borderColor).toBe(defaults[`${other.key}ColorDark`])
    await $.prompt.submit({ text: 'next', wait: false, origin: { kind: 'composer' } })
    expect((await ui.find({ key: `section-${section.key}` }))?.props.borderColor).toBe(defaults[`${section.key}ColorDark`])
  })
}

test('panel initially follows current theme, edits do not change app theme, focus describes palette', async ($, on) => {
  const writes: string[] = []
  setup(on, { writes })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.focus', () => ({}))
  await setConfig($, 'theme', 'light')
  await command($, '')
  const ui = await pane($)
  expect((await ui.find({ key: 'theme' }))?.props.label).toContain('● 라이트 테마용')
  await ui.press({ key: 'theme' })
  await $.ui.focus({ component: 'Pane', requestId: paneId, plugin, element: 'palette-conclusion-4', origin: { kind: 'person' } })
  expect(await ui.find({ type: 'Text', text: '결론 · 네온 그린 #00FF87' })).toBeDefined()
  expect(writes).toEqual(['theme'])
  const answer = await mount($, 'desktop')
  expect((await answer.find({ key: 'section-conclusion' }))?.props.borderColor).toBe('#0087AF')
  expect(contrastOnWhite('#FFFFFF')).toBe(1)
  expect(contrastOnWhite('#000000')).toBe(21)
})

for (const [surface, fullscreen, columns] of [['terminal', true, 58], ['terminal', false, 118], ['desktop', false, 58]] as const) {
  for (const appLight of [false, true]) {
    test(`S20 background only for a different editing theme: ${surface} fullscreen=${fullscreen} light=${appLight}`, async ($, on) => {
      setup(on)
      await setConfig($, 'theme', appLight ? 'light' : 'dark')
      const ui = await pane($, surface, fullscreen, columns)
      const keys = [...editable.map(section => `colors-${section.key}`), 'previews']
      for (const key of keys) expect((await ui.find({ key }))?.props.backgroundColor).toBeUndefined()
      await ui.press({ key: 'theme' })
      for (const key of keys) expect((await ui.find({ key }))?.props.backgroundColor).toBe(appLight ? '#0D0D0D' : '#FFFFFF')
      await ui.press({ key: 'theme' })
      for (const key of keys) expect((await ui.find({ key }))?.props.backgroundColor).toBeUndefined()
      await setConfig($, 'theme', appLight ? 'dark' : 'light')
      for (const key of keys) expect((await ui.find({ key }))?.props.backgroundColor).toBe(appLight ? '#FFFFFF' : '#0D0D0D')
      await ui.press({ key: 'theme' })
      for (const key of keys) expect((await ui.find({ key }))?.props.backgroundColor).toBeUndefined()
    })
  }
}

for (const surface of ['terminal', 'desktop'] as const) {
  for (const renderer of ['native', 'prismantis'] as const) {
    test(`G4 G5 ${surface} ${renderer} consecutive numbered items have one stable gap`, async ($, on) => {
      setup(on)
      const calls: string[] = []
      if (renderer === 'prismantis') {
        on('engine.create', async ($, e, next) => ({ ...await next(e), prismantis: { markdown: async () => undefined } }))
        on('prismantis.markdown', ($, e) => {
          calls.push(e.text)
          return { value: { type: 'Text', props: {}, children: [e.text] } }
        })
      }
      const ui = await mount($, surface, '### 결론\n### 다음 단계\n1. 가\n2. 나\n3. 다')
      const tree = await ui.drawn()
      const rows = elements(tree).filter(node => node.type === 'Box').filter(node => node.children?.some(child =>
        typeof child !== 'string' && child.type === 'Text' && child.props?.bold && /^\d+[.)] $/.test(child.children?.join('') ?? '')))
      expect(rows).toHaveLength(3)
      expect(rows.map(row => row.props?.marginTop)).toEqual([undefined, 1, 1])
      expect(rows.map(row => {
        const label = row.children?.[0]
        return typeof label === 'object' && label.type === 'Text' ? label.children?.join('') : undefined
      })).toEqual(['1. ', '2. ', '3. '])
      expect(rows.map(row => {
        const label = row.children?.[0]
        return typeof label === 'object' && label.type === 'Text' ? label.props?.color : undefined
      })).toEqual(['#FF5FFF', '#FF5FFF', '#FF5FFF'])
      expect(elements(tree).filter(node => node.type === 'Box' && node.props?.marginTop === 1)).toHaveLength(2)
      if (renderer === 'native') expect((await ui.findAll({ type: 'Markdown' })).map(node => node.props.text)).toEqual(['가', '나', '다'])
      else expect(calls).toEqual(['가', '나', '다'])
      for (const text of ['1. 가\n\n2. 나\n\n\n3. 다', '1. 가\n \t\n2. 나\n   \n\t\n3. 다']) {
        calls.length = 0
        await ui.redraw({ text: '### 결론\n### 다음 단계\n' + text, isFirstOfReply: true })
        expect(await ui.drawn()).toEqual(tree)
        if (renderer === 'prismantis') {
          expect(calls).toEqual(['가', '나', '다'])
          expect(await ui.findAll({ type: 'Markdown' })).toHaveLength(0)
        }
      }
    })
  }

  test(`G6 G7 G13 ${surface} continuation, single item and streaming preserve item boundaries`, async ($, on) => {
    setup(on)
    await $.turn.start({ turnId: 'gap-stream', text: 'test' })
    const ui = await mount($, surface, '### 결론\n### 다음 단계\n1. 가\n   이어짐\n2. 나')
    expect((await ui.findAll({ type: 'Markdown' })).map(node => node.props.text)).toEqual(['가\n이어짐', '나'])
    expect(elements(await ui.drawn()).filter(node => node.type === 'Box' && node.props?.marginTop === 1)).toHaveLength(1)
    await ui.redraw({ text: '### 결론\n### 다음 단계\n1. 가', isFirstOfReply: true })
    expect(elements(await ui.drawn()).filter(node => node.type === 'Box' && node.props?.marginTop)).toHaveLength(0)
    await ui.redraw({ text: '### 결론\n### 다음 단계\n1. 가\n2.', isFirstOfReply: true })
    expect(await ui.find({ key: 'section-next' })).toBeDefined()
    expect((await ui.findAll({ type: 'Markdown' })).map(node => node.props.text)).toEqual(['가', '2.'])
    expect(elements(await ui.drawn()).filter(node => node.type === 'engine')).toHaveLength(0)
    await ui.redraw({ text: '### 결론\n### 다음 단계\n1. 가\n2. 나', isFirstOfReply: true })
    expect((await ui.findAll({ type: 'Markdown' })).map(node => node.props.text)).toEqual(['가', '나'])
    expect(elements(await ui.drawn()).filter(node => node.type === 'Box' && node.props?.marginTop === 1)).toHaveLength(1)
  })

  test(`G8 ${surface} other sections keep numbered text as native Markdown`, async ($, on) => {
    setup(on)
    const ui = await mount($, surface, '### 결론\n1. 가\n2. 나\n### 근거\n1. 가\n2. 나\n### 확인 필요\n1. 가\n2. 나')
    expect((await ui.findAll({ type: 'Markdown' })).map(node => node.props.text)).toEqual(['1. 가\n2. 나', '1. 가\n2. 나', '1. 가\n2. 나'])
    expect(elements(await ui.drawn()).filter(node => node.type === 'Box' && node.props?.marginTop)).toHaveLength(0)
  })

  test(`G4 ${surface} paragraphs and fences interrupt consecutive numbering`, async ($, on) => {
    setup(on)
    for (const middle of ['설명', '```text\n2. 코드\n```', '- <u>설명</u>']) {
      const ui = await mount($, surface, `### 결론\n### 다음 단계\n1. 가\n\n${middle}\n\n2. 나`, middle)
      expect(elements(await ui.drawn()).filter(node => node.type === 'Box' && node.props?.marginTop)).toHaveLength(0)
      if (middle.startsWith('```')) {
        expect((await ui.findAll({ type: 'Markdown' })).map(node => node.props.text)).toEqual(['가', '', '', '나'])
        if (surface === 'desktop') expect(elements(await ui.drawn()).filter(n => n.type === 'Text' && n.props?.mono).map(drawnText)).toEqual(['2. 코드'])
        else expect((await ui.findAll({ type: 'Code' })).map(node => String(node.props.source).trimEnd())).toEqual(['2. 코드'])
      } else if (!middle.includes('<u>')) expect((await ui.findAll({ type: 'Markdown' })).map(node => node.props.text)).toEqual(['가', `\n${middle}\n`, '나'])
      else expect(await ui.find({ type: 'Text', text: '설명' })).toBeDefined()
    }
  })

  test(`G4 G5 ${surface} underlined numbered rows share the same gap rule`, async ($, on) => {
    setup(on)
    const ui = await mount($, surface, '### 결론\n### 다음 단계\n1. 가\n2. <u>나</u>\n3) 다')
    const tree = await ui.drawn()
    expect(elements(tree).filter(node => node.type === 'Box' && node.props?.marginTop === 1)).toHaveLength(2)
    expect(await ui.find({ type: 'Text', text: '나' })).toMatchObject({ props: { underline: true } })
    await ui.redraw({ text: '### 결론\n### 다음 단계\n1. 가\n\n2. <u>나</u>\n\n\n3) 다', isFirstOfReply: true })
    expect(await ui.drawn()).toEqual(tree)
  })

  test(`B4 ${surface} prismantis renders paragraphs and numbered bodies at content width`, async ($, on) => {
    setup(on)
    on('engine.create', async ($, e, next) => ({ ...await next(e), prismantis: { markdown: async () => undefined } }))
    const calls: { surface: RenderSurface; text: string; columns: number }[] = []
    on('prismantis.markdown', ($, e) => {
      calls.push({ ...e })
      return { value: { type: 'Text', props: { color: '#123456' }, children: [`prism:${e.text}`] } }
    })
    await setConfig($, 'neon-sections.conclusionGlow', true)
    const text = '### 결론\n본문\n### 근거\n**근거**\n\n- <u>전체 **강조**</u>\n\n뒷문단\n### 다음 단계\n12. 항목\n    계속'
    const ui = await mount($, surface, text)
    expect(calls).toEqual([
      { surface, text: '본문', columns: 90 },
      { surface, text: '**근거**\n', columns: 92 },
      { surface, text: '\n뒷문단', columns: 92 },
      { surface, text: '항목\n계속', columns: 88 },
    ])
    expect(await ui.findAll({ type: 'Markdown' })).toHaveLength(0)
    const tree = await ui.drawn()
    for (const [name, content] of [['결론', 'prism:본문'], ['근거', 'prism:**근거**'], ['다음 단계', 'prism:항목']]) {
      const box = elements(tree).filter(node => node.type === 'Box').find(node => node.props?.key === `section-${({ '결론': 'conclusion', '근거': 'rationale', '확인 필요': 'attention', '다음 단계': 'next' } as Record<string, string>)[name!]}`)
      expect(box).toBeDefined()
      expect(JSON.stringify(box)).toContain(content)
    }
    expect((await ui.find({ type: 'Text', text: '전체' }))?.props.underline).toBe(true)
    expect((await ui.find({ type: 'Text', text: '12.' }))?.props.color).toBe('#FF5FFF')
  })

  test(`B8 ${surface} fold off passes all tool sites and progress, keeps sections and effects`, async ($, on) => {
    setup(on)
    await toolsTurn($)
    const ui = await mount($, surface)
    await ui.press({ key: 'process-turn-1' })
    await setConfig($, 'neon-sections.foldTools', false)
    await setConfig($, 'neon-sections.conclusionHover', true)
    const props = { tool_use_id: 'tool-1', tool: 'Bash', input: { command: 'pwd' }, isRunning: false, isErrored: false, isInterrupted: false }
    const use = await $.ui.mount({ plugin, surface, viewport, requestId: 'tool-1', component: 'ToolUse', props })
    const result = await $.ui.mount({ plugin, surface, viewport, requestId: 'tool-1', component: 'ToolResult',
      props: { tool_use_id: 'tool-1', tool: 'Bash', output: {}, isErrored: false } })
    const group = await $.ui.mount({ plugin, surface, viewport, requestId: 'group', component: 'ToolGroup',
      props: { calls: [props], isActive: false, isExpanded: false } })
    for (const tool of [use, result, group]) expect(await tool.drawn()).toEqual({ type: 'engine', ref: 0 })
    const progress = await mount($, surface, '첫 진행', 'progress-1')
    expect(await progress.drawn()).toEqual({ type: 'engine', ref: 0 })
    const drawn = JSON.stringify(await ui.drawn())
    expect(drawn).not.toContain('작업 과정')
    expect(drawn).not.toContain('도구 3회')
    expect(drawn).not.toContain('첫 진행')
    expect(await ui.find({ key: 'section-conclusion' })).toBeDefined()
    expect(elements(await ui.drawn()).filter(node => node.type === 'Box').find(node => node.props?.key === 'section-conclusion')?.hover).toBeDefined()
    await progress.redraw({ text: all, isFirstOfReply: true })
    expect(await progress.find({ key: 'section-conclusion' })).toBeDefined()
    await ui.redraw({ text: '짧은 최종 답', isFirstOfReply: true })
    expect(await ui.drawn()).toEqual({ type: 'engine', ref: 0 })
    await setConfig($, 'neon-sections.foldTools', true)
    expect(await use.drawn()).toMatchObject({ type: 'Box' })
    expect(await ui.find({ key: 'process-turn-1' })).toBeDefined()
  })
}

for (const mode of ['undefined', 'throw', 'absent'] as const) {
  test(`B5 prismantis ${mode} preserves native paragraph and numbered Markdown`, async ($, on) => {
    setup(on)
    if (mode !== 'absent') {
      on('engine.create', async ($, e, next) => ({ ...await next(e), prismantis: { markdown: async () => {
        if (mode === 'throw') throw new Error('prismantis unavailable')
        return undefined
      } } }))
    }
    const ui = await mount($, 'desktop')
    expect((await ui.findAll({ type: 'Markdown' })).map(node => node.props.text)).toEqual([
      '완료했습니다.', '**검증됨**', '선택해 주세요.', '검토합니다.',
    ])
    expect(await ui.find({ key: 'section-conclusion' })).toBeDefined()
  })
}

test('B4 viewport width uses prismantis reply margins, unmeasured default and minimum', async ($, on) => {
  setup(on)
  on('engine.create', async ($, e, next) => ({ ...await next(e), prismantis: { markdown: async () => undefined } }))
  const columns: number[] = []
  on('prismantis.markdown', ($, e) => { columns.push(e.columns); return { value: undefined } })
  for (const size of [undefined, { ...viewport, columns: 2 }, viewport]) {
    columns.length = 0
    await $.ui.mount({ plugin, surface: 'desktop', viewport: size, component: 'AssistantMessage', requestId: String(size?.columns),
      props: { text: all, isFirstOfReply: true } })
    expect(columns).toEqual(size?.columns === 2 ? [16, 16, 16, 13] : [92, 92, 92, 89])
  }
})

test('B6 unsectioned reply delegates without prismantis calls', async ($, on) => {
  setup(on)
  on('engine.create', async ($, e, next) => ({ ...await next(e), prismantis: { markdown: async () => undefined } }))
  const texts: string[] = []
  on('prismantis.markdown', ($, e) => { texts.push(e.text); return { value: undefined } })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await mount($, surface, '일반 답변')
    expect(await ui.drawn()).toEqual({ type: 'engine', ref: 0 })
  }
  expect(texts).toHaveLength(0)
})

test('B9 fold command persists exact key and value, status reports it, invalid input does not write', async ($, on) => {
  const writes: { key: string; value: unknown }[] = []
  on('config.set', { key: 'neon-sections.foldTools' }, ($, e) => { writes.push({ key: e.key, value: e.value }); return { value: e.value } })
  setup(on)
  expect((await command($, 'status')).text).toContain('foldTools: true')
  expect((await command($, 'fold off')).text).toBe('foldTools: false')
  expect((await command($, 'status')).text).toContain('foldTools: false')
  expect((await command($, 'fold maybe')).text).toContain('/ns-setting fold <on|off>')
  expect((await command($, 'status')).text).toContain('foldTools: false')
  expect(writes).toEqual([{ key: 'neon-sections.foldTools', value: false }])
  expect((await command($, 'fold on')).text).toBe('foldTools: true')
  expect(writes).toEqual([{ key: 'neon-sections.foldTools', value: false }, { key: 'neon-sections.foldTools', value: true }])
})

for (const surface of ['desktop', 'terminal'] as const) {
  test(`B10 ${surface} fold checkbox order, hotkey, activation and immediate redraw`, async ($, on) => {
    const writes: string[] = []
    setup(on, { writes })
    const ui = await pane($, surface)
    const buttons = await ui.findAll({ type: 'Button' })
    const index = buttons.findIndex(button => button.key === 'enabled')
    expect(buttons[index + 1]?.key).toBe('foldTools')
    expect(buttons[index + 1]?.props).toMatchObject({ hotkey: 'f', label: '[✓] 도구 호출 접기' })
    expect((await ui.find({ key: 'enabled' }))?.props.hotkey).toBe('o')
    expect((await ui.find({ key: 'theme' }))?.props.hotkey).toBe('t')
    expect(await ui.find({ type: 'Text', text: 'f 접기' })).toBeDefined()
    await ui.press({ key: 'foldTools' })
    expect((await ui.find({ key: 'foldTools' }))?.props.label).toBe('[ ] 도구 호출 접기')
    expect((await command($, 'status')).text).toContain('foldTools: false')
    await ui.press({ key: 'foldTools' })
    expect((await ui.find({ key: 'foldTools' }))?.props.label).toBe('[✓] 도구 호출 접기')
    expect((await command($, 'status')).text).toContain('foldTools: true')
    expect(writes).toEqual(['neon-sections.foldTools', 'neon-sections.foldTools'])
  })
}

test('B9 B10 denied fold writes preserve state and show rejection', async ($, on) => {
  on('config.set', { key: 'neon-sections.foldTools' }, () => ({ deny: 'locked' }))
  setup(on)
  expect((await command($, 'fold off')).text).toBe('거부: locked')
  const ui = await pane($, 'terminal', false)
  await ui.press({ key: 'foldTools' })
  expect((await ui.find({ key: 'foldTools' }))?.props.label).toBe('[✓] 도구 호출 접기')
  expect(await ui.find({ type: 'Text', text: '거부: locked' })).toBeDefined()
  expect((await command($, 'status')).text).toContain('foldTools: true')
})

test('B8 saved foldTools false is honored on startup and survives unrelated config changes', { options: { foldTools: false } }, async ($, on) => {
  setup(on)
  await toolsTurn($)
  await setConfig($, 'neon-sections.conclusionColorDark', '#123456')
  const ui = await mount($, 'desktop')
  expect((await command($, 'status')).text).toContain('foldTools: false')
  expect((await ui.find({ key: 'section-conclusion' }))?.props.borderColor).toBe('#123456')
  expect(await ui.find({ key: 'process-turn-1' })).toBeUndefined()
  expect(JSON.stringify(await ui.drawn())).not.toContain('도구 3회')
  expect((await (await pane($)).find({ key: 'foldTools' }))?.props.label).toBe('[ ] 도구 호출 접기')
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`K4 K6 ${surface} subnumber rows stay on the first line`, async ($, on) => {
    setup(on)
    const ui = await mount($, surface, '### 결론\n### 다음 단계\n1-1. 가\n1-2. 나\n2. 다')
    const rows = elements(await ui.drawn()).filter(node => node.type === 'Box' &&
      node.children?.some(child => typeof child !== 'string' && child.type === 'Text' && child.props?.bold && /^\d+(?:-\d+)?[.)] +$/.test(child.children?.join('') ?? '')))
    expect(rows).toHaveLength(3)
    expect(rows.map(row => row.type === 'Box' && row.props?.alignItems)).toEqual(['flex-start', 'flex-start', 'flex-start'])
    expect(rows.map(row => row.type === 'Box' && row.props?.marginTop)).toEqual([undefined, 1, 1])
  })
}

function numberedRows(tree: RenderElement) {
  return elements(tree).filter(node => node.type === 'Box').filter(node =>
    node.children?.some(child => typeof child !== 'string' && child.type === 'Text' && child.props?.bold && /^\d+(?:-\d+)?[.)] +$/.test(child.children?.join('') ?? '')))
}
function drawnText(tree: RenderElement): string {
  return tree.type === 'Code' ? tree.props?.source ?? '' : 'children' in tree
    ? (tree.children ?? []).map(child => typeof child === 'string' ? child : drawnText(child)).join('') : ''
}
function codeMount<P extends RenderSurface>($: Engine, surface: P, source: string, width = 40, fullscreen = true, requestId = 'code') {
  return $.ui.mount({ plugin, surface, component: 'AssistantMessage', requestId,
    viewport: { ...viewport, columns: width + 8, isFullscreen: fullscreen },
    props: { text: '### 결론\n### 다음 단계\n```bash\n' + source + '\n```', isFirstOfReply: true } })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`K5 K6 ${surface} shared number width, markdown width, underline and fence exclusion`, async ($, on) => {
    setup(on)
    const calls: { text: string; columns: number }[] = []
    on('engine.create', async ($, e, next) => ({ ...await next(e), prismantis: { markdown: async () => undefined } }))
    on('prismantis.markdown', ($, e) => { calls.push(e); return { value: undefined } })
    const ui = await mount($, surface, '### 결론\n### 다음 단계\n1-1. 가\n1-2. 나\n2. 다')
    const rows = numberedRows(await ui.drawn())
    expect(rows.map(row => drawnText(row.children![0] as RenderElement))).toEqual(['1-1. ', '1-2. ', '2.   '])
    expect(rows.map(row => {
      const label = row.children![0]
      return typeof label !== 'string' && label?.type === 'Text' ? { color: label.props?.color, bold: label.props?.bold } : undefined
    })).toEqual(Array(3).fill({ color: '#FF5FFF', bold: true }))
    expect(calls.map(c => c.columns)).toEqual([87, 87, 87])
    calls.length = 0
    await ui.redraw({ text: '### 결론\n### 다음 단계\n1. 가\n2. 나', isFirstOfReply: true })
    expect(numberedRows(await ui.drawn()).map(row => drawnText(row.children![0] as RenderElement))).toEqual(['1. ', '2. '])
    expect(calls.map(c => c.columns)).toEqual([89, 89])
    await ui.redraw({ text: '### 결론\n### 다음 단계\n1-1. <u>가</u>\n1-2) <u>나</u>\n2. 다\n```\n123456. code\n```', isFirstOfReply: true })
    const underlined = numberedRows(await ui.drawn())
    expect(underlined.map(row => row.props?.alignItems)).toEqual(['flex-start', 'flex-start', 'flex-start'])
    expect(underlined.map(row => drawnText(row.children![0] as RenderElement))).toEqual(['1-1. ', '1-2) ', '2.   '])
    expect((await ui.find({ type: 'Text', text: '가' }))?.props.underline).toBe(true)
    expect((await ui.find({ type: 'Text', text: '나' }))?.props.underline).toBe(true)
  })

  test(`K7 K9 ${surface} indented fenced source stays inside its numbered item`, async ($, on) => {
    setup(on)
    const copies: { text: string; surface?: RenderSurface }[] = []
    on('ui.copy', ($, e) => { copies.push(e); return { value: { isCopied: true } } })
    for (const fence of ['```', '~~~~']) {
      const source = ' echo\t hi  \n\nnot indented\n<u>literal</u>'
      const ui = await mount($, surface, `### 결론\n### 다음 단계\n1-1. 가\n\n     ${fence}bash extra\n      echo\t hi  \n\nnot indented\n<u>literal</u>\n     ${fence}\n\n1-2. 나`, fence)
      const rows = numberedRows(await ui.drawn())
      expect(rows).toHaveLength(2)
      const isCode = (n: RenderElement) => surface === 'terminal' ? n.type === 'Code' : n.type === 'Text' && n.props?.mono === true
      expect(elements(rows[0]!).some(isCode)).toBe(true)
      expect(elements(rows[1]!).some(isCode)).toBe(false)
      expect(rows.map(row => row.props?.marginTop)).toEqual([undefined, 1])
      expect((await ui.findAll({ type: 'Code' })).every(n => n.props.language === 'bash')).toBe(true)
      if (surface === 'desktop') await ui.pointer({ in: 'copy-0', type: 'down', x: 2, y: 0, button: 'left' })
      else await ui.press({ key: 'copy-0' })
      expect(copies.at(-1)).toEqual({ text: source, surface })
    }
    expect(copies).toHaveLength(2)
  })

  test(`K8 K9 ${surface} four boxed sections split prose and code, unique copy keys`, async ($, on) => {
    setup(on)
    const calls: string[] = [], copies: string[] = []
    on('engine.create', async ($, e, next) => ({ ...await next(e), prismantis: { markdown: async () => undefined } }))
    on('prismantis.markdown', ($, e) => { calls.push(e.text); return { value: undefined } })
    on('ui.copy', ($, e) => { copies.push(e.text); return { value: { isCopied: true } } })
    const sectionNames = ['결론', '근거', '확인 필요', '다음 단계']
    const text = '```txt\npreamble\n```\n' + sectionNames.map((name, n) => `### ${name}\nbefore-${n}\n\`\`\`txt\nsource-${n}\n\`\`\`\nafter-${n}`).join('\n')
    const ui = await mount($, surface, text)
    expect(calls).toEqual(['```txt\npreamble\n```', ...sectionNames.flatMap((_, n) => [`before-${n}`, `after-${n}`])])
    const buttons = await ui.findAll({ type: surface === 'desktop' ? 'Client' : 'Button' })
    expect(buttons.map(b => b.key)).toEqual(['copy-0', 'copy-1', 'copy-2', 'copy-3'])
    for (const button of buttons) {
      if (surface === 'desktop') await ui.pointer({ in: button.key!, type: 'down', x: 2, y: 0, button: 'left' })
      else await ui.press({ key: button.key! })
    }
    expect(copies).toEqual(['source-0', 'source-1', 'source-2', 'source-3'])
    calls.length = 0
    const unboxed = await mount($, surface, '### 결론\n```txt\nunboxed\n```', 'unboxed')
    expect(calls).toEqual(['```txt\nunboxed\n```'])
    expect(await unboxed.findAll({ type: 'Code' })).toHaveLength(0)
    expect(await unboxed.findAll({ type: 'Button' })).toHaveLength(0)
  })
}

for (const surface of ['terminal'] as ('terminal' | 'desktop')[]) {
  test(`K15 K16 ${surface} copy states, exact deadlines, repeat presses and isolation`, async ($, on) => {
    const clock = setup(on)
    let result: 'success' | 'refused' | 'throw' = 'success'
    on('ui.copy', () => {
      if (result === 'throw') throw new Error('clipboard unavailable')
      return { value: result === 'success' ? { isCopied: true } : { isCopied: false, reason: 'refused' } }
    })
    const ui = await mount($, surface, '### 결론\n### 다음 단계\n```\none\n```\n```\ntwo\n```')
    const other = await codeMount($, surface, 'other', 40, true, 'other-answer')
    await ui.press({ key: 'copy-0' })
    expect((await ui.find({ key: 'copy-0' }))?.props.label).toBe('COPIED')
    expect((await ui.find({ type: 'Text', text: 'COPIED' }))?.props.color).toBe(surface === 'desktop' ? '#4EBA65' : '#5FAF5F')
    expect((await ui.find({ key: 'copy-1' }))?.props.label).toBe('[COPY]')
    expect((await other.find({ key: 'copy-0' }))?.props.label).toBe('[COPY]')
    await clock.advance(1499)
    expect((await ui.find({ key: 'copy-0' }))?.props.label).toBe('COPIED')
    await clock.advance(1)
    expect((await ui.find({ key: 'copy-0' }))?.props.label).toBe('[COPY]')
    for (const failure of ['refused', 'throw'] as const) {
      result = failure
      await ui.press({ key: 'copy-0' })
      expect((await ui.find({ key: 'copy-0' }))?.props.label).toBe('FAILED')
      expect((await ui.find({ type: 'Text', text: 'FAILED' }))?.props.color).toBe(surface === 'desktop' ? '#FF6B80' : '#FF5F87')
      const notice = await ui.find({ type: 'Text', text: '복사 실패 · 문장을 직접 선택해 복사하세요' })
      expect(notice?.props.dimColor).toBe(true)
      await clock.advance(1999)
      expect((await ui.find({ key: 'copy-0' }))?.props.label).toBe('FAILED')
      await clock.advance(1)
      expect((await ui.find({ key: 'copy-0' }))?.props.label).toBe('[COPY]')
      expect(await ui.find({ type: 'Text', text: '복사 실패 · 문장을 직접 선택해 복사하세요' })).toBeDefined()
      result = 'success'
      await ui.press({ key: 'copy-0' })
      expect(await ui.find({ type: 'Text', text: '복사 실패 · 문장을 직접 선택해 복사하세요' })).toBeUndefined()
    }
    await clock.advance(1000)
    result = 'refused'
    await ui.press({ key: 'copy-0' })
    await clock.advance(500)
    expect((await ui.find({ key: 'copy-0' }))?.props.label).toBe('FAILED')
    await clock.advance(1499)
    expect((await ui.find({ key: 'copy-0' }))?.props.label).toBe('FAILED')
    await clock.advance(1)
    expect((await ui.find({ key: 'copy-0' }))?.props.label).toBe('[COPY]')
  })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`K18 ${surface} streaming indented code acquires COPY only on closure`, async ($, on) => {
    setup(on)
    await $.turn.start({ turnId: 'stream-copy', text: 'test' })
    const text = '### 결론\n### 다음 단계\n1. 가\n   ```bash\n   echo'
    const ui = await mount($, surface, text)
    expect(await ui.findAll({ type: 'Code' })).toHaveLength(surface === 'terminal' ? 1 : 0)
    if (surface === 'desktop') expect((await ui.find({ type: 'Text', text: 'echo' }))?.props.mono).toBe(true)
    expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
    expect(elements(await ui.drawn()).some(n => n.type === 'engine')).toBe(false)
    await ui.redraw({ text: text + '\n   ```', isFirstOfReply: true })
    expect(await ui.findAll({ type: surface === 'desktop' ? 'Client' : 'Button' })).toHaveLength(1)
    expect(elements(numberedRows(await ui.drawn())[0]!).some(n =>
      surface === 'terminal' ? n.type === 'Code' : n.type === 'Text' && n.props?.mono === true)).toBe(true)
  })
}

test('K10 K13 terminal exact border text, light lines, ordinary and narrow widths', async ($, on) => {
  setup(on)
  for (const light of [false, true]) {
    if (light) await setConfig($, 'theme', 'light')
    const ui = await codeMount($, 'terminal', 'echo hi', 40, true, String(light))
    const border = light ? '#B2B2B2' : '#4E4E4E'
    const tree = await ui.drawn()
    const top = elements(tree).find(n => n.type === 'Box' && n.children?.some(c => typeof c !== 'string' && c.type === 'Text' && drawnText(c).startsWith('╭')))
    expect(drawnText(top!)).toBe('╭' + '─'.repeat(29) + ' [COPY] ─╮')
    const row = elements(tree).find(n => n.type === 'Box' && n.children?.some(c => typeof c !== 'string' && c.type === 'Text' && drawnText(c) === '│ '))
    expect(drawnText(row!)).toBe('│ ' + 'echo hi'.padEnd(36) + ' │')
    expect((await ui.find({ type: 'Text', text: '╰' + '─'.repeat(38) + '╯' }))?.props.color).toBe(border)
    expect((await ui.find({ type: 'Text', text: '│ ' }))?.props.color).toBe(border)
    expect((await ui.find({ type: 'Text', text: '╭' }))?.props.color).toBe(border)
  }
  for (const [width, fullscreen] of [[40, false], [12, true], [13, true]] as const) {
    // A viewport has a 20-column floor; an 8-character marker gives W=12 at 28 columns.
    const ui = width === 12 ? await $.ui.mount({ plugin, surface: 'terminal', component: 'AssistantMessage', requestId: 'narrow', viewport: { ...viewport, columns: 28 },
      props: { text: '### 결론\n### 다음 단계\n123456. 가\n        ```\n        x\n        ```', isFirstOfReply: true } }) : await codeMount($, 'terminal', 'x', width, fullscreen, String(width))
    expect(await ui.findAll({ type: 'Button' })).toHaveLength(width === 13 ? 1 : 0)
    if (width !== 13) expect(await ui.find({ type: 'Text', text: '╭' + '─'.repeat(width - 2) + '╮' })).toBeDefined()
  }
  const tiny = await mount($, 'terminal', '### 결론\n### 다음 단계\n' + '1'.repeat(87) + '. 가\n  ```\n  x\n  ```', 'tiny')
  expect(await tiny.findAll({ type: 'Code' })).toHaveLength(0)
  expect(await tiny.find({ type: 'Markdown', text: '```\nx\n```' })).toBeDefined()
})

test('K11 K12 terminal wraps cells and whitespace without altering copied source', async ($, on) => {
  setup(on)
  const copies: string[] = []
  on('ui.copy', ($, e) => { copies.push(e.text); return { value: { isCopied: true } } })
  const command = 'cd ~/projects/sample-module && codex -s workspace-write --add-dir /opt/demo/projects/sample/docs/handoff'
  expect(wrapCode(command, 105)).toEqual([command.padEnd(105)])
  expect(wrapCode(command, 65)).toEqual(['cd ~/projects/sample-module && codex -s workspace-write --add-dir'.padEnd(65), '/opt/demo/projects/sample/docs/handoff'.padEnd(65)])
  expect(wrapCode('가나다라마바사아자차카', 20)).toEqual(['가나다라마바사아자차', '카' + ' '.repeat(18)])
  expect(wrapCode('a'.repeat(30), 20)).toEqual(['a'.repeat(20), 'a'.repeat(10) + ' '.repeat(10)])
  expect(wrapCode('Ａ中가 x', 6)).toEqual(['Ａ中가', 'x     '])
  expect(wrapCode('aa bb cc', 6)).toEqual(['aa bb ', 'cc    '])
  for (const [source, width] of [[command, 109], [command, 69], ['가'.repeat(11), 24], ['a'.repeat(30), 24], ['\techo  \n  end\t', 24]] as const) {
    const ui = await codeMount($, 'terminal', source, width, true, source + width)
    expect((await ui.findAll({ type: 'Code' })).map(n => n.props.source)).toEqual(wrapCode(source, width - 4))
    await ui.press({ key: 'copy-0' })
    expect(copies.at(-1)).toBe(source)
  }
  expect(copies).toHaveLength(5)
})

test('K14 K15 K16 terminal COPY typography, contrast and light feedback', async ($, on) => {
  const clock = setup(on)
  let success = true
  on('ui.copy', () => ({ value: success ? { isCopied: true } : { isCopied: false, reason: 'refused' } }))
  const ui = await codeMount($, 'terminal', 'x')
  const label = await ui.find({ key: 'copy-0' })
  expect(label?.children).toEqual([
    { type: 'Text', props: { color: '#FF5FFF' }, children: ['['] },
    { type: 'Text', props: { color: '#FF5FFF', bold: true }, children: ['COPY'] },
    { type: 'Text', props: { color: '#FF5FFF' }, children: [']'] },
  ])
  await setConfig($, 'neon-sections.nextColorDark', '#005FAF')
  expect((await ui.findAll({ type: 'Text', text: 'COPY' })).map(n => n.props.color)).toEqual(['#EEEEEE'])
  const evidence = await mount($, 'terminal', '### 결론\n### 근거\n```\nx\n```', 'evidence')
  expect((await evidence.find({ type: 'Text', text: 'COPY' }))?.props.color).toBe('#BCBCBC')
  await setConfig($, 'theme', 'light')
  expect((await evidence.find({ type: 'Text', text: 'COPY' }))?.props.color).toBe('#585858')
  await ui.press({ key: 'copy-0' })
  expect((await ui.find({ type: 'Text', text: 'COPIED' }))?.props.color).toBe('#008700')
  await clock.advance(1500)
  success = false
  await ui.press({ key: 'copy-0' })
  expect((await ui.find({ type: 'Text', text: 'FAILED' }))?.props.color).toBe('#AF005F')
})

test('K17 D4 D5 D6 D7 desktop mono first row shares Client COPY and copies exact source', async ($, on) => {
  setup(on)
  const source = '  echo a\n\techo b\n'
  const copies: { text: string; surface?: RenderSurface }[] = []
  on('ui.copy', ($, e) => { copies.push(e); return { value: { isCopied: true } } })
  const ui = await codeMount($, 'desktop', source)
  const frame = elements(await ui.drawn()).find(n => n.type === 'Box' && n.props?.backgroundColor === '#262625')
  if (frame?.type !== 'Box') throw new Error('missing code frame')
  expect(elements(frame).filter(n => n.type === 'Text' && n.props?.mono).map(drawnText)).toEqual(['  echo a', '    echo b', ' '])
  const label = await ui.drawn({ in: 'copy-0' })
  expect(label).toMatchObject({ type: 'Text', props: { color: '#FF5FFF' }, children: [
    '[', { type: 'Text', props: { color: '#FF5FFF', bold: true }, children: ['COPY'] }, ']',
  ] })
  await ui.pointer({ in: 'copy-0', type: 'down', x: 2, y: 0, button: 'left' })
  expect(copies).toEqual([{ text: source, surface: 'desktop' }])
  await ui.post('copy', { in: 'copy-0' })
  expect(copies).toEqual(Array(2).fill({ text: source, surface: 'desktop' }))
})

test('D4 D6 desktop wraps long lines and preserves dark contrast fallback', async ($, on) => {
  setup(on)
  const source = 'x'.repeat(40)
  const ui = await codeMount($, 'desktop', source, 20)
  await setConfig($, 'neon-sections.nextColorDark', '#111111')
  const lines = elements(await ui.drawn()).filter(n => n.type === 'Text' && n.props?.mono)
  expect(lines.map(drawnText)).toEqual(['x'.repeat(6), 'x'.repeat(16), 'x'.repeat(16), 'xx'])
  expect((await ui.find({ in: 'copy-0', type: 'Text', text: 'COPY' }))?.props.color).toBe('#EEEEEE')
})

test('D8 desktop streaming retains mono code and adds COPY beside the first line on closure', async ($, on) => {
  setup(on)
  await $.turn.start({ turnId: 'desktop-stream', text: 'test' })
  const text = '### 결론\n끝\n### 다음 단계\n1. 가\n   ```bash\n   echo'
  const ui = await mount($, 'desktop', text, 'desktop-stream')
  const before = elements(await ui.drawn())
  const frame = before.find(n => n.type === 'Box' && n.props?.borderColor === '#4E4E4E')
  expect(frame).toMatchObject({ children: [{ type: 'Text', props: { mono: true }, children: ['echo'] }] })
  expect(before.some(n => n.type === 'Client' || n.type === 'Button' || n.type === 'Code' || n.type === 'engine')).toBe(false)
  await ui.redraw({ text: text + '\n   ```', isFirstOfReply: true })
  const after = elements(await ui.drawn())
  const closed = after.find(n => n.type === 'Box' && n.props?.borderColor === '#4E4E4E')
  if (closed?.type !== 'Box') throw new Error('missing closed code box')
  expect(closed.children).toHaveLength(1)
  expect(closed.children![0]).toMatchObject({ type: 'Box', props: { justifyContent: 'space-between', columnGap: 2 }, children: [
    { type: 'Box', props: { flexShrink: 1, minWidth: 0 }, children: [
      { type: 'Text', props: { mono: true }, children: ['echo'] },
    ] },
    { type: 'Box', props: { width: 6, flexShrink: 0 }, children: [
      { type: 'Client', props: { key: 'copy-0', width: 6, height: 1 } },
    ] },
  ] })
  expect(after.some(n => n.type === 'Button' || n.type === 'Code' || n.type === 'engine')).toBe(false)
})

test('K19 prompt adds exactly the fixed next-step line', () => {
  expect(ACTUAL_PROMPT).toBe(PROMPT)
  expect(ACTUAL_PROMPT.replace(NEXT_RULE + '\n', '')).toBe(BASE_PROMPT)
  expect(ACTUAL_PROMPT.split('\n')[ACTUAL_PROMPT.split('\n').indexOf(NEXT_RULE) - 1]).toBe('- 확인 필요에는 사용자가 답하거나 정해야 하는 것만 쓴다.')
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`K20 ${surface} 0.4.1 trees change only numbered row alignment`, async ($, on) => {
    setup(on)
    // Captured from main 738bce8 in /tmp; the only added prop is row alignment.
    const markdown = (text: string) => ({ type: 'Markdown', props: { text } })
    const bold = surface === 'desktop' ? { bold: true, weight: 'semibold' } : { bold: true }
    const numbered = ['가', '나'].map((text, i) => ({ type: 'Box', props: { alignItems: 'flex-start', ...(i ? { marginTop: 1 } : {}) }, children: [
      { type: 'Text', props: { color: '#FF5FFF', ...bold }, children: [`${i + 1}.`, ' '] },
      { type: 'Box', props: { flexDirection: 'column', flexGrow: 1 }, children: [markdown(text)] },
    ] }))
    const expected = { type: 'Box', props: { flexDirection: 'column' }, children: [markdown('앞말'),
      ...[['결론', '#00D7FF', '#00D7FF', '완료'], ['근거', '#626262', '#BCBCBC', '검증'], ['확인 필요', '#FFD700', '#FFD700', '질문'], ['다음 단계', '#FF5FFF', '#FF5FFF', '']].map(([name, border, title, text]) => ({
        type: 'Box', props: { key: `section-${({ '결론': 'conclusion', '근거': 'rationale', '확인 필요': 'attention', '다음 단계': 'next' } as Record<string, string>)[name!]}`, flexDirection: 'column', borderStyle: 'round', borderColor: border, paddingX: 1, marginBottom: 1 },
        children: [{ type: 'Box', props: { justifyContent: 'space-between' }, children: [{ type: 'Text', props: { ...bold, color: title }, children: [name] }] },
          ...(name === '다음 단계' ? numbered : [markdown(text!)])],
      })),
    ], part: { plugin } }
    const ui = await mount($, surface, '앞말\n### 결론\n완료\n### 근거\n검증\n### 확인 필요\n질문\n### 다음 단계\n1. 가\n2. 나')
    expect(await ui.drawn()).toEqual(expected)
    await ui.redraw({ text: '앞말\n### 결론\n내용', isFirstOfReply: true })
    expect(await ui.drawn()).toEqual({ type: 'Box', props: { flexDirection: 'column' }, children: [markdown('앞말'), markdown('내용')], part: { plugin } })
    await ui.redraw({ text: '인식 안 된 답', isFirstOfReply: true })
    expect(await ui.drawn()).toEqual({ type: 'engine', ref: 0 })
  })

  test(`K7 ${surface} underlined item retains its following fenced block`, async ($, on) => {
    setup(on)
    const ui = await mount($, surface, '### 결론\n### 다음 단계\n1-1. <u>가</u>\n\n     ```\n     echo\n     ```\n\n1-2. 나')
    const rows = numberedRows(await ui.drawn())
    expect(rows).toHaveLength(2)
    expect(elements(rows[0]!).some(n =>
      surface === 'terminal' ? n.type === 'Code' : n.type === 'Text' && n.props?.mono === true)).toBe(true)
    expect((await ui.find({ type: 'Text', text: '가' }))?.props.underline).toBe(true)
    expect(rows[1]?.props?.marginTop).toBe(1)
  })
}

test('K9 tiny fallback blocks still reserve their answer-local copy index', async ($, on) => {
  setup(on)
  const copies: string[] = []
  on('ui.copy', ($, e) => { copies.push(e.text); return { value: { isCopied: true } } })
  const text = '### 결론\n### 다음 단계\n' + '1'.repeat(87) + '. 가\n  ```\n  tiny\n  ```\n\n```\nwide\n```'
  const ui = await mount($, 'terminal', text)
  expect(await ui.find({ key: 'copy-0' })).toBeUndefined()
  expect(await ui.find({ key: 'copy-1' })).toBeDefined()
  await ui.press({ key: 'copy-1' })
  expect(copies).toEqual(['wide'])
  await ui.redraw({ text: text.replace('1'.repeat(87), '1'), isFirstOfReply: true })
  expect((await ui.find({ key: 'copy-0' }))?.props.label).toBe('[COPY]')
  expect((await ui.find({ key: 'copy-1' }))?.props.label).toBe('COPIED')
})

test('K15 K16 late copy results cannot overwrite a newer press', async ($, on) => {
  const clock = setup(on)
  let calls = 0
  on('ui.copy', async () => {
    if (++calls === 1) { await clock.sleep(1000); return { value: { isCopied: false, reason: 'refused' } } }
    return { value: { isCopied: true } }
  })
  const ui = await codeMount($, 'terminal', 'text')
  const first = ui.press({ key: 'copy-0' })
  await clock.settle()
  await ui.press({ key: 'copy-0' })
  expect((await ui.find({ key: 'copy-0' }))?.props.label).toBe('COPIED')
  await clock.advance(1000)
  await first
  expect((await ui.find({ key: 'copy-0' }))?.props.label).toBe('COPIED')
  expect(await ui.find({ type: 'Text', text: '복사 실패 · 문장을 직접 선택해 복사하세요' })).toBeUndefined()
  await clock.advance(500)
  expect((await ui.find({ key: 'copy-0' }))?.props.label).toBe('[COPY]')
  expect(calls).toBe(2)
})

test('K18 scope: next-step-only input retains the existing unrecognized fallback', async ($, on) => {
  setup(on)
  const ui = await mount($, 'terminal', '### 다음 단계\n1. 가\n   ```bash\n   echo')
  expect(await ui.drawn()).toEqual({ type: 'engine', ref: 0 })
})

test('V4 V5 V6 V16 V17 desktop wraps only the first row around Client COPY', async ($, on) => {
  setup(on)
  const source = 'cd ~/projects/sample-module && codex -s workspace-write --add-dir /opt/demo/projects/sample/docs/handoff'
  const ui = await codeMount($, 'desktop', source, 69)
  const frame = elements(await ui.drawn()).find(n => n.type === 'Box' && n.props?.backgroundColor === '#262625')
  expect(frame).toMatchObject({ type: 'Box', props: {
    borderStyle: 'round', borderColor: '#4E4E4E', backgroundColor: '#262625', paddingX: 1,
  } })
  if (frame?.type !== 'Box') throw new Error('missing code frame')
  expect(frame.props?.paddingTop).toBeUndefined()
  expect(elements(frame).some(n => n.type === 'Code' || n.type === 'Button' ||
    ('props' in n && n.props && 'position' in n.props && n.props.position === 'absolute'))).toBe(false)
  const row = frame.children![0]
  expect(row).toMatchObject({ type: 'Box', props: { justifyContent: 'space-between', columnGap: 2 }, children: [
    { type: 'Box', props: { flexShrink: 1, minWidth: 0 }, children: [
      { type: 'Text', props: { mono: true } },
    ] },
    { type: 'Box', props: { width: 6, flexShrink: 0 }, children: [
      { type: 'Client', props: { key: 'copy-0', width: 6, height: 1 } },
    ] },
  ] })
  const lines = elements(frame).filter(n => n.type === 'Text' && n.props?.mono).map(drawnText)
  expect(lines.map(line => line.trimEnd())).toEqual([
    'cd ~/projects/sample-module && codex -s workspace-write',
    '--add-dir /opt/demo/projects/sample/docs/handoff',
  ])
  expect(lines[0]!.length <= 55).toBe(true)
})

test('V8 Client ignores other pointer events, malformed posts and unknown addresses', async ($, on) => {
  setup(on)
  const copies: string[] = []
  on('ui.copy', ($, e) => { copies.push(e.text); return { value: { isCopied: true } } })
  const ui = await codeMount($, 'desktop', '  original\ttext\nnext')
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'right' })
  for (const type of ['up', 'move', 'enter', 'leave'] as const) {
    await ui.pointer({ type, x: 1, y: 0, button: 'left' })
  }
  await ui.post({})
  for (const data of [null, false, 1, [], { text: 'forged' }, 'COPY']) await ui.post(data)
  for (const key of ['unknown', 'copy-999', 'copy-00']) {
    await expect(ui.post('copy', { in: key })).rejects.toThrow()
  }
  await (await pane($, 'desktop')).post('copy')
  expect(copies).toHaveLength(0)
  await ui.post('copy')
  expect(copies).toEqual(['  original\ttext\nnext'])
  await ui.redraw({ text: '### 결론\n### 다음 단계\n```\nupdated\n```', isFirstOfReply: true })
  await ui.post('copy')
  expect(copies).toEqual(['  original\ttext\nnext', 'updated'])
  await ui.redraw({ text: '### 결론\n### 다음 단계\nno code', isFirstOfReply: true })
  await expect(ui.post('copy', { in: 'copy-0' })).rejects.toThrow()
  expect(copies).toHaveLength(2)
})

test('V11 V18 desktop widths 12 to 14 have no Client and width 15 reserves only its first row', async ($, on) => {
  setup(on)
  for (const [width, lines] of [
    [12, ['abcdefgh', 'ijklmnop']],
    [13, ['abcdefghi', 'jklmnop']],
    [14, ['abcdefghij', 'klmnop']],
  ] as const) {
    const ui = await $.ui.mount({ plugin, surface: 'desktop', component: 'AssistantMessage',
      requestId: `narrow-${width}`, viewport: { ...viewport, columns: width + 16 },
      props: { text: '### 결론\n### 다음 단계\n123456. 가\n        ```\n        abcdefghijklmnop\n        ```', isFirstOfReply: true } })
    expect(await ui.findAll({ type: 'Client' })).toHaveLength(0)
    expect(elements(await ui.drawn()).filter(n => n.type === 'Text' && n.props?.mono).map(drawnText)).toEqual(lines)
  }
  const edge = await $.ui.mount({ plugin, surface: 'desktop', component: 'AssistantMessage',
    requestId: 'edge', viewport: { ...viewport, columns: 30 },
    props: { text: '### 결론\n### 다음 단계\n12345. 가\n       ```\n       abcdefghijklm\n       ```', isFirstOfReply: true } })
  expect(await edge.findAll({ type: 'Client' })).toHaveLength(1)
  expect(elements(await edge.drawn()).filter(n => n.type === 'Text' && n.props?.mono).map(drawnText)).toEqual(['a', 'bcdefghijkl', 'm'])
})

test('V6 desktop wrapping retains cell rules across blank lines, fullwidth text and tabs', async ($, on) => {
  setup(on)
  expect(wrapCode('aa bb cc', 6, 3)).toEqual(['aa ', 'bb cc '])
  expect(wrapCode('aa bb cc', 6, 3, false)).toEqual(['aa ', 'bb cc'])
  expect(wrapCode('\nＡ中가 x\n\tz', 6, 2)).toEqual(['  ', 'Ａ中가', 'x     ', '    z '])
  expect(wrapCode('x'.repeat(11), 5, 3)).toEqual(['xxx', 'xxxxx', 'xxx  '])
  const ui = await codeMount($, 'desktop', '가나다라마바사\nＡＢＣＤＥＦＧ\n\tz', 16)
  expect(elements(await ui.drawn()).filter(n => n.type === 'Text' && n.props?.mono).map(drawnText)).toEqual([
    '가', '나다라마바사', 'ＡＢＣＤＥＦ', 'Ｇ', '    z',
  ])
})

test('V9 desktop late copy results cannot overwrite a newer Client click', async ($, on) => {
  const clock = setup(on)
  let calls = 0
  on('ui.copy', async () => {
    if (++calls === 1) { await clock.sleep(1000); return { value: { isCopied: false, reason: 'refused' } } }
    return { value: { isCopied: true } }
  })
  const ui = await codeMount($, 'desktop', 'text')
  const first = ui.post('copy')
  await clock.settle()
  await ui.post('copy')
  expect(drawnText(await ui.drawn({ in: 'copy-0' }))).toBe('COPIED')
  await clock.advance(1000)
  await first
  expect(drawnText(await ui.drawn({ in: 'copy-0' }))).toBe('COPIED')
  expect(await ui.find({ type: 'Text', text: '복사 실패 · 문장을 직접 선택해 복사하세요' })).toBeUndefined()
  await clock.advance(500)
  expect(drawnText(await ui.drawn({ in: 'copy-0' }))).toBe('[COPY]')
  expect(calls).toBe(2)
})


test('V9 desktop Client copy states, exact deadlines, repeat presses and isolation', async ($, on) => {
  const surface = 'desktop' as const
  const clock = setup(on)
  let result: 'success' | 'refused' | 'throw' = 'success'
  on('ui.copy', () => {
    if (result === 'throw') throw new Error('clipboard unavailable')
    return { value: result === 'success' ? { isCopied: true } : { isCopied: false, reason: 'refused' } }
  })
  const ui = await mount($, surface, '### 결론\n### 다음 단계\n```\none\n```\n```\ntwo\n```')
  const other = await codeMount($, surface, 'other', 40, true, 'other-answer')
  await ui.pointer({ in: 'copy-0', type: 'down', x: 2, y: 0, button: 'left' })
  expect(drawnText(await ui.drawn({ in: 'copy-0' }))).toBe('COPIED')
  expect((await ui.find({ in: 'copy-0', type: 'Text', text: 'COPIED' }))?.props.color).toBe('#4EBA65')
  expect(drawnText(await ui.drawn({ in: 'copy-1' }))).toBe('[COPY]')
  expect(drawnText(await other.drawn({ in: 'copy-0' }))).toBe('[COPY]')
  await clock.advance(1499)
  expect(drawnText(await ui.drawn({ in: 'copy-0' }))).toBe('COPIED')
  await clock.advance(1)
  expect(drawnText(await ui.drawn({ in: 'copy-0' }))).toBe('[COPY]')
  for (const failure of ['refused', 'throw'] as const) {
    result = failure
    await ui.pointer({ in: 'copy-0', type: 'down', x: 2, y: 0, button: 'left' })
    expect(drawnText(await ui.drawn({ in: 'copy-0' }))).toBe('FAILED')
    expect((await ui.find({ in: 'copy-0', type: 'Text', text: 'FAILED' }))?.props.color).toBe('#FF6B80')
    const notice = await ui.find({ type: 'Text', text: '복사 실패 · 문장을 직접 선택해 복사하세요' })
    expect(notice?.props.dimColor).toBe(true)
    await clock.advance(1999)
    expect(drawnText(await ui.drawn({ in: 'copy-0' }))).toBe('FAILED')
    await clock.advance(1)
    expect(drawnText(await ui.drawn({ in: 'copy-0' }))).toBe('[COPY]')
    expect(await ui.find({ type: 'Text', text: '복사 실패 · 문장을 직접 선택해 복사하세요' })).toBeDefined()
    result = 'success'
    await ui.pointer({ in: 'copy-0', type: 'down', x: 2, y: 0, button: 'left' })
    expect(await ui.find({ type: 'Text', text: '복사 실패 · 문장을 직접 선택해 복사하세요' })).toBeUndefined()
  }
  await clock.advance(1000)
  result = 'refused'
  await ui.pointer({ in: 'copy-0', type: 'down', x: 2, y: 0, button: 'left' })
  await clock.advance(500)
  expect(drawnText(await ui.drawn({ in: 'copy-0' }))).toBe('FAILED')
  await clock.advance(1499)
  expect(drawnText(await ui.drawn({ in: 'copy-0' }))).toBe('FAILED')
  await clock.advance(1)
  expect(drawnText(await ui.drawn({ in: 'copy-0' }))).toBe('[COPY]')
})
