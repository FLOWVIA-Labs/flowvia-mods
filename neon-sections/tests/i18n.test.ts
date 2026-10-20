import { test, expect, mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, RenderElement, RenderSurface } from 'claude-code'
import { messages, resolveLanguage, sectionKeys } from '../hooks/i18n'
import { parse } from '../hooks/sections'
import { expectedPrompts } from './prompts'

const plugin = 'neon-sections', panelId = 'neon-sections-settings'
const viewport = { columns: 120, rows: 40, isFullscreen: true }
const compose = { model: 'test', promptModel: 'test', surfaces: [], tools: [], outputStyle: null, traits: [] }
const english = '### Conclusion · Done\nFinished.\n### Rationale\nChecked.\n### Needs your input\nChoose.\n### Next steps\n1. Review.'
const korean = '### 결론 · 완료\nFinished.\n### 근거\nChecked.\n### 확인 필요\nChoose.\n### 다음 단계\n1. Review.'
const hangul = /[가-힣ㄱ-ㅎㅏ-ㅣ]/
function noKorean(value: unknown) { expect(JSON.stringify(value).match(hangul)).toBeNull() }
function elements(tree: RenderElement): RenderElement[] {
  return [tree, ...('children' in tree ? (tree.children ?? []).flatMap(child => typeof child === 'string' ? [] : elements(child)) : [])]
}
function setup(on: On, observed: { native?: string[]; writes?: { key: string; value: unknown }[]; denied?: boolean; descriptions?: string[]; titles?: string[] } = {}) {
  mock.clock(on)
  on('ui.render', ($, e) => { if (e.component === 'AssistantMessage') observed.native?.push(e.props.text); return { type: 'engine', ref: 0 } })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => { observed.descriptions?.push(e.description!); return { value: { command: e.name } } })
  on('config.list', () => ({ value: [] }))
  on('config.set', ($, e) => { observed.writes?.push({ key: e.key, value: e.value }); return observed.denied ? { deny: 'locked' } : { value: e.value } })
  on('ui.open', ($, e) => { observed.titles?.push(e.title!); return { value: { isPlaced: true } } })
  on('ui.focus', () => ({}))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('prompt.compose', () => ({ sections: [] }))
  on('tool.call', () => ({ result: 'failed', isError: true, text: 'failed' }))
}
function command($: Engine, args: string) {
  return $.command.run({ command: 'ns-setting', args, origin: { kind: 'composer' }, presentation: viewport })
}
function setLanguage($: Engine, value: string) {
  return $.config.set({ key: 'neon-sections.language', value, previous: 'auto', provider: { plugin: 'engine', tier: 'core' }, origin: { kind: 'composer' } })
}
function mount<P extends RenderSurface>($: Engine, surface: P, text = english, requestId = 'answer') {
  return $.ui.mount({ plugin, surface, component: 'AssistantMessage', requestId, viewport,
    props: { text, isFirstOfReply: true, onScreen: { first: 0, last: 20, of: 21 } } })
}
function pane($: Engine, surface: 'terminal' | 'desktop', fullscreen: boolean, columns: number) {
  return $.ui.mount({ plugin, surface, component: 'Pane', requestId: panelId, viewport: { ...viewport, isFullscreen: fullscreen },
    props: { title: 'Answer sections', isFocused: true, bodyColumns: columns, placement: fullscreen ? 'dock' : 'inline', scroll: { offset: 0, bodyRows: 70 }, view: {} } })
}
async function append($: Engine, uuid: string, text: string) {
  await $.session.append({ uuid, door: 'response', origin: { kind: 'model', model: 'test' },
    message: { type: 'assistant', role: 'assistant', content: [{ type: 'text', text }] } })
}
async function toolsTurn($: Engine, text = english, count = 1) {
  await $.turn.start({ turnId: 'turn', text: 'test' })
  for (let i = 0; i < count; i++) {
    await append($, `progress-${i}`, 'Working.')
    await $.tool.call({ tool: 'Bash', tool_use_id: `tool-${i}`, command: 'pwd' })
  }
  await append($, 'answer', text)
  await $.turn.complete({ turnId: 'turn', answer: text, durationMs: 10, isAborted: false, reason: 'answer' })
}

for (const value of ['Korean', 'korean', ' KO ', 'ko-KR', '한국어', 'japanese', 'English', undefined, 7, null, true]) {
  test(`N3 auto settings ${String(value)}`, async ($, on) => {
    setup(on)
    const expected = typeof value === 'string' && ['Korean', 'korean', ' KO ', 'ko-KR', '한국어'].includes(value) ? 'ko' : 'en'
    on('settings.read', ($, e) => { expect(e.source).toBeUndefined(); return { value: value === undefined ? {} : { language: value } } })
    expect((await $.prompt.compose(compose)).sections.at(-1)?.text).toBe(expectedPrompts[expected])
  })
}
for (const failure of ['throw', 'reject'] as const) {
  test(`N3 settings read ${failure} falls back to English`, async ($, on) => {
    setup(on)
    expect(await resolveLanguage({ settings: { read: () => { if (failure === 'throw') throw new Error('unavailable'); return Promise.reject(new Error('unavailable')) } } }, 'auto')).toBe('en')
    on('settings.read', () => ({ deny: 'unavailable' }))
    expect((await $.prompt.compose(compose)).sections.at(-1)?.text).toBe(expectedPrompts.en)
    const ui = await pane($, 'desktop', true, 58)
    expect(await ui.find({ type: 'Text', text: 'Answer sections' })).toBeDefined()
    noKorean(await ui.drawn())
  })
}
for (const language of ['ko', 'en'] as const) {
  test(`N5 N6 exact ${language} prompt and explicit override`, { options: { language } }, async ($, on) => {
    setup(on)
    on('settings.read', () => { throw new Error('explicit language must not read settings') })
    const actual = (await $.prompt.compose(compose)).sections.at(-1)?.text
    expect(actual).toBe(expectedPrompts[language])
    expect(/Jev|인계문|Codex/.test(actual!)).toBe(false)
    expect(actual?.endsWith('\n')).toBe(false)
  })
  for (const surface of ['desktop', 'terminal'] as const) {
    test(`N2 N4 ${language} ${surface} recognizes both heading languages and all statuses`, { options: { language } }, async ($, on) => {
      setup(on)
      for (const answerLanguage of ['ko', 'en'] as const) for (const status of ['done', 'waiting', 'blocked'] as const) {
        const t = messages[answerLanguage]
        const text = (answerLanguage === 'ko' ? korean : english).replace(t.statuses.done, t.statuses[status])
        const ui = await mount($, surface, text, `${answerLanguage}-${status}`)
        for (const key of sectionKeys) {
          expect(await ui.find({ key: `section-${key}` })).toBeDefined()
          expect(await ui.find({ type: 'Text', text: t.sections[key] })).toBeDefined()
        }
        const symbol = { done: '✓', waiting: '…', blocked: '✗' }[status]
        const badge = await ui.find({ type: 'Text', text: `${symbol} ${t.statuses[status]}` })
        expect(badge?.props.color).toBe({ done: 'success', waiting: 'warning', blocked: 'error' }[status])
        if (answerLanguage === 'en') noKorean(await ui.drawn())
      }
    })
    test(`N4 ${language} ${surface} streaming prefixes and fenced headings`, { options: { language } }, async ($, on) => {
      const native: string[] = []
      setup(on, { native })
      await $.turn.start({ turnId: 'stream', text: 'test' })
      for (const prefix of ['### Concl', '### Conclusion · ', '### 결']) {
        await mount($, surface, `hello\n${prefix}`, prefix)
        expect(native.at(-1)).toBe('hello')
      }
      for (const text of [english, korean]) {
        const ui = await mount($, surface, text + '\n### Concl', text)
        expect(JSON.stringify(await ui.drawn())).not.toContain('### Concl')
      }
      expect(parse('### Conclusion\n```md\n### 근거\n```\n### Next steps\nReview.', false).sections.rationale).toBeUndefined()
      expect(parse('### Conclusion\nOnly.', false).boxed).toBe(false)
      expect(parse('### Rationale\nOnly.\n### Next steps\nReview.', false).boxed).toBe(false)
    })
  }
}

test('N3 invalid preference follows auto and auto rereads settings without restart', async ($, on) => {
  setup(on)
  let language = 'Korean'
  on('settings.read', () => ({ value: { language } }))
  await setLanguage($, 'invalid')
  expect((await $.prompt.compose(compose)).sections.at(-1)?.text).toBe(expectedPrompts.ko)
  const ui = await pane($, 'desktop', true, 58)
  language = 'English'
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: 'Answer sections' })).toBeDefined()
  noKorean(await ui.drawn())
  expect((await $.prompt.compose(compose)).sections.at(-1)?.text).toBe(expectedPrompts.en)
})

for (const surface of ['desktop', 'terminal'] as const) for (const count of [1, 2]) {
  test(`N2 ${surface} English work log counts ${count}, failures and expanded rows`, { options: { language: 'en' } }, async ($, on) => {
    setup(on)
    await toolsTurn($, english, count)
    const ui = await mount($, surface)
    const expected = `${count} tool ${count === 1 ? 'call' : 'calls'} · ${count} progress ${count === 1 ? 'note' : 'notes'}`
    expect((await ui.find({ key: 'process-turn' }))?.props.label).toBe(`▸ Work log · ${expected}`)
    expect(await ui.find({ type: 'Text', text: `${count} failed:` })).toBeDefined()
    noKorean(await ui.drawn())
    await ui.press({ key: 'process-turn' })
    expect((await ui.find({ key: 'process-turn' }))?.props.label).toBe(`▾ Work log · ${expected}`)
    expect(await ui.find({ type: 'Text', text: 'Working.' })).toBeDefined()
    noKorean(await ui.drawn())
  })
}

for (const [surface, fullscreen] of [['desktop', true], ['terminal', true], ['terminal', false]] as const) for (const columns of [58, 118]) {
  test(`N2 N9 English panel all labels ${surface} fullscreen=${fullscreen} width=${columns}`, { options: { language: 'en' } }, async ($, on) => {
    const observed = { denied: false }
    setup(on, observed)
    const ui = await pane($, surface, fullscreen, columns)
    const buttons = (await ui.findAll({ type: 'Button' })).map(b => b.key)
    expect(buttons.indexOf('language')).toBe(buttons.indexOf('theme') + 1)
    expect((await ui.find({ key: 'language' }))?.props.label).toBe('Language  ○ auto  ○ ko  ● en')
    for (const theme of ['dark', 'light']) {
      for (let i = 0; i < 18; i++) {
        await $.ui.focus({ component: 'Pane', requestId: panelId, plugin, element: `palette-conclusion-${i}`, origin: { kind: 'person' } })
        noKorean(await ui.drawn())
      }
      expect((await ui.find({ key: 'hex-conclusion' }))?.props.submitLabel).toBe('Apply')
      expect((await ui.find({ key: 'reset-conclusion' }))?.props.label).toBe('Default')
      await ui.input({ key: 'hex-conclusion', text: 'bad' })
      expect(await ui.find({ type: 'Text', text: 'Invalid color: enter #RRGGBB' })).toBeDefined()
      noKorean(await ui.drawn())
      await ui.input({ key: 'hex-conclusion', text: '#00D8FF' })
      expect(await ui.find({ type: 'Text', text: 'Shown as #00D7FF(45) on 256-color displays' })).toBeDefined()
      noKorean(await ui.drawn())
      if (theme === 'dark') await ui.press({ key: 'theme' })
    }
    for (let row = 0; row < 5; row++) {
      if (surface === 'terminal' && !fullscreen) await ui.press({ key: `effect-${row}-0` })
      else await ui.post({ row, column: 0, toggle: true }, { in: 'effects-grid' })
      noKorean(await ui.drawn())
      if (surface !== 'terminal' || fullscreen) noKorean(await ui.drawn({ in: 'effects-grid' }))
    }
    observed.denied = true
    await ui.press({ key: 'palette-conclusion-0' })
    expect(await ui.find({ type: 'Text', text: 'Rejected: locked' })).toBeDefined()
    await ui.press({ key: 'foldTools' })
    await ui.press({ key: 'language' })
    expect((await ui.find({ key: 'language' }))?.props.label).toContain('● en')
    noKorean(await ui.drawn())
  })
}

for (const surface of ['desktop', 'terminal'] as const) {
  test(`N2 ${surface} English copy failure`, { options: { language: 'en' } }, async ($, on) => {
    setup(on)
    on('ui.copy', () => ({ value: { isCopied: false, reason: 'refused' } }))
    const ui = await mount($, surface, english + '\n```txt\ncopy me\n```')
    if (surface === 'desktop') await ui.pointer({ in: 'copy-0', type: 'down', x: 2, y: 0, button: 'left' })
    else await ui.press({ key: 'copy-0' })
    expect(await ui.find({ type: 'Text', text: 'Copy failed · select the text and copy it yourself' })).toBeDefined()
    noKorean(await ui.drawn())
  })
  test(`N7 N9 ${surface} language change preserves boxes, expansion and translated errors`, { options: { language: 'ko' } }, async ($, on) => {
    setup(on)
    await toolsTurn($, korean)
    const answer = await mount($, surface, korean)
    await answer.press({ key: 'process-turn' })
    const boxes = elements(await answer.drawn()).filter(e => e.type === 'Box' && e.props?.key?.toString().startsWith('section-'))
    const ui = await pane($, surface, true, 58)
    await ui.input({ key: 'hex-conclusion', text: 'bad' })
    expect((await ui.find({ key: 'language' }))?.props.label).toBe('언어  ○ auto  ● ko  ○ en')
    await ui.press({ key: 'language' })
    expect((await ui.find({ key: 'language' }))?.props.label).toBe('Language  ○ auto  ○ ko  ● en')
    expect(await ui.find({ type: 'Text', text: 'Invalid color: enter #RRGGBB' })).toBeDefined()
    noKorean(await ui.drawn())
    expect((await answer.find({ key: 'process-turn' }))?.props.label).toBe('▾ Work log · 1 tool call · 1 progress note')
    expect(elements(await answer.drawn()).filter(e => e.type === 'Box' && e.props?.key?.toString().startsWith('section-'))).toEqual(boxes)
    expect((await $.prompt.compose(compose)).sections.at(-1)?.text).toBe(expectedPrompts.en)
    await setLanguage($, 'ko')
    expect((await answer.find({ key: 'process-turn' }))?.props.label).toContain('▾ 작업 과정')
    expect((await $.prompt.compose(compose)).sections.at(-1)?.text).toBe(expectedPrompts.ko)
    await setLanguage($, 'en')
    expect((await answer.find({ key: 'process-turn' }))?.props.label).toContain('▾ Work log')
  })
}

for (const language of ['ko', 'en'] as const) {
  test(`N8 ${language} all section aliases set the same color and effect keys`, { options: { language } }, async ($, on) => {
    const writes: { key: string; value: unknown }[] = []
    setup(on, { writes })
    for (const key of ['conclusion', 'attention', 'next'] as const) {
      for (const alias of [messages.ko.sections[key], messages.en.sections[key], messages.en.sections[key].toUpperCase(), key]) {
        expect((await command($, `color ${alias} #123456 light`)).text).toBe(`${key}ColorLight: #123456`)
        expect(writes.at(-1)).toEqual({ key: `neon-sections.${key}ColorLight`, value: '#123456' })
        expect((await command($, `effect glow ${alias} on`)).text).toBe(`${key}Glow: true`)
        expect(writes.at(-1)).toEqual({ key: `neon-sections.${key}Glow`, value: true })
      }
    }
    const before = writes.length
    for (const arg of ['color Rationale #123456', 'effect glow rationale on', 'color unknown #123456', 'effect glow next maybe']) {
      expect((await command($, arg)).text).toBe(messages[language].usage)
    }
    expect(writes.length).toBe(before)
  })
}

test('N2 English command descriptions, responses, usage and denied writes', { options: { language: 'en' } }, async ($, on) => {
  const descriptions: string[] = [], titles: string[] = []
  const observed = { descriptions, titles, denied: false }
  setup(on, observed)
  await $.session.start({ cwd: '/test', surface: 'terminal', isInteractive: true })
  expect(descriptions).toEqual(['Configure answer sections, colors and border effects'])
  for (const args of ['', 'off', 'on', 'status', 'color Conclusion #123456', 'effect glow next on', 'fold off', 'nonsense']) noKorean(await command($, args))
  expect(titles).toEqual(['Answer sections'])
  observed.denied = true
  expect((await command($, 'color next #123456')).text).toBe('Rejected: locked')
  noKorean(await command($, 'effect hover attention on'))
  noKorean(await command($, 'fold on'))
  noKorean((await $.prompt.compose(compose)).sections)
  await setLanguage($, 'ko')
  expect((await command($, 'on')).text).toBe('Answer sections on')
  observed.denied = false
  await setLanguage($, 'ko')
  expect((await command($, 'on')).text).toBe('답변 섹션 on')
  expect(descriptions).toEqual(['Configure answer sections, colors and border effects'])
})

test('N9 panel cycles auto, ko, en and persists each choice', async ($, on) => {
  const writes: { key: string; value: unknown }[] = []
  setup(on, { writes })
  on('settings.read', () => ({ value: { language: 'Korean' } }))
  const ui = await pane($, 'desktop', true, 58)
  expect((await ui.find({ key: 'language' }))?.props.label).toBe('언어  ● auto  ○ ko  ○ en')
  for (const value of ['ko', 'en', 'auto']) {
    await ui.press({ key: 'language' })
    expect(writes.at(-1)).toEqual({ key: 'neon-sections.language', value })
    expect((await ui.find({ key: 'language' }))?.props.label).toContain(`● ${value}`)
    expect((await $.prompt.compose(compose)).sections.at(-1)?.text).toBe(expectedPrompts[value === 'en' ? 'en' : 'ko'])
  }
})

for (const language of ['ko', 'en'] as const) {
  for (const [surface, fullscreen] of [['desktop', true], ['terminal', true], ['terminal', false]] as const) {
    test(`M1 ${language} grid headers fit unchanged columns on ${surface} fullscreen=${fullscreen}`, { options: { language } }, async ($, on) => {
      setup(on)
      const ui = await pane($, surface, fullscreen, 58)
      const target = surface === 'desktop' || fullscreen ? { in: 'effects-grid' } : {}
      const grid = await ui.drawn(target)
      const header = elements(grid).find(node => node.type === 'Box' && node.children?.length === 4 &&
        node.children.every((child, index) => typeof child !== 'string' && child.type === 'Box' &&
          child.props?.width === (index === 0 ? 22 : 10)))
      expect(header).toBeDefined()
      const columns = header && 'children' in header ? header.children!.filter(child => typeof child !== 'string') : []
      const labels = columns.slice(1).map(column => elements(column).flatMap(node =>
        node.type === 'Text' ? node.children ?? [] : []).join(''))
      expect(labels).toEqual(language === 'en' ? ['Concl.', 'Input', 'Next'] : ['결론', '확인 필요', '다음 단계'])
      if (language === 'en') {
        expect(labels.every(label => /^[\x20-\x7e]+$/.test(label) && label.length <= 9)).toBe(true)
      }
      for (const [column, key] of (['conclusion', 'attention', 'next'] as const).entries()) {
        expect((await ui.find({ ...target, key: `effect-0-${column}` }))?.props.label)
          .toBe(`${messages[language].effects.Glow[0]} × ${messages[language].sections[key]}`)
        await $.ui.focus({ component: 'Pane', requestId: panelId, plugin,
          element: `effect-0-${column}`, origin: { kind: 'person' } })
        expect(await ui.find({ ...target, type: 'Text',
          text: messages[language].enabledFor(messages[language].sections[key], false) })).toBeDefined()
      }
    })
  }
}
