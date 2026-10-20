import { basketball, bbWait, threePoint } from '../hooks/basketball';
import { expectedBB, expectedBBWait, expectedBBDesign } from './design';
import { atBat, swing } from '../hooks/batting';
import type { BatResult } from '../hooks/batting';
import { test as pluginTest, expect, mock } from 'claude-code/testing';
import type { Engine, MockClock, TestBody } from 'claude-code/testing';
import type { EngineInterface, On, RenderElement, RenderSurface, PromptEditInput, PromptEditResult } from 'claude-code';
import { fitActivity, shoot } from '../hooks/model';
import { register } from '../hooks/register';
import { frame, textW as actualTextW } from '../hooks/field';
import { animate, createRuntime, scene, updateShot } from '../hooks/runtime';
import { pickSport, SPORTS } from '../hooks/sports';
import { decode, expectedPixels, expectedSky, textW } from './design';

const test = (name: string, body: TestBody) => pluginTest(name, { options: { language: 'ko' } }, body);

const props = { word: 'Working', message: null, suffix: '…', mode: 'thinking' as const };
const keyHints = {
  kick: ' Space  슛   2  야구   3  3점슛 콘테스트   9  멈춤',
  bat: ' Space  스윙   1  승부차기   3  3점슛 콘테스트   9  멈춤',
  bb: ' Space  슛   1  승부차기   2  야구   9  멈춤',
};
const gameNames = { kick: '승부차기', bat: '야구', bb: '3점슛 콘테스트' };
function board(sport: typeof SPORTS[number], totals: string, activity = '생각 중') {
  return `Claude ${activity}${gameNames[sport]} │ ${totals}${keyHints[sport]}`;
}
const engineTree: RenderElement = { type: 'engine', ref: 0 };
function setup(on: On, entries: Record<string, unknown> = {}, theme = 'dark') {
  const clock = mock.clock(on), store: Record<string, unknown> = { ...entries };
  const faults = { sport: false, sportDelay: 0, probe: false, probeDelay: 0, deleteDelay: 0, config: false, invalidate: false, blit: '' };
  const observed = { storeGets: [] as string[], storeSets: [] as string[], storeDeletes: [] as string[], commandDefinitions: [] as { description?: string; argumentHint?: string }[], renders: 0, editResult: undefined as PromptEditResult | undefined };
  const blits: { at: number; cells: string; requestId?: string }[] = [], commands: string[] = [], edits: string[] = [];
  on('store.get', ($, e) => { observed.storeGets.push(e.key); return { value: store[e.key] }; });
  on('store.set', async ($, e) => {
    observed.storeSets.push(e.key);
    if (e.key === 'probe') {
      if (faults.probeDelay) await clock.sleep(faults.probeDelay);
      if (faults.probe) throw new Error('probe write failed');
      store[e.key] = JSON.parse(JSON.stringify(e.value));
    } else {
      if (e.key === 'sport') {
        if (faults.sportDelay) await clock.sleep(faults.sportDelay);
        if (faults.sport) throw new Error('sport write failed');
      }
      store[e.key] = JSON.parse(JSON.stringify(e.value));
    }
    return { value: undefined };
  });
  on('store.delete', async ($, e) => { observed.storeDeletes.push(e.key); if (faults.deleteDelay) await clock.sleep(faults.deleteDelay); delete store[e.key]; return { value: undefined }; });
  on('session.start', ($, e) => ({ cwd: e.cwd }));
  on('session.end', ($, e) => ({ sessionId: e.sessionId }));
  on('command.register', ($, e) => { commands.push(e.name); observed.commandDefinitions.push(e); return { value: { command: e.name } }; });
  on('turn.start', ($, e) => ({ turnId: e.turnId }));
  on('turn.complete', ($, e) => ({ text: e.answer }));
  on('config.list', () => { if (faults.config) throw new Error('config unavailable'); return { value: [{ key: 'theme', value: theme, kind: 'text', label: 'Theme', provider: { plugin: 'engine', tier: 'core' }, isLocked: false }] }; });
  on('ui.render', () => { observed.renders++; return engineTree; });
  on('ui.blit', ($, e) => { if (faults.blit === 'throw') throw new Error('blit failed'); if (faults.blit === 'deny') return { value: { deny: 'unmounted' } }; if ('cells' in e) blits.push({ at: clock.now(), cells: e.cells }); return { value: {} }; });
  on('prompt.edit', ($, e) => { edits.push(e.inputText); return observed.editResult ?? { text: e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end), cursor: e.start + e.inputText.length }; });
  return { clock, store, blits, commands, edits, faults, observed };
}
const start = ($: Engine, turnId = 'main') => $.turn.start({ turnId, text: 'work' });
const complete = ($: Engine, turnId = 'main') => $.turn.complete({ turnId, answer: 'done', durationMs: 100, isAborted: false, reason: 'answer' });
const session = ($: Engine) => $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true });
const command = ($: Engine, args = '') => $.command.run({ command: 'clutch', args, origin: { kind: 'composer' }, presentation: { columns: 80, isFullscreen: true } });
function edit($: Engine, inputText: string, text = '', key: boolean | string = true) {
  // 2.1.295 declares the event but omits its testing noun; 2.1.302 dispatches it.
  return ($.prompt as typeof $.prompt & { edit: (e: PromptEditInput) => Promise<PromptEditResult> }).edit({ origin: { kind: 'composer' }, text, cursor: text.length, start: text.length, end: text.length, inputText, ...(key ? { key: { key: typeof key === 'string' ? key : inputText } } : {}) });
}
function mount($: Engine, columns: number | undefined = 80, surface: RenderSurface = 'terminal', requestId = 'spinner') {
  return $.ui.mount({ plugin: 'clutch', surface, requestId, component: 'Spinner', props,
    ...(columns === undefined ? {} : { viewport: { columns, rows: 40, isFullscreen: true } }) });
}
function text(tree: RenderElement | string): string {
  if (typeof tree === 'string') return tree;
  return 'children' in tree ? (tree.children ?? []).map(text).join('') : '';
}
function leaves(tree: RenderElement): RenderElement[] {
  if (tree.type !== 'Box') return [tree];
  return (tree.children ?? []).flatMap(child => typeof child === 'string' ? [] : leaves(child));
}
async function raster(ui: { find(query: { type: string }): Promise<{ props: Record<string, unknown> } | undefined> }) {
  const result = await ui.find({ type: 'Raster' });
  expect(result).toBeDefined();
  return String(result!.props.cells);
}

test('C4 exact design pixels, glyph encoding, tree order and aligned center', async ($, on) => {
  const h = setup(on); const pk = injected(h, goalLeft, 'dark', undefined, () => 0); await pk.session(); await pk.start();
  const ui = await pk.mount(), tree = await ui.drawn(), found = leaves(tree);
  expect(found.map(e => e.type)).toEqual(['engine', 'Text', 'Text', 'Text', 'Raster']);
  expect(found[0]).toEqual(engineTree);
  expect(found[4]).toMatchObject({ props: { key: 'field', columns: 60, rows: 9 } });
  const decoded = decode(await raster(ui));
  expect(decoded.pixels).toEqual(expectedPixels());
  expect(decoded.byteLength).toBe(6480);
  expect(decoded.glyphs.every(c => c === 32 || c === 0x2580)).toBe(true);
  expect(decoded.pairs < 1024).toBe(true);
  const containers = (await ui.findAll({ type: 'Box' })).filter(e => e.props.marginLeft !== undefined);
  expect(containers.map(e => e.props.marginLeft)).toEqual([7, 7, 7, 7]);
});
for (const columns of [65, 66, undefined]) {
  test(`C5 width boundary ${columns ?? 'absent'}`, async ($, on) => {
    setup(on); await session($); await start($);
    // Explicitly omit viewport for the absent case (default arguments otherwise mean 80).
    const ui = columns === undefined ? await $.ui.mount({ plugin: 'clutch', surface: 'terminal', requestId: 'spinner', component: 'Spinner', props }) : await mount($, columns);
    expect((await ui.findAll({ type: 'Raster' })).length).toBe(columns === 65 ? 0 : 1);
    if (columns === 65) expect(text(await ui.drawn())).toBe('Claude 생각 중터미널을 넓히면 게임이 나옵니다');
  });
}
test('C5 desktop passes engine tree through', async ($, on) => {
  setup(on); await session($); await start($);
  expect(await (await mount($, 80, 'desktop')).drawn()).toEqual(engineTree);
});
test('C6 toggle persists and every gameplay hook passes through while disabled', async ($, on) => {
  const h = setup(on); await session($); await start($); const ui = await mount($);
  expect(h.commands).toEqual(['clutch']);
  expect((await command($)).text).toBe('clutch 꺼짐'); expect(h.store.enabled).toBe(false);
  await ui.redraw(props); expect(await ui.drawn()).toEqual(engineTree);
  expect(await edit($, ' ')).toEqual({ text: ' ', cursor: 1 });
  await complete($); await start($, 'off');
  expect((await command($)).text).toBe('clutch 켜짐'); expect(h.store.enabled).toBe(true);
  await ui.redraw(props); expect(await ui.find({ type: 'Raster' })).toBeDefined();
  // A turn completed while disabled must not remain eligible after re-enable.
  expect(await edit($, ' ')).toEqual({ text: ' ', cursor: 1 });
});
test('C6 saved disabled state and unknown commands', async ($, on) => {
  const h = setup(on, { enabled: false }); await session($); await start($);
  expect(await (await mount($)).drawn()).toEqual(engineTree);
  expect((await command($, 'wrong')).text).toContain('사용법:'); expect(h.store.enabled).toBe(false);
});
for (const input of [' ', '   ', '1', '2', '3']) {
  test(`C7 swallows eligible ${JSON.stringify(input)}`, async ($, on) => {
    const h = setup(on); await session($); await start($); await mount($);
    expect(await edit($, input, '', input !== '   ')).toEqual({ text: '', cursor: 0 });
    expect(h.edits).toEqual([]);
  });
}
for (const [input, draft] of [[' a', ''], ['x', ''], [' ', 'draft'], ['\t', ''], ['\n', ''], ['', '']]) {
  test(`C7 passes through input ${JSON.stringify(input)} draft ${draft}`, async ($, on) => {
    const h = setup(on); await session($); await start($); await mount($);
    expect(await edit($, input!, draft!)).toEqual({ text: draft! + input!, cursor: draft!.length + input!.length });
    expect(h.edits).toEqual([input]);
  });
}
for (const context of ['outside', 'not-drawn', 'narrow', 'subagent']) {
  test(`C7 passes through when ${context}`, async ($, on) => {
    const h = setup(on); await session($);
    if (context === 'subagent') {
      // API type omits agentId; a future/extended host event is structurally assignable.
      const event = { turnId: 'sub', text: 'work', agentId: 'worker' }; await $.turn.start(event);
    } else if (context !== 'outside') await start($);
    if (context !== 'not-drawn') await mount($, context === 'narrow' ? 65 : 80);
    expect(await edit($, ' ')).toEqual({ text: ' ', cursor: 1 }); expect(h.edits).toEqual([' ']);
  });
}
const goalLeft = [.5, .5, 0, 0, 0];
test('C8 K4 flight, exact landing and return, repeated spaces and no hold/idle blits', async ($, on) => {
  const h = setup(on), pk = injected(h, goalLeft); await pk.start(); const ui = await pk.mount();
  await h.clock.advance(500); expect(h.blits).toHaveLength(0);
  { const calls = pk.calls;
    await pk.edit(' '); expect(calls()).toBe(5);
    for (const [elapsed, x, y, ghost, keeper] of [
      [0, 28, 15, [], ['keeper', 27, 3]],
      [99, 24, 11, [[26, 12], [27, 14]], ['keeper', 27, 3]],
      [100, 24, 11, [[26, 12], [27, 14]], ['kdiveR', 34, 6]],
      [125, 23, 10, [[25, 11], [26, 13]], ['kdiveR', 34, 6]],
    ] as const) {
      await h.clock.set(500 + elapsed); await ui.redraw(props);
      expect(decode(await raster(ui)).pixels).toEqual(expectedPixels(x, y, { kick: true,
        ghost: ghost.map(([a, b]) => [a, b]), keeper: [...keeper] }));
    }
    await pk.edit(' '); expect(calls()).toBe(5);
    await h.clock.set(750); await ui.redraw(props);
    const landing = expectedPixels(18, 4, { kick: true, keeper: ['kdiveR', 34, 6], cheer: true, rip: [19, 5], text: { value: 'GOOOOOOOAL!!!!!!!', stage: 0, tone: 'good' } });
    expect(decode(await raster(ui)).pixels).toEqual(landing);
    expect(h.blits.at(-1)!.at).toBe(750);
    expect(decode(h.blits.at(-1)!.cells).pixels).toEqual(landing);
    const count = h.blits.length;
    await h.clock.set(2249); await ui.redraw(props);
    expect(decode(await raster(ui)).pixels).toEqual(expectedPixels(18, 4, { kick: true, keeper: ['kdiveR', 34, 6], cheer: true, rip: [19, 5], text: { value: 'GOOOOOOOAL!!!!!!!', stage: 1, tone: 'good' } })); expect(h.blits.length).toBe(count + 1);
    await h.clock.set(2250); await ui.redraw(props);
    expect(h.blits.at(-1)!.at).toBe(2250);
    expect(decode(await raster(ui)).pixels).toEqual(expectedPixels());
    await h.clock.advance(1000); expect(h.blits.length).toBe(count + 2);
    expect(count >= 3).toBe(true);
    expect(h.blits.slice(1).every((b, i) => b.at - h.blits[i]!.at >= 33)).toBe(true);
  }
});
test('C8 K6 batched spaces trigger one flight and locked input draws no random numbers', async ($, on) => {
  const h = setup(on), pk = injected(h, goalLeft); await pk.start(); const ui = await pk.mount();
  { const calls = pk.calls;
    expect(await pk.edit('   ', '', false)).toEqual({ text: '', cursor: 0 }); expect(calls()).toBe(5);
    for (const elapsed of [0, 100, 249, 250, 1749]) {
      await h.clock.set(elapsed);
      for (const input of [' ', '   ', '1', '2', '3']) expect(await pk.edit(input)).toEqual({ text: '', cursor: 0 });
      expect(calls()).toBe(5); await ui.redraw(props);
      expect(text(await ui.drawn())).toBe(elapsed < 250
        ? board('kick', '골 0 · 선방 0 · 빗나감 0', '생각 중')
        : board('kick', '골 1 · 선방 0 · 빗나감 0', '생각 중'));
    }
    await h.clock.set(1750); expect(await pk.edit('0')).toEqual({ text: '0', cursor: 1 }); await ui.redraw(props);
    expect(text(await ui.drawn())).toBe(board('kick', '골 1 · 선방 0 · 빗나감 0'));
    expect(calls()).toBe(5);
  }
});
for (const theme of ['light', 'dark', 'light-daltonized']) {
  test(`C10 exact labels and theme ${theme}`, async ($, on) => {
    const h = setup(on, {}, theme); const pk = injected(h, goalLeft, theme, undefined, () => 0); await pk.session(); await pk.start(); const ui = await pk.mount();
    expect(text(await ui.drawn())).toBe(board('kick', '골 0 · 선방 0 · 빗나감 0', '생각 중'));
    expect((await ui.find({ type: 'Text', text: 'Claude' }))?.props.color).toBe(theme.startsWith('light') ? '#B5502D' : '#D97757');
    await pk.complete();
  });
}
test('C10 config failure falls back to dark', async ($, on) => {
  const h = setup(on); h.faults.config = true; await session($); await start($);
  const ui = await mount($); expect(styled(leaves(await ui.drawn())[1]!).slice(0, 6).map(c => c.color)).toEqual(Array(6).fill('#D97757'));
});

test('C11 gameplay and tools preserve legacy calibration and enabled state', async ($, on) => {
  const saved = { offsetMs: 40, iqrMs: 5, samples: 10, measuredAt: '2026-10-18T00:00:00.000Z' };
  const h = setup(on, { enabled: true, calibration: saved });
  on('tool.check', () => ({ decision: 'ask', reason: 'permission' }));
  on('tool.call', async () => { await h.clock.sleep(100); return { result: 'ok' }; });
  await session($); await start($); const ui = await mount($);
  // Keep this host integration scenario on kick.
  await edit($, '1'); await h.clock.settle(); await command($, 'probe reset');
  h.observed.renders = 0; await ui.redraw(props);
  await edit($, ' '); await edit($, '   ', '', false); await edit($, 'x', ' x');
  await h.clock.advance(300);
  expect(h.blits.length >= 3).toBe(true);
  await $.tool.check({ tool: 'Bash', input: { command: 'pwd' }, tool_use_id: 'permission' });
  const permission = $.tool.call({ tool: 'Bash', command: 'pwd', tool_use_id: 'permission' });
  await h.clock.settle(); await ui.redraw(props); await ui.redraw(props); await edit($, 'x');
  await h.clock.advance(100); await permission;
  const question = $.tool.call({ tool: 'AskUserQuestion', tool_use_id: 'question', questions: [{ question: 'Which?', header: 'Choice', options: [{ label: 'A', description: 'A' }, { label: 'B', description: 'B' }], multiSelect: false }] });
  await h.clock.settle(); await ui.redraw(props); await ui.redraw(props); await edit($, 'x');
  await h.clock.advance(100); await question;
  await complete($); await start($, 'narrow'); await ui.unmount(); await mount($, 65);
  await command($, 'probe reset');
  expect(h.store.calibration).toEqual(saved); expect(h.store.enabled).toBe(true);
});
test('C11 calibration survives a new session', async ($, on) => {
  const saved = { offsetMs: -40, iqrMs: 5, samples: 10, measuredAt: '2026-10-18T00:00:00.000Z' };
  const h = setup(on, { calibration: saved }); await session($); await start($); await mount($); await edit($, ' ');
  await complete($); await session($);
  expect(h.store.calibration).toEqual(saved);
});
for (const decision of ['allow', 'deny', 'ask'] as const) {
  for (const fail of [false, true]) {
    test(`C12 tool.check ${decision} unchanged with probe failure ${fail}`, async ($, on) => {
      const h = setup(on); let calls = 0;
      const result = { decision, reason: 'unchanged', rule: 'Bash(pwd)' };
      on('tool.check', () => { calls++; return result; });
      await session($); h.faults.probe = fail;
      expect(await $.tool.check({ tool: 'Bash', input: { command: 'pwd' }, tool_use_id: 'check' })).toEqual(result);
      expect(calls).toBe(1);
    });
  }
}
for (const fail of [false, true]) {
  test(`C12 tool.call unchanged with probe failure ${fail}`, async ($, on) => {
    const h = setup(on); let calls = 0;
    const result = { result: { answers: { Which: 'A' } }, text: 'unchanged' };
    on('tool.call', () => { calls++; return result; }); await session($); h.faults.probe = fail;
    expect(await $.tool.call({ tool: 'AskUserQuestion', questions: [] })).toEqual(result); expect(calls).toBe(1);
  });
}
test('C12 tool failure propagates after permission and prompt edits', async ($, on) => {
  const h = setup(on);
  on('tool.check', () => ({ decision: 'ask' }));
  on('tool.call', () => { throw new Error('tool failure'); });
  await session($); await start($); const ui = await mount($);
  await $.tool.check({ tool: 'Bash', input: {}, tool_use_id: 'failed' });
  await edit($, 'a');
  let failed = false;
  try { await $.tool.call({ tool: 'Bash', command: 'pwd', tool_use_id: 'failed' }); } catch { failed = true; }
  expect(failed).toBe(true);
  await ui.redraw(props); await edit($, 'a');
});
for (const cause of ['narrow', 'desktop', 'disabled', 'complete']) {
  test(`C13 ${cause === 'desktop' ? 'keeps' : 'stops'} pending animation when ${cause}`, async ($, on) => {
    const h = setup(on); await session($); await start($); await mount($); await edit($, '1'); await edit($, ' ');
    await h.clock.advance(100);
    if (cause === 'narrow') await mount($, 65, 'terminal', 'narrow');
    if (cause === 'desktop') await mount($, 80, 'desktop');
    if (cause === 'disabled') await command($);
    if (cause === 'complete') await complete($);
    const count = h.blits.length; await h.clock.advance(1000);
    if (cause === 'desktop') {
      expect(h.blits.length).toBeGreaterThan(count);
      expect(await edit($, ' ')).toEqual({ text: '', cursor: 0 });
    } else {
      expect(h.blits.length).toBe(count);
      expect(await edit($, ' ')).toEqual({ text: ' ', cursor: 1 });
    }
  });
}
for (const fault of ['throw', 'deny']) {
  test(`C11 C13 blit ${fault} stops hidden field loop`, async ($, on) => {
    const h = setup(on); await session($); await start($); await mount($); await edit($, '1'); await edit($, ' ');
    h.faults.blit = fault; await h.clock.advance(1000);
    expect(await edit($, ' ')).toEqual({ text: ' ', cursor: 1 });
  });
}
test('U3 full session accesses only sport and enabled and leaves legacy data untouched', async ($, on) => {
  const legacy = { p1: { received: 7, swallowed: 2 } };
  const h = setup(on, { probe: legacy });
  const permission = { decision: 'ask' as const, reason: 'permission' }, result = { result: 'unchanged' };
  on('tool.check', () => permission);
  on('tool.call', async () => { await h.clock.sleep(100); return result; });
  await session($); await start($); const ui = await mount($);
  for (const [key, sport] of [['1', 'kick'], ['2', 'bat'], ['3', 'bb']] as const) {
    expect(await edit($, key)).toEqual({ text: '', cursor: 0 });
    await ui.redraw(props); expect(text(await ui.drawn())).toContain(gameNames[sport]);
    const blits = h.blits.length;
    expect(await edit($, ' ')).toEqual({ text: '', cursor: 0 });
    await h.clock.advance(4000);
    expect(h.blits.length).toBeGreaterThan(blits);
  }
  expect(await $.tool.check({ tool: 'Bash', input: { command: 'pwd' }, tool_use_id: 'permission' })).toEqual(permission);
  const call = $.tool.call({ tool: 'Bash', command: 'pwd', tool_use_id: 'permission' });
  await h.clock.settle();
  expect(await edit($, ' ')).toEqual({ text: '', cursor: 0 });
  await h.clock.advance(4000); expect(await call).toEqual(result);
  const question = $.tool.call({ tool: 'AskUserQuestion', questions: [], tool_use_id: 'question' });
  await h.clock.settle();
  expect(await edit($, ' ')).toEqual({ text: '', cursor: 0 });
  await h.clock.advance(100); expect(await question).toEqual(result);
  expect(await edit($, '9')).toEqual({ text: '', cursor: 0 });
  await ui.redraw(props); expect(text(await ui.drawn())).toContain('clutch 멈춤');
  expect(await edit($, ' ')).toEqual({ text: ' ', cursor: 1 });
  expect((await command($)).text).toBe('clutch 꺼짐');
  expect((await command($)).text).toBe('clutch 켜짐');
  for (const args of ['probe', 'probe reset', 'x']) expect((await command($, args)).text).toBe('사용법: /clutch (켜기·끄기)');
  await complete($); await session($);
  expect([...new Set(h.observed.storeGets)].sort()).toEqual(['enabled', 'sport']);
  expect([...new Set(h.observed.storeSets)].sort()).toEqual(['enabled', 'sport']);
  expect(h.observed.storeDeletes).toEqual([]);
  expect(h.store.probe).toEqual(legacy);
  expect(h.store.enabled).toBe(true); expect(h.store.sport).toBe('bb');
});

test('C14 normal gameplay and commands require no external operations', async ($, on) => {
  const h = setup(on); let external = 0;
  // The test world has no network/model/process/fs implementations; any attempted call fails.
  on('http.fetch', () => { external++; throw new Error('external call'); });
  on('process.run', () => { external++; throw new Error('external call'); });
  on('fs.read', () => { external++; throw new Error('external call'); });
  await session($); await start($); await mount($); await edit($, ' '); await h.clock.advance(1750);
  await edit($, '0'); await h.clock.advance(100); await edit($, ' '); await command($, 'probe'); await complete($);
  expect(external).toBe(0); expect(h.blits.length > 0).toBe(true);
});
// A blocked call fails here without advancing time or waiting for a real timeout.
async function withoutAdvancing<T>(clock: MockClock, pending: Promise<T>): Promise<T> {
  let settled = false;
  void pending.then(() => { settled = true; }, () => { settled = true; });
  await clock.settle();
  expect(settled).toBe(true);
  return pending;
}
for (const fault of ['delay', 'failure']) {
  for (const route of ['edit-outside', 'edit-active', 'spinner', 'narrow', 'desktop', 'tool.check', 'tool.call']) {
    test(`R1 ${route} returns without waiting for probe ${fault}`, async ($, on) => {
      const h = setup(on);
      const permission = { decision: 'ask' as const, reason: 'unchanged' }, tool = { result: 'unchanged' };
      on('tool.check', () => permission); on('tool.call', () => tool);
      await session($);
      // The spinner route drives an injected runtime; a host turn would store a random `sport` that the injected session then excludes.
      if (route !== 'edit-outside' && route !== 'spinner') await start($);
      if (route === 'edit-active') await mount($);
      const pk = route === 'spinner' ? injected(h, goalLeft, 'dark', undefined, () => 0) : undefined;
      if (pk) { await pk.session(); await pk.start(); }
      await h.clock.settle();
      h.faults.probe = fault === 'failure'; h.faults.probeDelay = fault === 'delay' ? 1000 : 0;
      if (route === 'edit-outside' || route === 'edit-active') {
        expect(await withoutAdvancing(h.clock, edit($, ' '))).toEqual(route === 'edit-active' ? { text: '', cursor: 0 } : { text: ' ', cursor: 1 });
      } else if (route === 'tool.check') {
        expect(await withoutAdvancing(h.clock, $.tool.check({ tool: 'Bash', input: {}, tool_use_id: 'ask' }))).toEqual(permission);
      } else if (route === 'tool.call') {
        expect(await withoutAdvancing(h.clock, $.tool.call({ tool: 'AskUserQuestion', questions: [] }))).toEqual(tool);
      } else {
        const ui = pk ? await withoutAdvancing(h.clock, pk.mount()) : await withoutAdvancing(h.clock, mount($, route === 'narrow' ? 65 : 80, route === 'desktop' ? 'desktop' : 'terminal'));
        if (route === 'desktop') expect(await ui.drawn()).toEqual(engineTree);
        else if (route === 'narrow') expect(text(await ui.drawn())).toBe('Claude 생각 중터미널을 넓히면 게임이 나옵니다');
        else expect(decode(await raster(ui)).pixels).toEqual(expectedPixels());
      }
      expect(h.clock.now()).toBe(0);
      await complete($); await h.clock.advance(2000);
    });
  }
}
for (const fault of ['delay', 'failure']) {
  test(`R1 frame loop keeps blitting with legacy storage ${fault}`, async ($, on) => {
    const h = setup(on); await session($); await start($); await mount($);
    h.faults.probeDelay = fault === 'delay' ? 1000 : 0; h.faults.probe = fault === 'failure';
    await withoutAdvancing(h.clock, edit($, '1')); await withoutAdvancing(h.clock, edit($, ' '));
    await h.clock.advance(300);
    expect(h.blits.length >= 3).toBe(true);
    expect(h.blits.slice(1).every((b, i) => b.at - h.blits[i]!.at >= 33)).toBe(true);
    await complete($); await h.clock.advance(2000);
  });
}
for (const duringReset of [false, true]) {
  test(`R1 removed reset command preserves legacy settings: ${duringReset}`, async ($, on) => {
    const calibration = { offsetMs: 40, iqrMs: 5, samples: 10, measuredAt: '2026-10-18T00:00:00.000Z' };
    const h = setup(on, { enabled: true, calibration }); await session($); await start($); await mount($);
    await h.clock.settle(); h.faults.probeDelay = 1000; h.faults.deleteDelay = 1000;
    await withoutAdvancing(h.clock, edit($, 'x')); await withoutAdvancing(h.clock, edit($, 'x'));
    const reset = command($, 'probe reset'); await h.clock.settle();
    await h.clock.advance(1000);
    if (duringReset) await withoutAdvancing(h.clock, edit($, 'x'));
    await h.clock.advance(1000); await reset;
    await h.clock.advance(2000);
    expect(h.store.calibration).toEqual(calibration); expect(h.store.enabled).toBe(true);
  });
}

for (const input of ['w', 'a', 's', 'd', 'W', 'A', 'S', 'D', 'ㅈ', 'ㅉ', 'ㅁ', 'ㄴ', 'ㅇ', 'aa', 'ㅁa', 'AA']) {
  test(`C24 K7 delegates same-direction input ${input}`, async ($, on) => {
    const h = setup(on); await session($); await start($); await mount($);
    const result = { text: 'engine result', cursor: 4 }; h.observed.editResult = result;
    expect(await edit($, input)).toEqual(result);
    expect(h.edits).toEqual([input]);
  });
}
test('C24 inputText determines direction even without key metadata', async ($, on) => {
  const h = setup(on); const pk = injected(h, goalLeft, 'dark', undefined, () => 0); await pk.session(); await pk.start(); const ui = await pk.mount();
  expect(await pk.edit('ㅁa', '', false)).toEqual({ text: 'ㅁa', cursor: 2 });
  await ui.redraw(props); expect(decode(await raster(ui)).pixels).toEqual(expectedPixels(28, 15));
  expect(h.edits).toEqual(['ㅁa']);
});
for (const input of ['ad', 'ax', 'ㅏ', 'x', 'a ', '', 'a\n', 'a😀']) {
  test(`C24 delegates mixed or unsupported input ${JSON.stringify(input)}`, async ($, on) => {
    const h = setup(on); const pk = injected(h, goalLeft, 'dark', undefined, () => 0); await pk.session(); await pk.start(); const ui = await pk.mount();
    const result = { text: 'engine result', cursor: 4 }; h.observed.editResult = result;
    expect(await pk.edit(input)).toEqual(result);
    expect(h.edits).toEqual([input]);
    await ui.redraw(props); expect(decode(await raster(ui)).pixels).toEqual(expectedPixels());
    expect(text(await ui.drawn())).toContain('골 0 · 선방 0 · 빗나감 0');
  });
}
for (const context of ['draft', 'outside', 'narrow', 'disabled', 'not-drawn', 'subagent']) {
  test(`C24 delegates exact next result for ${context}`, async ($, on) => {
    const h = setup(on, { enabled: context !== 'disabled' });
    const result = { text: 'engine cursor/history result', cursor: 7 };
    h.observed.editResult = result;
    await session($);
    if (context === 'subagent') { const event = { turnId: 'sub', text: 'work', agentId: 'worker' }; await $.turn.start(event); }
    else if (context !== 'outside') await start($);
    if (context !== 'not-drawn') await mount($, context === 'narrow' ? 65 : 80);
    expect(await edit($, context === 'narrow' ? 'd' : 'a', context === 'draft' ? 'abc' : '')).toEqual(result);
    expect(h.edits).toEqual([context === 'narrow' ? 'd' : 'a']);
  });
}
test('C25 K7 WASD never moves the ball before, during or after a shot; next turn resets', async ($, on) => {
  const h = setup(on), pk = injected(h, goalLeft); await pk.start(); const ui = await pk.mount();
  const result = { text: 'engine result', cursor: 4 }; h.observed.editResult = result;
  {
    for (const elapsed of [0, 125, 250, 1749, 1750]) {
      await h.clock.set(elapsed); await ui.redraw(props); const before = await raster(ui);
      for (const key of ['a', 'ㅁ', 'd', 'w', 'aa', 'Dㅇ'.repeat(30)]) expect(await pk.edit(key)).toEqual(result);
      await ui.redraw(props); expect(await raster(ui)).toBe(before);
      if (elapsed === 0) await pk.edit(' ');
    }
  }
  await pk.complete(); await pk.start('new'); await ui.redraw(props);
    expect(pk.b.mode).toBe('bat'); await pk.edit('1'); await ui.redraw(props);
  expect(decode(await raster(ui)).pixels).toEqual(expectedPixels());
  expect(text(await ui.drawn())).toBe(board('kick', '골 0 · 선방 0 · 빗나감 0', '생각 중'));
});
test('C25 K7 Hangul and repeated letters pass through without changing position', async ($, on) => {
  const h = setup(on); const pk = injected(h, goalLeft, 'dark', undefined, () => 0); await pk.session(); await pk.start(); const ui = await pk.mount();
  for (const input of ['ㅁ', 'aa', 'D', 'ㅇ', 'ㅁa', 'a'.repeat(50), 'Dㅇ'.repeat(30)]) {
    expect(await pk.edit(input)).toEqual({ text: input, cursor: input.length }); await ui.redraw(props);
    expect(decode(await raster(ui)).pixels).toEqual(expectedPixels());
  }
});
for (const key of ['left', 'right', 'up', 'down'] as const) {
  test(`C26 ${key} delegates without moving or swallowing`, async ($, on) => {
    const h = setup(on); const pk = injected(h, goalLeft, 'dark', undefined, () => 0); await pk.session(); await pk.start(); const ui = await pk.mount();
    const result = { text: 'engine history/cursor', cursor: 7 }; h.observed.editResult = result;
    // Even conflicting inputText must not turn an arrow event into a game action.
    for (const input of ['', 'a', ' ', '2']) expect(await pk.edit(input, '', key)).toEqual(result);
    expect(h.edits).toEqual(['', 'a', ' ', '2']);
    await ui.redraw(props); expect(decode(await raster(ui)).pixels).toEqual(expectedPixels());
    expect(text(await ui.drawn())).toContain('승부차기 │ 골 0 · 선방 0 · 빗나감 0');
  });
}
test('C25 vertical WASD never moves the ball horizontally', async ($, on) => {
  const h = setup(on); const pk = injected(h, goalLeft, 'dark', undefined, () => 0); await pk.session(); await pk.start(); const ui = await pk.mount();
  await pk.edit('a');
  for (const key of ['w', 's']) {
    expect(await pk.edit(key)).toEqual({ text: key, cursor: key.length });
    await ui.redraw(props); expect(decode(await raster(ui)).pixels).toEqual(expectedPixels(28, 15));
  }
});
for (const theme of ['dark', 'light']) {
  test(`C27 K5 exact scoreboard, landing totals and result colors ${theme}`, async ($, on) => {
    const h = setup(on, {}, theme), pk = injected(h, [...goalLeft, .5, 0, 0, 0, 0, 0, 0, 0, 0, 0], theme);
    await pk.start(); const ui = await pk.mount();
    expect(text(await ui.drawn())).toBe(board('kick', '골 0 · 선방 0 · 빗나감 0'));
    {
      for (const [i, totals] of [
        [0, '골 1 · 선방 0 · 빗나감 0'],
        [1, '골 1 · 선방 1 · 빗나감 0'],
        [2, '골 1 · 선방 1 · 빗나감 1'],
      ] as const) {
        await pk.edit(' '); await h.clock.set(i * 1750 + 249); await ui.redraw(props);
        expect(text(await ui.drawn())).toContain(keyHints.kick);
        await h.clock.advance(1); await ui.redraw(props);
        expect(text(await ui.drawn())).toBe(board('kick', totals));
        expect((await ui.find({ type: 'Text', text: '승부차기' }))?.props.color).toBe(theme === 'dark' ? '#F4F1EA' : '#111418');
        expect((await ui.find({ type: 'Text', text: ' │ ' }))?.props.color).toBe(theme === 'dark' ? '#7D8590' : '#6E7781');
        await h.clock.set((i + 1) * 1750); await ui.redraw(props);
        expect(text(await ui.drawn())).toBe(board('kick', totals));
      }
    }
    await pk.complete(); await pk.start('new'); await ui.redraw(props);
    expect(pk.b.mode).toBe('bat'); await pk.edit('1'); await ui.redraw(props);
    expect(text(await ui.drawn())).toBe(board('kick', '골 0 · 선방 0 · 빗나감 0'));
  });
}
for (const partial of [undefined, {}, { left: 4 }, { other: { home: 2 } }]) {
  test(`C21 arrows delegate with untouched legacy data: ${JSON.stringify(partial)}`, async ($, on) => {
    const h = setup(on, { probe: { ...(partial === undefined ? {} : { p7: partial }) } });
    await session($);
    await start($); await mount($);
    expect(await edit($, '', '', 'right')).toEqual({ text: '', cursor: 0 });
  });
}
for (const fault of ['delay', 'failure']) {
  test(`C24 R1 WASD returns without waiting for probe ${fault}`, async ($, on) => {
    const h = setup(on); const pk = injected(h, goalLeft, 'dark', undefined, () => 0); await pk.session(); await pk.start(); const ui = await pk.mount(); await h.clock.settle();
    h.faults.probeDelay = fault === 'delay' ? 1000 : 0; h.faults.probe = fault === 'failure';
    expect(await withoutAdvancing(h.clock, pk.edit('ㅁ'))).toEqual({ text: 'ㅁ', cursor: 1 });
    await ui.redraw(props); expect(decode(await raster(ui)).pixels).toEqual(expectedPixels(28, 15));
    expect(h.clock.now()).toBe(0);
    await h.clock.advance(2000);
  });
}

// Exercise the real register hooks with an injected runtime: the host sandbox freezes Math.random.
type Timing = { late: number[]; scheduled: number[]; invalidated: number[] };
function injected(h: ReturnType<typeof setup>, values: number[], theme = 'dark', timing?: Timing, selectionRandom?: () => number) {
  let count = 0;
  const b = createRuntime(() => values[count++ % values.length]!, () => selectionRandom ? selectionRandom() : SPORTS.indexOf(b.sport) / SPORTS.length);
  const hooks: Record<string, (...args: any[]) => any> = {};
  register(((name: string, ...args: any[]) => {
    hooks[name] = args.at(-1); return { catch() {} };
  }) as On, { language: 'ko' }, b);
  const api = testAPI(h, theme, timing);
  let dirty = false;
  const invalidate = api.ui.invalidate;
  api.ui.invalidate = event => { dirty = true; invalidate(event); };
  const run = (name: string, event: any, next = (e: any) => e) => hooks[name]!(api, event, next);
  return {
    b, run, calls: () => count,
    session: () => run('session.start', {}),
    start: (turnId = 'main') => run('turn.start', { turnId }),
    complete: () => run('turn.complete', { turnId: b.turn }),
    edit: (inputText: string, text = '', key: boolean | string = true) => run('prompt.edit', {
      inputText, text, cursor: text.length, start: text.length, end: text.length,
      ...(key ? { key: { key: typeof key === 'string' ? key : inputText } } : {}),
    }, () => { h.edits.push(inputText); return h.observed.editResult ?? { text: text + inputText, cursor: text.length + inputText.length }; }),
    mount: async (initialProps: typeof props | { mode: string } = props, requestId = 'injected', columns = 80) => {
      let tree: RenderElement;
      const redraw = async (renderProps = initialProps) => { tree = await run('ui.render', { surface: 'terminal', requestId, viewport: { columns }, component: 'Spinner', props: renderProps }, () => engineTree); dirty = false; };
      const all = (node: RenderElement): RenderElement[] => [node, ...('children' in node ? (node.children ?? []).flatMap(c => typeof c === 'string' ? [] : all(c)) : [])];
      await redraw();
      return { redraw, drawn: async () => { if (dirty) await redraw(); return tree; },
        findAll: async (query: { type: string }) => all(tree).filter(n => n.type === query.type).map(n => ({ props: 'props' in n ? n.props as Record<string, unknown> : {} })),
        find: async (query: { type: string; text?: string }) => {
        const nodes = all(tree).filter(n => n.type === query.type);
        const found = query.text === undefined ? nodes[0] : nodes.find(n => text(n) === query.text) ?? nodes.find(n => text(n).includes(query.text!));
        return found && 'props' in found ? { props: found.props as Record<string, unknown> } : undefined;
      } };
    },
  };
}
function testAPI(h: ReturnType<typeof setup>, theme = 'dark', timing?: Timing) {
  return {
    clock: {
      now: async () => h.clock.now(),
      every: (ms: number, callback: () => void) => {
        // Animation lateness fixtures do not delay the independent rotation timer.
        if (ms < 60000) timing?.scheduled.push(ms);
        const wait = ms + (ms < 60000 ? timing?.late.shift() ?? 0 : 0);
        let active = true;
        void (async () => { while (active) { await h.clock.sleep(wait); if (active) callback(); } })();
        return { cancel: () => { active = false; } };
      },
    },
    command: { register: async () => ({ command: 'clutch' }) },
    store: { get: async (key: string) => { h.observed.storeGets.push(key); return h.store[key]; }, set: async (key: string, value: unknown) => {
      h.observed.storeSets.push(key);
      if (key === 'probe') {
        if (h.faults.probeDelay) await h.clock.sleep(h.faults.probeDelay);
        if (h.faults.probe) throw new Error('probe write failed');
        h.store[key] = JSON.parse(JSON.stringify(value));
        return;
      }
      if (key === 'sport') {
        if (h.faults.sportDelay) await h.clock.sleep(h.faults.sportDelay);
        if (h.faults.sport) throw new Error('sport write failed');
      }
      h.store[key] = value;
    } },
    config: { list: async () => { if (h.faults.config) throw new Error('config unavailable'); return [{ key: 'theme', value: theme }]; } },
    ui: { resolve: () => ({ Box: 'Box', Text: 'Text', Raster: 'Raster' }),
      blit: async (e: { cells: string; requestId: string }) => { h.blits.push({ at: h.clock.now(), cells: e.cells, requestId: e.requestId }); return {}; },
      invalidate: (event: string) => { if (h.faults.invalidate) throw new Error('invalidate failed'); if (event === 'ui.render') timing?.invalidated.push(h.clock.now()); } },
  };
}

test('S6 empty requestId swallows keys and blits kick and bat to the same site', async ($, on) => {
  const h = setup(on), pk = injected(h, goalLeft); await pk.start(); await pk.mount(props, '');
  expect(await pk.edit(' ')).toEqual({ text: '', cursor: 0 });
  expect(pk.calls()).toBe(5); expect(h.edits).toEqual([]);
  await h.clock.set(1750);
  expect(h.blits.length > 0).toBe(true);
  expect(h.blits.every(b => b.requestId === '')).toBe(true);
  expect(await pk.edit('2')).toEqual({ text: '', cursor: 0 }); expect(pk.b.mode).toBe('bat');
  expect(await pk.edit(' ')).toEqual({ text: '', cursor: 0 });
  expect(pk.b.bat).toBeDefined(); expect(pk.calls()).toBeGreaterThan(5);
  await h.clock.advance(100);
  expect(h.blits.at(-1)!.requestId).toBe('');
  expect(h.edits).toEqual([]);
});
for (const requestId of ['', 'spinner']) {
  test(`S7 render before turn keeps the playable site ${JSON.stringify(requestId)}`, async ($, on) => {
    const h = setup(on), timing: Timing = { late: [], scheduled: [], invalidated: [] };
    const pk = injected(h, goalLeft, 'dark', timing), ui = await pk.mount(props, requestId);
    expect(decode(await raster(ui)).pixels).toEqual(expectedPixels());
    expect(await pk.edit(' ')).toEqual({ text: ' ', cursor: 1 }); expect(pk.calls()).toBe(0);
    const before = timing.invalidated.length;
    await pk.start();
    if (timing.invalidated.length > before) await ui.redraw();
    expect(await pk.edit(' ')).toEqual({ text: '', cursor: 0 }); expect(pk.calls()).toBe(5);
    await h.clock.set(250); expect(h.blits.at(-1)!.requestId).toBe(requestId);
    expect(decode(h.blits.at(-1)!.cells).pixels).toEqual(goalText(0));
  });
}
for (const surface of ['desktop', 'mobile', 'vscode']) {
  test(`S8 ${surface} render preserves the terminal shot and next input`, async ($, on) => {
    const h = setup(on), pk = injected(h, goalLeft); await pk.start(); await pk.mount(); await pk.edit(' ');
    await h.clock.set(99);
    const result = { type: 'engine', ref: 99 };
    expect(await pk.run('ui.render', { surface, requestId: 'other', props }, () => result)).toBe(result);
    const count = h.blits.length;
    await h.clock.set(250);
    expect(h.blits.slice(count).some(b => b.at < 250)).toBe(true);
    expect(h.blits.every(b => b.requestId === 'injected')).toBe(true);
    expect(decode(h.blits.at(-1)!.cells).pixels).toEqual(goalText(0));
    await h.clock.set(1750); expect(await pk.edit(' ')).toEqual({ text: '', cursor: 0 });
    expect(pk.calls()).toBe(10); expect(h.edits).toEqual([]);
  });
}
for (const [values, result] of [
  [[.29, .99, 0, 0, 0], 'miss'], [[.30, .29, 0, 0, 0], 'save'], [[.30, .30, 0, 0, 0], 'goal'],
] as const) {
  test(`K1 exact judgment boundary and five calls: ${result}`, () => {
    let calls = 0; const b = createRuntime(() => values[calls++]!);
    expect(shoot(b.random).result).toBe(result); expect(calls).toBe(5);
  });
}
test('K2 seeded 10000 shots follow 49/21/30 distribution', () => {
  let seed = 1, calls = 0;
  const b = createRuntime(() => {
    calls++; let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  });
  const totals = { goal: 0, save: 0, miss: 0 };
  for (let i = 0; i < 10000; i++) totals[shoot(b.random).result]++;
  for (const [result, probability] of [['goal', .49], ['save', .21], ['miss', .30]] as const)
    expect(Math.abs(totals[result] / 10000 - probability) <= .02).toBe(true);
  expect(calls).toBe(50000);
});
const landings: { name: string; random: number[]; x: number; y: number; options: Parameters<typeof expectedPixels>[2] }[] = [
  { name: 'goal z0', random: [.3, .3, 0, 0, 0], x: 18, y: 4, options: { keeper: ['kdiveR', 34, 6], rip: [19, 5], cheer: true } },
  { name: 'goal z1', random: [.3, .3, .2, 0, 0], x: 23, y: 4, options: { keeper: ['kdiveR', 34, 6], rip: [24, 5], cheer: true } },
  { name: 'goal z3', random: [.3, .3, .6, 0, 0], x: 34, y: 4, options: { keeper: ['kdiveL', 18, 6], rip: [35, 5], cheer: true } },
  { name: 'goal z4 upper clamp', random: [.3, .3, 1, 0, 0], x: 40, y: 4, options: { keeper: ['kdiveL', 18, 6], rip: [41, 5], cheer: true } },
  { name: 'goal z2 L', random: [.3, .3, .4, 0, .49], x: 29, y: 4, options: { keeper: ['kdiveL', 18, 6], rip: [30, 5], cheer: true } },
  { name: 'goal z2 R', random: [.3, .3, .4, 0, .5], x: 29, y: 4, options: { keeper: ['kdiveR', 34, 6], rip: [30, 5], cheer: true } },
  { name: 'save z0', random: [.3, .29, 0, 0, 0], x: 18, y: 5, options: { keeper: ['kdiveL', 20, 5] } },
  { name: 'save z2', random: [.3, .29, .4, 0, 0], x: 29, y: 6, options: { keeper: ['keeper', 27, 3] } },
  { name: 'save z4', random: [.3, .29, .8, 0, 0], x: 40, y: 5, options: { keeper: ['kdiveR', 31, 5] } },
  { name: 'over z1 L', random: [.29, .99, .2, .49, 0], x: 23, y: 0, options: { keeper: ['kdiveL', 18, 6] } },
  { name: 'post L', random: [.29, .99, .4, .5, .49], x: 15, y: 4, options: { keeper: ['kdiveL', 18, 6], spark: [13, 3] } },
  { name: 'post R', random: [.29, .99, .4, .5, .5], x: 43, y: 4, options: { keeper: ['kdiveR', 34, 6], spark: [44, 3] } },
];
for (const sample of landings) {
  test(`K3 exact 1080 landing pixels: ${sample.name}`, () => {
    let calls = 0; const b = createRuntime(() => sample.random[calls++]!);
    b.shot = shoot(b.random); b.kickAt = 0;
    expect(calls).toBe(5);
    for (const [at, stage] of [[250, 0], [350, 1], [450, 1], [1749, 1]] as const) {
      expect(decode(frame(scene(b, at))).pixels).toEqual(expectedPixels(sample.x, sample.y, { ...sample.options, kick: true,
        text: { value: b.shot.result === 'goal' ? 'GOOOOOOOAL!!!!!!!' : 'BOOOOOOO!!!!!!!', stage, tone: b.shot.result === 'goal' ? 'good' : 'bad' } }));
    }
    expect(decode(frame(scene(b, 1750))).pixels).toEqual(expectedPixels());
    expect(updateShot(b, 249)).toBe(false); expect(b.score).toEqual({ goal: 0, save: 0, miss: 0 });
    expect(updateShot(b, 250)).toBe(true); expect(b.score[b.shot!.result]).toBe(1);
    expect(updateShot(b, 1749)).toBe(false); expect(b.score[b.shot!.result]).toBe(1);
  });
}

for (const elapsed of [125, 500]) {
  test(`K8 host turn.complete stops a shot at ${elapsed}ms and new turn resets`, async ($, on) => {
    const h = setup(on); const pk = injected(h, goalLeft, 'dark', undefined, () => 0); await pk.session(); await pk.start(); const ui = await pk.mount();
    await pk.edit(' '); await h.clock.advance(elapsed);
    expect(h.blits.length > 0).toBe(true);
    await pk.complete(); const count = h.blits.length;
    await h.clock.advance(2500); expect(h.blits.length).toBe(count);
    await pk.start('new'); await ui.redraw(props);
    expect(pk.b.mode).toBe('bat'); await pk.edit('1'); await ui.redraw(props);
    expect(decode(await raster(ui)).pixels).toEqual(expectedPixels());
    expect(text(await ui.drawn())).toBe(board('kick', '골 0 · 선방 0 · 빗나감 0', '생각 중'));
  });
}
test('K4 K5 host timer grows landing text, holds S1 and returns at 1750ms', async ($, on) => {
  const h = setup(on); const pk = injected(h, goalLeft, 'dark', undefined, () => 0); await pk.session(); await pk.start(); const ui = await pk.mount();
  await pk.edit(' '); await h.clock.advance(250);
  expect(h.blits.at(-1)!.at).toBe(250);
  const count = h.blits.length;
  const landed = text(await ui.drawn());
  expect([board('kick', '골 1 · 선방 0 · 빗나감 0', '생각 중'),
    board('kick', '골 0 · 선방 1 · 빗나감 0', '생각 중'),
    board('kick', '골 0 · 선방 0 · 빗나감 1', '생각 중')].includes(landed)).toBe(true);
  await h.clock.set(450); expect(h.blits.length).toBe(count + 1);
  const cells = h.blits.at(-1)!.cells;
  await h.clock.set(1749); expect(h.blits.length).toBe(count + 1); expect(h.blits.at(-1)!.cells).toBe(cells);
  await h.clock.set(1750); expect(h.blits.length).toBe(count + 2); expect(h.blits.at(-1)!.at).toBe(1750);
  expect(decode(h.blits.at(-1)!.cells).pixels).toEqual(expectedPixels());
  expect(text(await ui.drawn())).toContain(keyHints.kick);
  expect(h.blits.slice(1).every((b, i) => b.at - h.blits[i]!.at >= 33)).toBe(true);
});

test('P1 delayed flight retries throttled landing at 252ms exactly once', async ($, on) => {
  const h = setup(on), timing: Timing = { late: [0, 0, 0, 0, 0, 21], scheduled: [], invalidated: [] };
  const pk = injected(h, goalLeft, 'dark', timing); await pk.start(); const ui = await pk.mount();
  await pk.edit(' '); await h.clock.set(219);
  expect(h.blits.at(-1)!.at).toBe(219);
  const before = h.blits.length;
  await h.clock.set(250);
  expect(h.blits.length).toBe(before); expect(pk.b.landed).toBe(false);
  expect(pk.b.score).toEqual({ goal: 0, save: 0, miss: 0 });
  await h.clock.set(251); expect(h.blits.length).toBe(before);
  await h.clock.set(252);
  expect(h.blits.length).toBe(before + 1); expect(h.blits.at(-1)!.at).toBe(252);
  expect(decode(h.blits.at(-1)!.cells).pixels).toEqual(expectedPixels(18, 4, {
    kick: true, keeper: ['kdiveR', 34, 6], cheer: true, rip: [19, 5], text: { value: 'GOOOOOOOAL!!!!!!!', stage: 0, tone: 'good' },
  }));
  expect(timing.invalidated).toEqual([0, 0, 252]);
  await ui.redraw(props);
  expect(text(await ui.drawn())).toBe(board('kick', '골 1 · 선방 0 · 빗나감 0', '생각 중'));
  await h.clock.set(1749); expect(h.blits.length).toBe(before + 2);
  expect(pk.b.score).toEqual({ goal: 1, save: 0, miss: 0 });
  await h.clock.set(1750); expect(h.blits.length).toBe(before + 3);
  expect(decode(h.blits.at(-1)!.cells).pixels).toEqual(expectedPixels());
  expect(pk.b.score).toEqual({ goal: 1, save: 0, miss: 0 });
  expect(timing.invalidated).toEqual([0, 0, 252, 1750]);
  expect(timing.scheduled.every(ms => ms >= 1 && Number.isFinite(ms))).toBe(true);
  expect(h.blits.slice(1).every((b, i) => b.at - h.blits[i]!.at >= 33)).toBe(true);
});
for (const [now, landed, sinceBlit] of [[250, false, 31], [250, false, 40], [1750, true, 10], [1760, true, 10], [1760, false, 40]] as const) {
  test(`P1 scheduling stays positive at ${now}ms, landed=${landed}, gap=${sinceBlit}`, () => {
    const b = createRuntime(); b.turn = 'main'; b.site = 'spinner'; b.kickAt = 0;
    b.landed = landed; b.lastBlit = now - sinceBlit;
    const delays: number[] = [];
    const api = { clock: { every: (ms: number) => { delays.push(ms); return { cancel() {} }; } } } as unknown as EngineInterface;
    animate(api, b, now);
    expect(delays).toHaveLength(1);
    expect(Number.isFinite(delays[0]) && delays[0]! >= 1).toBe(true);
    if (!landed) expect(delays[0]).toBe(sinceBlit < 33 ? 33 - sinceBlit : 1);
    b.timer?.cancel();
  });
}

test('S2 original S1 widths include the outline and fit the field', () => {
  for (const [value, width] of [['GOOOOOOOAL!!!!!!!', 55], ['BOOOOOOO!!!!!!!', 47]] as const) {
    expect(textW(value, 1) + 2).toBe(width);
    expect(actualTextW(value, 1) + 2).toBe(width);
    expect(width <= 60).toBe(true);
    const left = 30 - Math.floor(width / 2);
    expect(left >= 0 && left + width <= 60).toBe(true);
  }
});
const goalText = (stage: number) => expectedPixels(18, 4, { kick: true, keeper: ['kdiveR', 34, 6],
  cheer: true, rip: [19, 5], text: { value: 'GOOOOOOOAL!!!!!!!', stage, tone: 'good' } });
test('T1 T3 exact timed goal stages and no blits during final hold', async ($, on) => {
  const h = setup(on), timing: Timing = { late: [], scheduled: [], invalidated: [] };
  const pk = injected(h, goalLeft, 'dark', timing); await pk.start(); await pk.mount({ mode: 'requesting' });
  await pk.edit(' ');
  for (const [at, stage] of [[250, 0], [350, 1], [450, 1], [1749, 1]] as const) {
    await h.clock.set(at);
    expect(decode(h.blits.at(-1)!.cells).pixels).toEqual(goalText(stage));
  }
  await h.clock.set(1750);
  expect(h.blits.filter(b => b.at >= 250).map(b => b.at)).toEqual([250, 350, 1750]);
  expect(decode(h.blits.at(-1)!.cells).pixels).toEqual(expectedPixels());
  expect(h.blits.slice(1).every((b, i) => b.at - h.blits[i]!.at >= 33)).toBe(true);
  expect(timing.scheduled.every(ms => ms >= 1 && Number.isFinite(ms))).toBe(true);
  expect(pk.b.score).toEqual({ goal: 1, save: 0, miss: 0 });
});
for (const [name, late, first, second] of [
  ['landing throttled', [0, 0, 0, 0, 0, 21], 252, 350],
  ['350ms throttled', [0, 0, 0, 0, 0, 0, 80], 330, 363],
  ['skip stale stages', [0, 0, 0, 0, 0, 0, 250], 500, 500],
] as const) {
  test(`T4 ${name}: current stage, landing effects and one score`, async ($, on) => {
    const h = setup(on), timing: Timing = { late: [...late], scheduled: [], invalidated: [] };
    const pk = injected(h, goalLeft, 'dark', timing); await pk.start(); await pk.mount({ mode: 'requesting' });
    await pk.edit(' '); await h.clock.set(1749);
    const landing = h.blits.filter(b => b.at >= 250);
    expect(landing[0]!.at).toBe(first);
    expect(decode(landing[0]!.cells).pixels).toEqual(goalText(first >= 350 ? 1 : 0));
    expect(landing.some(b => b.at === second)).toBe(true);
    expect(decode(landing.at(-1)!.cells).pixels).toEqual(goalText(1));
    expect(landing.at(-1)!.at < 1750).toBe(true);
    expect(pk.b.score).toEqual({ goal: 1, save: 0, miss: 0 });
    expect(timing.scheduled.every(ms => ms >= 1 && Number.isFinite(ms))).toBe(true);
    expect(h.blits.slice(1).every((b, i) => b.at - h.blits[i]!.at >= 33)).toBe(true);
    await h.clock.set(1750);
    expect(pk.b.score).toEqual({ goal: 1, save: 0, miss: 0 });
  });
}
test('T5 exact idle, flight, landing and restored scoreboard', async ($, on) => {
  const h = setup(on), pk = injected(h, goalLeft); await pk.start(); const ui = await pk.mount({ mode: 'requesting' });
  const check = async (expected: string) => {
    await ui.redraw({ mode: 'requesting' }); const actual = text(await ui.drawn());
    expect(actual).toBe(expected);
    for (const word of ['GOOOOOOOAL', 'BOOOOOOO', 'GOALLLLL', 'BOOOOO!']) expect(actual.includes(word)).toBe(false);
  };
  await check(board('kick', '골 0 · 선방 0 · 빗나감 0', '준비 중'));
  await pk.edit(' '); await h.clock.set(249);
  await check(board('kick', '골 0 · 선방 0 · 빗나감 0', '준비 중'));
  await h.clock.set(250);
  await check(board('kick', '골 1 · 선방 0 · 빗나감 0', '준비 중'));
  await h.clock.set(1750);
  await check(board('kick', '골 1 · 선방 0 · 빗나감 0', '준비 중'));
});
test('T6 every main tool maps activity, invalidates only changes and preserves next result', async ($, on) => {
  const h = setup(on), timing: Timing = { late: [], scheduled: [], invalidated: [] };
  const pk = injected(h, goalLeft, 'dark', timing); await pk.start(); const ui = await pk.mount({ mode: 'requesting' });
  for (const [event, activity, state] of [
    [{ tool: 'Bash', command: 'npm test' }, '테스트 실행 중', { key: 'tests' }],
    [{ tool: 'Bash', command: 'npx vitest run' }, '테스트 실행 중', { key: 'tests' }],
    [{ tool: 'Bash', command: 'jest' }, '테스트 실행 중', { key: 'tests' }],
    [{ tool: 'Bash', command: 'pytest -q' }, '테스트 실행 중', { key: 'tests' }],
    [{ tool: 'Bash', command: 'git status && npm test' }, '테스트 실행 중', { key: 'tests' }],
    [{ tool: 'Bash', command: 'git status' }, 'git 작업 중', { key: 'git' }],
    [{ tool: 'Bash', command: 'ls -la' }, '명령 실행 중', { key: 'command' }],
    [{ tool: 'Bash', command: 'echo latest' }, '명령 실행 중', { key: 'command' }],
    [{ tool: 'Bash', command: 'echo digital' }, '명령 실행 중', { key: 'command' }],
    [{ tool: 'Edit', file_path: '/a/b/register.tsx' }, '파일 편집 중 (register.tsx)', { key: 'editing', detail: 'register.tsx' }],
    [{ tool: 'Write', file_path: 'notes.md' }, '파일 편집 중 (notes.md)', { key: 'editing', detail: 'notes.md' }],
    [{ tool: 'NotebookEdit', notebook_path: '/a/b/demo.ipynb' }, '파일 편집 중 (demo.ipynb)', { key: 'editing', detail: 'demo.ipynb' }],
    [{ tool: 'Read' }, '코드 읽는 중', { key: 'reading' }], [{ tool: 'Grep' }, '코드 읽는 중', { key: 'reading' }], [{ tool: 'Glob' }, '코드 읽는 중', { key: 'reading' }],
    [{ tool: 'WebSearch' }, '웹 찾는 중', { key: 'web' }], [{ tool: 'WebFetch' }, '웹 찾는 중', { key: 'web' }],
    [{ tool: 'Agent' }, '서브에이전트 작업 중', { key: 'subagent' }], [{ tool: 'TodoWrite' }, 'TodoWrite 사용 중', { key: 'tool', detail: 'TodoWrite' }],
  ] as const) {
    const before = timing.invalidated.length, previous = pk.b.activity, input = { ...event, tool_use_id: 'activity' };
    const result = { result: { text: 'unchanged', nested: [1, null] }, is_error: false };
    let calls = 0;
    expect(await pk.run('tool.call', input, (e: unknown) => { calls++; expect(e).toEqual(input); return result; })).toEqual(result);
    expect(calls).toBe(1); expect(pk.b.activity).toEqual(state);
    expect(timing.invalidated.length).toBe(before + (JSON.stringify(previous) === JSON.stringify(state) ? 0 : 1));
    await ui.redraw({ mode: 'tool-use' }); expect(text(await ui.drawn())).toContain(`Claude ${activity}`);
  }
  const before = timing.invalidated.length;
  for (const agentId of ['worker', '']) {
    const result = { result: 'subagent' };
    expect(await pk.run('tool.call', { tool: 'Read', agentId, tool_use_id: 'sub' }, () => result)).toEqual(result);
    expect(pk.b.activity).toEqual({ key: 'tool', detail: 'TodoWrite' });
  }
  expect(timing.invalidated.length).toBe(before);
  for (const [mode, expected] of [['thinking', 'thinking'], ['responding', 'writing'],
    ['requesting', 'writing'], ['tool-input', 'writing'], ['tool-use', 'writing']] as const) {
    const before = timing.invalidated.length, previous = pk.b.activity;
    await ui.redraw({ mode }); expect(pk.b.activity).toEqual({ key: expected });
    expect(timing.invalidated.length).toBe(before + (previous.key === expected ? 0 : 1));
  }
  await pk.run('turn.start', { turnId: 'sub', agentId: 'worker' }); expect(pk.b.activity).toEqual({ key: 'writing' });
  const beforeReset = timing.invalidated.length;
  await pk.start('new'); expect(pk.b.activity).toEqual({ key: 'ready' });
  expect(timing.invalidated.length).toBe(beforeReset + 1);
});
test('T6 host observes main tool input before next finishes without waiting for storage', async ($, on) => {
  const h = setup(on); h.faults.probeDelay = 5000;
  const result = { result: 'same result', is_error: false };
  on('tool.call', async () => { await h.clock.sleep(100); return result; });
  await session($); await start($); const ui = await mount($);
  await ui.redraw({ ...props, mode: 'tool-use' });
  const call = $.tool.call({ tool: 'Bash', command: 'npm test', tool_use_id: 'main-test' });
  await h.clock.advance(1); await ui.redraw({ ...props, mode: 'tool-use' });
  expect(text(await ui.drawn())).toContain('Claude 테스트 실행 중');
  await h.clock.advance(99); expect(await call).toEqual(result);
});

const batCases: { result: BatResult; r: number; moves: [number, number]; s0: number; value: string; cy: number; tone: 'good' | 'warn' | 'bad'; score: { homerun: number; hit: number; strikeout: number } }[] = [
  { result: 'hr', r: 0, moves: [550, 800], s0: 900, value: 'HOMERUN!!!!!!!', cy: 9, tone: 'good', score: { homerun: 1, hit: 0, strikeout: 0 } },
  { result: '3b', r: .1, moves: [600, 900], s0: 1100, value: 'TRIPLE!!!!!!!', cy: 9, tone: 'good', score: { homerun: 0, hit: 1, strikeout: 0 } },
  { result: '2b', r: .15, moves: [550, 800], s0: 1100, value: 'DOUBLE!!!!', cy: 9, tone: 'good', score: { homerun: 0, hit: 1, strikeout: 0 } },
  { result: '1b', r: .35, moves: [500, 750], s0: 1100, value: 'HIT!!', cy: 9, tone: 'good', score: { homerun: 0, hit: 1, strikeout: 0 } },
  { result: 'foul', r: .65, moves: [550, 750], s0: 800, value: 'FOUL BALL!!!', cy: 9, tone: 'warn', score: { homerun: 0, hit: 0, strikeout: 0 } },
  { result: 'k', r: .8, moves: [400, 550], s0: 600, value: 'STRIKEOUT!!!!!!!', cy: 9, tone: 'bad', score: { homerun: 0, hit: 0, strikeout: 1 } },
];
function batPixels(c: typeof batCases[number], stage: number, lineOff = false) {
  return expectedSky(c.result, { value: c.value, stage, tone: c.tone, cy: c.cy, lineOff });
}
for (const [r, result] of [[0, 'hr'], [.0999, 'hr'], [.1, '3b'], [.1499, '3b'], [.15, '2b'], [.3499, '2b'], [.35, '1b'], [.6499, '1b'], [.65, 'foul'], [.7999, 'foul'], [.8, 'k'], [.9999, 'k']] as const) {
  test(`B1 boundary ${r} and exactly one random draw`, () => {
    let calls = 0; expect(swing(() => { calls++; return r; })).toBe(result); expect(calls).toBe(1);
  });
}
test('B2 seeded 10000 at-bats meet each probability tolerance', () => {
  let seed = 1, calls = 0;
  const random = () => {
    calls++; let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  const counts = { hr: 0, '3b': 0, '2b': 0, '1b': 0, foul: 0, k: 0 };
  for (let i = 0; i < 10000; i++) counts[swing(random)]++;
  for (const [result, probability, tolerance] of [['hr', .1, .01], ['3b', .05, .01], ['2b', .2, .015], ['1b', .3, .015], ['foul', .15, .01], ['k', .2, .015]] as const)
    expect(Math.abs(counts[result] / 10000 - probability) <= tolerance).toBe(true);
  expect(calls).toBe(10000);
});
for (const c of batCases) {
  test(`B3 B4 B5 all timed frames, full pixels, scoreboard and return: ${c.result}`, async ($, on) => {
    const h = setup(on), timing: Timing = { late: [], scheduled: [], invalidated: [] };
    const pk = injected(h, [c.r], 'dark', timing); await pk.start(); const ui = await pk.mount({ mode: 'requesting' });
    await pk.edit('2'); await ui.redraw();
    expect(decode(await raster(ui)).pixels).toEqual(expectedSky('sky-wait'));
    expect(text(await ui.drawn())).toBe(board('bat', '홈런 0 · 안타 0 · 삼진 0', '준비 중'));
    await pk.edit(' '); expect(pk.calls()).toBe(1);
    const frames: [number, number[][]][] = [[120, expectedSky('sky-pitch-0')], [250, expectedSky('sky-pitch-1')]];
    if (c.result !== 'k') frames.push([350, expectedSky('sky-contact')]);
    frames.push([c.moves[0], expectedSky(`sky-${c.result}-0`)], [c.moves[1], expectedSky(`sky-${c.result}-1`)]);
    for (const stage of [0, 1, 2]) frames.push([c.s0 + stage * 150, batPixels(c, stage)]);
    if (c.result === 'foul') frames.push([1250, batPixels(c, 2, true)]);
    frames.push([c.s0 + 1800, expectedSky('sky-wait')]);
    let previous = expectedSky('sky-wait');
    for (const [index, [at, pixels]] of frames.entries()) {
      await h.clock.set(at - 1);
      expect(h.blits).toHaveLength(index);
      expect(decode(frame(scene(pk.b, at - 1))).pixels).toEqual(previous);
      if (at <= c.s0) expect(pk.b.batScore).toEqual({ homerun: 0, hit: 0, strikeout: 0 });
      await h.clock.set(at);
      expect(h.blits).toHaveLength(index + 1); expect(h.blits.at(-1)!.at).toBe(at);
      const decoded = decode(h.blits.at(-1)!.cells);
      expect(decoded.pixels).toEqual(pixels);
      if (c.result === 'k' && at >= 550 && at < 2400) {
        expect(decoded.glyphs[8 * 60 + 49]).toBe(75);
        expect(decoded.pixels[16]![49]).toBe(0xF4F1EA); expect(decoded.pixels[17]![49]).toBe(0x0B0F1A);
      } else expect(decoded.glyphs.every(g => g === 32 || g === 0x2580)).toBe(true);
      await ui.redraw();
      const score = at < c.s0 ? { homerun: 0, hit: 0, strikeout: 0 } : c.score;
      expect(text(await ui.drawn())).toBe(board('bat', `홈런 ${score.homerun} · 안타 ${score.hit} · 삼진 ${score.strikeout}`, '준비 중'));
      previous = pixels;
    }
    await h.clock.advance(2000); expect(h.blits.map(b => b.at)).toEqual(frames.map(([at]) => at));
    expect(timing.scheduled).toHaveLength(frames.length);
    expect(pk.b.batScore).toEqual(c.score); expect(pk.calls()).toBe(1);
    expect(timing.scheduled.every(ms => Number.isFinite(ms) && ms >= 1)).toBe(true);
    expect(h.blits.slice(1).every((b, i) => b.at - h.blits[i]!.at >= 33)).toBe(true);
  });
  test(`B4 delayed pre-S0 scene retries at earliest allowed time: ${c.result}`, async ($, on) => {
    const late = c.result === 'k' ? [0, 0, 0, c.s0 - c.moves[1] - 20] : [0, 0, 0, 0, c.s0 - c.moves[1] - 20];
    const h = setup(on), timing: Timing = { late, scheduled: [], invalidated: [] };
    const pk = injected(h, [c.r], 'dark', timing); await pk.start(); const ui = await pk.mount({ mode: 'requesting' });
    await pk.edit('2'); await ui.redraw(); await pk.edit(' ');
    await h.clock.set(c.s0); expect(h.blits.at(-1)!.at).toBe(c.s0 - 20);
    expect(pk.b.batScore).toEqual({ homerun: 0, hit: 0, strikeout: 0 });
    await h.clock.set(c.s0 + 13); expect(h.blits.at(-1)!.at).toBe(c.s0 + 13);
    expect(decode(h.blits.at(-1)!.cells).pixels).toEqual(batPixels(c, 0));
    await h.clock.set(c.s0 + 1799);
    expect(h.blits.some(b => JSON.stringify(decode(b.cells).pixels) === JSON.stringify(batPixels(c, 2)))).toBe(true);
    expect(pk.b.batScore).toEqual(c.score);
    await h.clock.set(c.s0 + 1800); expect(decode(h.blits.at(-1)!.cells).pixels).toEqual(expectedSky('sky-wait'));
    expect(pk.b.batScore).toEqual(c.score);
    expect(timing.scheduled.every(ms => Number.isFinite(ms) && ms >= 1)).toBe(true);
    expect(h.blits.slice(1).every((b, i) => b.at - h.blits[i]!.at >= 33)).toBe(true);
  });
}
test('B4 a tick delayed beyond return shows S2 before returning, without replaying old scenes', async ($, on) => {
  const c = batCases[0]!, h = setup(on), timing: Timing = { late: [3000], scheduled: [], invalidated: [] };
  const pk = injected(h, [c.r], 'dark', timing); await pk.start(); const ui = await pk.mount({ mode: 'requesting' });
  await pk.edit('2'); await ui.redraw(); await pk.edit(' ');
  await h.clock.set(3120); expect(h.blits).toHaveLength(1);
  expect(decode(h.blits[0]!.cells).pixels).toEqual(batPixels(c, 2)); expect(pk.b.batScore).toEqual(c.score);
  await ui.redraw();
  expect(decode(await raster(ui)).pixels).toEqual(batPixels(c, 2));
  await h.clock.set(3152); await ui.redraw();
  expect(decode(await raster(ui)).pixels).toEqual(batPixels(c, 2));
  await h.clock.set(3153); expect(h.blits.map(b => b.at)).toEqual([3120, 3153]);
  expect(decode(h.blits[1]!.cells).pixels).toEqual(expectedSky('sky-wait'));
  expect(pk.b.batScore).toEqual(c.score); expect(timing.scheduled.every(ms => ms >= 1 && Number.isFinite(ms))).toBe(true);
});
for (const mode of ['kick', 'bat'] as const) {
  test(`B6 ${mode} blocks sport switches and repeat spaces throughout play`, async ($, on) => {
    const h = setup(on), pk = injected(h, mode === 'kick' ? goalLeft : [.1]); await pk.start(); const ui = await pk.mount({ mode: 'requesting' });
    if (mode === 'bat') { await pk.edit('2'); await ui.redraw(); }
    await pk.edit(' '); const calls = pk.calls();
    for (const at of mode === 'kick' ? [0, 249, 250, 1749] : [0, 119, 350, 1099, 1100, 1400, 2899]) {
      await h.clock.set(at);
      for (const key of ['1', '2', ' ', '   ']) expect(await pk.edit(key)).toEqual({ text: '', cursor: 0 });
      expect(pk.calls()).toBe(calls); expect(pk.b.mode).toBe(mode);
    }
    const result = { text: 'next result', cursor: 3 }; h.observed.editResult = result;
    expect(await pk.edit('3')).toEqual({ text: '', cursor: 0 }); expect(h.edits).toEqual([]);
    expect(pk.b.mode).toBe(mode); expect(pk.calls()).toBe(calls);
  });
}
test('B6 last sport persists through zero input and per-turn scores reset', async ($, on) => {
  const h = setup(on), pk = injected(h, [...goalLeft, .1]); await pk.start(); const ui = await pk.mount({ mode: 'requesting' });
  expect(pk.b.mode).toBe('kick');
  await pk.edit(' '); await h.clock.set(1750); expect(pk.b.score.goal).toBe(1);
  await pk.edit('2'); await ui.redraw(); await pk.edit(' '); await h.clock.set(4650);
  expect(pk.b.batScore.hit).toBe(1); expect(pk.b.score.goal).toBe(1);
  expect(await pk.edit('0')).toEqual({ text: '0', cursor: 1 }); expect(pk.b.mode).toBe('bat'); expect(h.store.sport).toBe('bat');
  await pk.complete(); await pk.start('second'); await ui.redraw();
  expect(pk.b.mode).toBe('kick'); expect(pk.b.score).toEqual({ goal: 0, save: 0, miss: 0 });
  expect(pk.b.batScore).toEqual({ homerun: 0, hit: 0, strikeout: 0 });
  expect(decode(await raster(ui)).pixels).toEqual(expectedPixels());
  await pk.edit('1'); await ui.redraw(); expect(h.store.sport).toBe('kick');
  expect(text(await ui.drawn())).toBe(board('kick', '골 0 · 선방 0 · 빗나감 0', '준비 중'));
});
for (const sport of [undefined, 'bat', 'kick', 'invalid']) {
  test(`B6 stored sport ${sport} is excluded from startup selection`, async ($, on) => {
    const h = setup(on, { sport }), pk = injected(h, goalLeft, 'dark', undefined, () => 0);
    await pk.session(); await pk.start(); const ui = await pk.mount();
    expect(decode(await raster(ui)).pixels).toEqual(sport === 'kick' ? expectedSky('sky-wait') : expectedPixels());
    await pk.edit('2'); await ui.redraw(props); await pk.complete(); await pk.start('next'); await ui.redraw(props);
    expect(decode(await raster(ui)).pixels).toEqual(expectedPixels()); expect(h.store.sport).toBe('kick');
    await pk.session(); await pk.start('restart'); await ui.redraw(props);
    expect(decode(await raster(ui)).pixels).toEqual(expectedSky('sky-wait'));
  });
}
for (const fault of ['delay', 'failure']) {
  test(`B6 sport ${fault} never blocks input and next turn excludes the in-memory last sport`, async ($, on) => {
    const h = setup(on); const pk = injected(h, goalLeft, 'dark', undefined, () => 0); await pk.session(); await pk.start(); const ui = await pk.mount();
    h.faults.sportDelay = fault === 'delay' ? 1000 : 0; h.faults.sport = fault === 'failure';
    for (const key of ['2', '1', '2']) expect(await withoutAdvancing(h.clock, pk.edit(key))).toEqual({ text: '', cursor: 0 });
    expect(h.clock.now()).toBe(0); expect(h.edits).toEqual([]);
    await pk.complete(); await pk.start('next'); await ui.redraw(props);
    expect(decode(await raster(ui)).pixels).toEqual(expectedPixels());
    await h.clock.advance(4000);
    expect(h.store.sport).toBe('kick');
  });
}
for (const key of ['2', '0']) {
  for (const context of ['draft', 'outside', 'narrow', 'disabled', 'not-drawn', 'subagent']) {
    test(`B6 ${key} preserves next result when ${context}`, async ($, on) => {
      const h = setup(on, { enabled: context !== 'disabled' }); await session($);
      if (context === 'subagent') { const event = { turnId: 'sub', text: 'work', agentId: 'worker' }; await $.turn.start(event); }
      else if (context !== 'outside') await start($);
      if (context !== 'not-drawn') await mount($, context === 'narrow' ? 65 : 80);
      const before = h.store.sport;
      const result = { text: 'next result', cursor: 3 }; h.observed.editResult = result;
      expect(await edit($, key, context === 'draft' ? 'draft' : '')).toEqual(result);
      expect(h.edits).toEqual([key]); expect(h.store.sport).toBe(before);
    });
  }
}

const pausedLabel = 'clutch 멈춤 · 다음 질문에서 다시 켜집니다';
function expectPaused(tree: RenderElement, theme = 'dark') {
  expect(tree).toMatchObject({ type: 'Box', props: { flexDirection: 'column' } });
  const found = leaves(tree);
  expect(found.map(e => e.type)).toEqual(['engine', 'Text', 'Text']);
  expect(found[0]).toEqual(engineTree);
  expect(found[2]).toEqual({ type: 'Text', props: { color: theme === 'light' ? '#57606A' : '#9AA3B2' }, children: [pausedLabel] });
  expect(text(found[1]!)).toContain('Claude ');

}
for (const sport of ['kick', 'bat'] as const) {
  const score = sport === 'kick' ? '골 0 · 선방 0 · 빗나감 0' : '홈런 0 · 안타 0 · 삼진 0';
  for (const theme of ['light', 'dark']) {
    test(`H1 Z1 Z6 idle pause has only the exact dim notice: ${sport} ${theme}`, async ($, on) => {
      const h = setup(on, {}, theme), pk = injected(h, goalLeft, theme, undefined, () => SPORTS.indexOf(sport) / 3); await pk.session(); await pk.start(); const ui = await pk.mount();
      expect(text(await ui.drawn())).toBe(board(sport, score));
      expect(await pk.edit('9')).toEqual({ text: '', cursor: 0 }); expect(h.edits).toEqual([]);
      await ui.redraw(props);
      expectPaused(await ui.drawn(), theme);
      expect(await ui.find({ type: 'Raster' })).toBeUndefined();
      expect(h.store.sport).toBe(sport);
    });
  }
  test(`Z3 paused input passes through without gameplay changes: ${sport}`, async ($, on) => {
    const h = setup(on, { sport }), timing: Timing = { late: [], scheduled: [], invalidated: [] };
    const pk = injected(h, goalLeft, 'dark', timing); pk.b.sport = sport;
    await pk.start(); const ui = await pk.mount({ mode: 'requesting' });
    const invalidated = timing.invalidated.length;
    await pk.edit('9'); expect(timing.invalidated.length).toBe(invalidated + 1);
    const before = JSON.stringify([pk.b.score, pk.b.batScore]);
    const result = { text: 'next result', cursor: 3 }; h.observed.editResult = result;
    const keys = [' ', '   ', '1', '2', '0', '9', '3', 'a', 'left'];
    let count = 0;
    for (const site of ['injected', undefined]) {
      pk.b.site = site;
      for (const draft of ['', 'draft']) for (const key of keys) {
        expect(await pk.edit(key === 'left' ? '' : key, draft, key === '   ' ? false : key)).toBe(result);
        count++;
      }
    }
    expect(h.edits.length).toBe(count); expect(pk.calls()).toBe(0);
    expect(JSON.stringify([pk.b.score, pk.b.batScore])).toBe(before);
    expect(pk.b.mode).toBe(sport); expect(pk.b.sport).toBe(sport); expect(h.store.sport).toBe(sport);
    await pk.run('tool.call', { tool: 'Read', tool_use_id: 'paused-read' }, () => ({ result: 'ok' }));
    await ui.redraw({ mode: 'tool-use' });
    expectPaused(await ui.drawn());
    await h.clock.advance(3000); expect(h.blits).toEqual([]); expect(pk.b.timer).toBeUndefined();
    expect(Object.keys(h.store).sort()).toEqual(['sport']);
  });
  test(`Z4 next turn and session restart select ${sport} without persisting pause`, async ($, on) => {
    const h = setup(on, { sport }), pk = injected(h, goalLeft, 'dark', undefined, () => sport === 'kick' ? 0 : .5); await pk.session(); await pk.start(); const ui = await pk.mount();
    for (const restart of ['turn', 'session']) {
      await pk.edit(sport === 'kick' ? '2' : '3');
      expect(await pk.edit('9')).toEqual({ text: '', cursor: 0 });
      await ui.redraw(props); expectPaused(await ui.drawn());
      if (restart === 'turn') await pk.complete(); else await pk.session();
      await pk.start(restart); await ui.redraw(props);
      expect(decode(await raster(ui)).pixels).toEqual(sport === 'kick' ? expectedPixels() : expectedSky('sky-wait'));
      expect(text(await ui.drawn())).toBe(board(sport, score));
      const blits = h.blits.length;
      expect(await pk.edit(' ')).toEqual({ text: '', cursor: 0 });
      await h.clock.advance(150); expect(h.blits.length > blits).toBe(true);
      await h.clock.advance(3000);
    }
    expect(h.edits).toEqual([]); expect(h.store.sport).toBe(sport);
    expect(Object.keys(h.store).sort()).toEqual(['sport']);
  });
}
for (const c of [
  { sport: 'kick', elapsed: 100, count: 0 }, { sport: 'kick', elapsed: 400, count: 1 },
  { sport: 'bat', elapsed: 500, count: 0 }, { sport: 'bat', elapsed: 1200, count: 1 },
] as const) {
  test(`Z2 pause ${c.sport} play at ${c.elapsed}ms`, async ($, on) => {
    const saved = { offsetMs: 40, iqrMs: 5, samples: 10, measuredAt: '2026-10-18T00:00:00.000Z' };
    const h = setup(on, { sport: c.sport, calibration: saved });
    const pk = injected(h, c.sport === 'kick' ? goalLeft : [.1]); pk.b.sport = c.sport;
    await pk.start(); const ui = await pk.mount({ mode: 'requesting' });
    await pk.edit(' ');
    await h.clock.advance(c.elapsed);
    const randomCalls = pk.calls();
    expect(await pk.edit('9')).toEqual({ text: '', cursor: 0 }); expect(h.edits).toEqual([]);
    expect(pk.b.paused).toBe(true); expect(pk.b.mode).toBe(c.sport); expect(pk.b.timer).toBeUndefined();
    expect(h.store.calibration).toEqual(saved);
    expect(pk.b.score).toEqual({ goal: c.sport === 'kick' ? c.count : 0, save: 0, miss: 0 });
    expect(pk.b.batScore).toEqual({ homerun: 0, hit: c.sport === 'bat' ? c.count : 0, strikeout: 0 });
    const blits = h.blits.length;
    for (const elapsed of [0, 3000]) {
      await h.clock.advance(elapsed); await ui.redraw();
      expectPaused(await ui.drawn());
      expect(await ui.find({ type: 'Raster' })).toBeUndefined();
      expect(h.blits.length).toBe(blits); expect(pk.calls()).toBe(randomCalls);
    }
    expect(h.store.sport).toBe(c.sport);
  });
}
for (const context of ['draft', 'outside', 'narrow', 'disabled', 'not-drawn', 'subagent', 'subagent-edit']) {
  test(`Z5 9 preserves next result without pausing: ${context}`, async ($, on) => {
    const h = setup(on), pk = injected(h, goalLeft);
    if (context === 'subagent') await pk.run('turn.start', { turnId: 'sub', agentId: 'worker' });
    else if (context !== 'outside') await pk.start();
    if (context !== 'not-drawn') await pk.mount();
    if (context === 'disabled') pk.b.enabled = false;
    if (context === 'narrow') await pk.run('ui.render', { surface: 'terminal', viewport: { columns: 65 }, requestId: 'narrow', props }, () => engineTree);
    const result = { text: 'next result', cursor: 3 }; let calls = 0;
    const draft = context === 'draft' ? 'draft' : '';
    const event = { inputText: '9', text: draft, cursor: draft.length, start: draft.length, end: draft.length,
      ...(context === 'subagent-edit' ? { agentId: 'worker' } : {}) };
    expect(await pk.run('prompt.edit', event, (e: unknown) => { calls++; expect(e).toBe(event); return result; })).toBe(result);
    expect(calls).toBe(1); expect(pk.b.paused).toBe(false); expect(pk.calls()).toBe(0);
    expect(pk.b.mode).toBe('kick'); expect(pk.b.sport).toBe('kick');
  });
}

for (const sport of ['kick', 'bat'] as const) {
  test(`H3 paused notice takes precedence over narrow width: ${sport}`, async ($, on) => {
    setup(on, { sport }); await session($); await start($); const wide = await mount($);
    await edit($, '9'); await wide.unmount(); const ui = await mount($, 65);
    expectPaused(await ui.drawn());
    expect(await ui.find({ type: 'Raster' })).toBeUndefined();
  });
  test(`H8 theme failure keeps the engine and dark pause notice, then resumes: ${sport}`, async ($, on) => {
    const h = setup(on, { sport }, 'light'), pk = injected(h, goalLeft, 'light', undefined, () => sport === 'kick' ? 0 : .5); await pk.session(); await pk.start(); const ui = await pk.mount();
    await pk.edit('9'); h.faults.config = true;
    await ui.redraw(props); expectPaused(await ui.drawn());
    expect(await ui.find({ type: 'Raster' })).toBeUndefined();
    await pk.complete(); await pk.start('resumed'); await ui.redraw(props);
    expect(decode(await raster(ui)).pixels).toEqual(sport === 'kick' ? expectedPixels() : expectedSky('sky-wait'));
    expect(text(await ui.drawn())).toBe(board(sport, sport === 'kick' ? '골 0 · 선방 0 · 빗나감 0' : '홈런 0 · 안타 0 · 삼진 0'));
    const blits = h.blits.length;
    expect(await pk.edit(' ')).toEqual({ text: '', cursor: 0 });
    await h.clock.advance(150); expect(h.blits.length > blits).toBe(true);
  });
  for (const requestId of ['', 'spinner']) {
    test(`H4 paused field restores before turn.start and accepts Space: ${sport} ${JSON.stringify(requestId)}`, async ($, on) => {
      let choices = 0;
      const h = setup(on), pk = injected(h, sport === 'kick' ? goalLeft : [.1], 'dark', undefined,
        () => choices++ === 0 && sport === 'kick' ? 1 / 3 : 0);
      await pk.start(); const ui = await pk.mount(props, requestId);
      await pk.edit('9'); await ui.redraw(); expectPaused(await ui.drawn());
      await pk.complete(); await ui.redraw();
      expect(decode(await raster(ui)).pixels).toEqual(sport === 'kick' ? expectedPixels() : expectedSky('sky-wait'));
      await pk.start('resumed');
      expect(await pk.edit(' ')).toEqual({ text: '', cursor: 0 });
      await h.clock.advance(150); expect(h.blits.length > 0).toBe(true);
      expect(h.blits.every(b => b.requestId === requestId)).toBe(true);
      expect(h.edits).toEqual([]);
    });
  }
}

const bbCases = [
  { result: 'three', r: 0, value: 'THREEEEEEE!!!!!!!', tone: 'good', s0: 550, times: [300, 550, 650, 750, 850, 950, 2150], keys: ['top', 'in1', 'in2', 'in2', 'in2', 'in2'] },
  { result: 'bang', r: .24, value: 'BANG!!!!!!!', tone: 'good', s0: 550, times: [300, 550, 650, 750, 850, 950, 2150], keys: ['top', 'in1', 'in2', 'in2', 'in2', 'in2'] },
  { result: 'downtown', r: .42, value: 'FROM DOWNTOWN!!!!!!!', tone: 'good', s0: 550, times: [300, 550, 650, 750, 850, 950, 2150], keys: ['top', 'in1', 'in2', 'in2', 'in2', 'in2'] },
  { result: 'clank', r: .60, value: 'CLANK!!!!!!!', tone: 'warn', s0: 600, times: [300, 450, 600, 700, 850, 2200], keys: ['top', 'clank0', 'clank1', 'clank1', 'clank2'] },
  { result: 'brick', r: .75, value: 'BRICK!!!!!!!', tone: 'warn', s0: 600, times: [300, 400, 600, 700, 850, 2200], keys: ['top', 'brick0', 'brick1', 'brick1', 'brick2'] },
  { result: 'air', r: .90, value: 'AIR BALL!!!!!!!', tone: 'bad', s0: 550, times: [300, 550, 650, 800, 2150], keys: ['air0', 'air1', 'air1', 'air2'] },
] as const;
type BBCase = typeof bbCases[number];
function bbExpected(c: BBCase, cur: number, ball: number, at: number) {
  if (at >= c.times.at(-1)!) return expectedBBWait(ball === 5 ? (cur + 1) % 5 : cur, ball === 5 ? 1 : ball + 1);
  let key: string = at === 0 ? 'shot' : c.keys[c.times.findIndex(t => t === at)]!;
  if (ball === 5 && ['top', 'in1', 'in2'].includes(key)) key = 'm' + key;
  return expectedBB(key, cur, ball, at >= c.s0 ? { value: c.value, stage: at >= c.s0 + 100 ? 1 : 0, tone: c.tone } : undefined, at);
}
for (const [result, boxes] of [
  ['three', [[[8, 52, 7, 11]], [[3, 57, 6, 12]]]],
  ['bang', [[[17, 43, 7, 11]], [[14, 45, 6, 12]]]],
  ['clank', [[[15, 44, 7, 11]], [[12, 47, 6, 12]]]],
  ['brick', [[[15, 44, 7, 11]], [[13, 47, 6, 12]]]],
  ['air', [[[11, 48, 7, 11]], [[7, 52, 6, 12]]]],
  ['downtown', [[[23, 36, 5, 9], [10, 50, 10, 14]], [[21, 39, 2, 8], [4, 56, 9, 15]]]],
] as const) for (const stage of [0, 1] as const) {
  test(`C1 C6 centered basketball text bounds: ${result} S${stage}`, () => {
    const c = bbCases.find(c => c.result === result)!;
    const shot = basketball(result, 1, 2).frames.find(([at]) => at === c.s0 + stage * 100)![1];
    const actual = decode(frame(shot)).pixels, base = decode(frame({ ...shot, text: undefined })).pixels;
    const ink = actual.flatMap((row, y) => row.flatMap((pixel, x) => pixel !== base[y]![x] ? [[x, y]] : []));
    const expected = boxes[stage];
    expect(ink.length > 0).toBe(true);
    expect(ink.every(([x, y]) => expected.some(([left, right, top, bottom]) => x! >= left && x! <= right && y! >= top && y! <= bottom))).toBe(true);
    for (const [left, right, top, bottom] of expected) {
      expect(left >= 0 && right < 60 && top >= 0 && bottom < 18).toBe(true);
      const line = ink.filter(([, y]) => y! >= top && y! <= bottom);
      expect([Math.min(...line.map(([x]) => x!)), Math.max(...line.map(([x]) => x!)),
        Math.min(...line.map(([, y]) => y!)), Math.max(...line.map(([, y]) => y!))]).toEqual([left, right, top, bottom]);
    }
  });
}
for (const c of bbCases) for (const cause of ['pause', 'narrow']) {
  test(`C6 hides basketball text and field after S0: ${c.result} ${cause}`, async ($, on) => {
    const h = setup(on), pk = injected(h, [c.r]); await pk.start(); const ui = await pk.mount();
    await pk.edit('3'); await ui.redraw(); await pk.edit(' '); await ui.redraw();
    await h.clock.set(c.s0); await ui.redraw();
    expect(decode(await raster(ui)).pixels).toEqual(bbExpected(c, 0, 1, c.s0));
    if (cause === 'pause') {
      await pk.edit('9'); await ui.redraw(); expectPaused(await ui.drawn());
    } else {
      const tree = await pk.run('ui.render', { surface: 'terminal', requestId: 'injected', props, viewport: { columns: 65 } }, () => engineTree);
      expect(text(tree)).toBe('Claude 생각 중터미널을 넓히면 게임이 나옵니다');
      expect(leaves(tree).some(e => e.type === 'Raster')).toBe(false);
    }
    const blits = h.blits.length; await h.clock.advance(5000); expect(h.blits).toHaveLength(blits);
  });
}
for (const [r, result] of [[0, 'three'], [.2399, 'three'], [.24, 'bang'], [.4199, 'bang'], [.42, 'downtown'], [.5999, 'downtown'], [.60, 'clank'], [.7499, 'clank'], [.75, 'brick'], [.8999, 'brick'], [.90, 'air'], [.9999, 'air']] as const) {
  test(`G1 one random draw at boundary ${r}`, () => {
    let calls = 0;
    expect(threePoint(() => { calls++; return r; })).toBe(result); expect(calls).toBe(1);
  });
}
test('G2 mulberry32 seed 1 follows all six probability intervals', () => {
  let seed = 1, calls = 0;
  const counts = { three: 0, bang: 0, downtown: 0, clank: 0, brick: 0, air: 0 };
  const random = () => {
    calls++; let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  for (let i = 0; i < 10000; i++) counts[threePoint(random)]++;
  for (const [result, p, tolerance] of [['three', .24, .015], ['bang', .18, .015], ['downtown', .18, .015], ['clank', .15, .01], ['brick', .15, .01], ['air', .10, .01]] as const)
    expect(Math.abs(counts[result] / 10000 - p) <= tolerance).toBe(true);
  expect(calls).toBe(10000);
});
test('G3 all named approved basketball scenes match the independent design', () => {
  for (const [result, ball, at, name] of [
    ['three', 2, 0, 'bb3-shot'], ['three', 2, 300, 'bb3-top'],
    ['clank', 2, 450, 'bb3-clank-0'], ['clank', 2, 600, 'bbt-clank-0'], ['clank', 2, 850, 'bbt-clank-1'],
    ['brick', 2, 400, 'bb3-brick-0'], ['brick', 2, 600, 'bbt-brick-0'], ['brick', 2, 850, 'bbt-brick-1'],
    ['air', 2, 300, 'bb3-air-0'], ['air', 2, 550, 'bbt-air-0'], ['air', 2, 800, 'bbt-air-1'],
    ['three', 2, 550, 'bbt-three-0'], ['three', 2, 650, 'bbt-three-1'], ['bang', 2, 650, 'bbt-bang-1'],
    ['downtown', 2, 550, 'bbt-dt-0'], ['downtown', 2, 650, 'bbt-dt-1'],
    ['bang', 5, 0, 'bb3-shot-m'], ['bang', 5, 300, 'bb3-money-0'], ['bang', 5, 550, 'bbt-mbang-0'], ['bang', 5, 650, 'bbt-mbang-1'],
  ] as const) {
    const shot = basketball(result, 1, ball), c = bbCases.find(c => c.result === result)!;
    const actual = decode(frame(shot.frames.find(([t]) => t === at)![1])).pixels;
    expect(actual).toEqual(expectedBBDesign(name)); expect(bbExpected(c, 1, ball, at)).toEqual(expectedBBDesign(name));
  }
  for (const [cur, ball, name] of [[1, 2, 'bb3-wait-0'], [1, 5, 'bb3-wait-m'], [2, 1, 'bb3-wait-2'], [4, 5, 'bb3-wait-4m'], [1, 3, 'bb3-next']] as const)
    expect(decode(frame(bbWait(cur, ball))).pixels).toEqual(expectedBBDesign(name));
});
for (const c of bbCases) for (const cur of [0, 1, 2, 3, 4]) for (const ball of [2, 5]) {
  test(`G4 G5 G7 every pixel and scheduled blit ${c.result} c${cur} ball${ball}`, async ($, on) => {
    const h = setup(on), timing: Timing = { late: [], scheduled: [], invalidated: [] };
    const pk = injected(h, [c.r], 'dark', timing); await pk.start(); const ui = await pk.mount({ mode: 'requesting' });
    await pk.edit('3'); pk.b.bbSpot = cur; pk.b.bbBall = ball; await ui.redraw();
    expect(decode(await raster(ui)).pixels).toEqual(expectedBBWait(cur, ball));
    expect(text(await ui.drawn())).toBe(board('bb', '점수 0 · 성공 0 · 실패 0', '준비 중'));
    await pk.edit(' '); await ui.redraw(); expect(pk.calls()).toBe(1); expect(h.blits).toHaveLength(0);
    let previous = bbExpected(c, cur, ball, 0);
    expect(decode(await raster(ui)).pixels).toEqual(previous);
    for (const [index, at] of c.times.entries()) {
      await h.clock.set(at - 1); expect(h.blits).toHaveLength(index);
      expect(decode(frame(scene(pk.b, at - 1))).pixels).toEqual(previous);
      if (at <= c.s0) expect(pk.b.bbScore).toEqual({ points: 0, success: 0, fail: 0 });
      if (at === c.s0) {
        await ui.redraw(); expect(text(await ui.drawn())).toBe(board('bb', '점수 0 · 성공 0 · 실패 0', '준비 중'));
      }
      await h.clock.set(at); expect(h.blits).toHaveLength(index + 1);
      previous = bbExpected(c, cur, ball, at);
      expect(decode(h.blits.at(-1)!.cells).pixels).toEqual(previous);
      await ui.redraw(); expect(decode(await raster(ui)).pixels).toEqual(previous);
      const counted = at >= c.s0, good = c.tone === 'good';
      const points = counted && good ? ball === 5 ? 2 : 1 : 0;
      expect(text(await ui.drawn())).toBe(board('bb', `점수 ${points} · 성공 ${counted && good ? 1 : 0} · 실패 ${counted && !good ? 1 : 0}`, '준비 중'));
    }
    await h.clock.advance(3000); expect(h.blits.map(b => b.at)).toEqual([...c.times]);
    expect(pk.calls()).toBe(1); expect(timing.scheduled.every(ms => ms >= 1 && Number.isFinite(ms))).toBe(true);
    expect(h.blits.slice(1).every((b, i) => b.at - h.blits[i]!.at >= 33)).toBe(true);
  });
}
for (const c of bbCases) {
  test(`G5 delayed S0 and late return keep current frames and count once: ${c.result}`, async ($, on) => {
    const pre = c.tone === 'warn' ? c.times[1] : 300;
    const late = c.tone === 'warn' ? [0, c.s0 - pre - 20] : [c.s0 - pre - 20];
    const h = setup(on), timing: Timing = { late, scheduled: [], invalidated: [] };
    const pk = injected(h, [c.r], 'dark', timing); await pk.start(); const ui = await pk.mount({ mode: 'requesting' });
    await pk.edit('3'); await ui.redraw(); await pk.edit(' '); await ui.redraw();
    await h.clock.set(c.s0); expect(h.blits.at(-1)!.at).toBe(c.s0 - 20);
    expect(pk.b.bbScore).toEqual({ points: 0, success: 0, fail: 0 });
    await h.clock.set(c.s0 + 13); expect(h.blits.at(-1)!.at).toBe(c.s0 + 13);
    expect(decode(h.blits.at(-1)!.cells).pixels).toEqual(bbExpected(c, 0, 1, c.s0));
    await h.clock.set(c.times.at(-1)!);
    expect(h.blits.some(b => JSON.stringify(decode(b.cells).pixels) === JSON.stringify(bbExpected(c, 0, 1, c.s0 + 100)))).toBe(true);
    expect(pk.b.bbScore).toEqual(c.tone === 'good' ? { points: 1, success: 1, fail: 0 } : { points: 0, success: 0, fail: 1 });
    expect(decode(h.blits.at(-1)!.cells).pixels).toEqual(expectedBBWait(0, 2));
    expect(timing.scheduled.every(ms => ms >= 1 && Number.isFinite(ms))).toBe(true);
    expect(h.blits.slice(1).every((b, i) => b.at - h.blits[i]!.at >= 33)).toBe(true);
  });
  test(`G5 callback after return displays S1 then waits 33ms: ${c.result}`, async ($, on) => {
    const h = setup(on), timing: Timing = { late: [3000], scheduled: [], invalidated: [] };
    const pk = injected(h, [c.r], 'dark', timing); await pk.start(); const ui = await pk.mount({ mode: 'requesting' });
    await pk.edit('3'); await ui.redraw(); await pk.edit(' '); await ui.redraw();
    await h.clock.set(3300); expect(h.blits).toHaveLength(1);
    const last = c.times[c.times.length - 2]!;
    expect(decode(h.blits[0]!.cells).pixels).toEqual(bbExpected(c, 0, 1, last));
    await ui.redraw(); await h.clock.set(3332); await ui.redraw();
    expect(decode(await raster(ui)).pixels).toEqual(bbExpected(c, 0, 1, last));
    await h.clock.set(3333); expect(h.blits.map(b => b.at)).toEqual([3300, 3333]);
    expect(decode(h.blits[1]!.cells).pixels).toEqual(expectedBBWait(0, 2));
    expect(pk.b.bbScore).toEqual(c.tone === 'good' ? { points: 1, success: 1, fail: 0 } : { points: 0, success: 0, fail: 1 });
    expect(timing.scheduled.every(ms => ms >= 1 && Number.isFinite(ms))).toBe(true);
  });
}
test('G6 G7 full 25-ball cycle, money scoring, independent scores and turn reset', async ($, on) => {
  const h = setup(on), pk = injected(h, [.60, .60, .60, .60, .24]); await pk.start(); const ui = await pk.mount({ mode: 'requesting' });
  await pk.edit('3');
  let time = 0;
  for (let i = 0; i < 25; i++) {
    const cur = Math.floor(i / 5), ball = i % 5 + 1;
    await ui.redraw(); expect(pk.b.bbSpot).toBe(cur); expect(pk.b.bbBall).toBe(ball);
    expect(decode(await raster(ui)).pixels).toEqual(expectedBBWait(cur, ball));
    expect(scene(pk.b, time).bb).toEqual({ cur, rack: 5 - ball, hold: ball === 5 ? 'money' : 'bb' });
    await pk.edit(' '); await ui.redraw();
    await h.clock.set(time + (ball === 5 ? 550 : 600));
    if (i === 4) {
      await ui.redraw(); expect(text(await ui.drawn())).toBe(board('bb', '점수 2 · 성공 1 · 실패 4', '준비 중'));
    }
    time += ball === 5 ? 2150 : 2200; await h.clock.set(time);
  }
  expect(pk.calls()).toBe(25); expect(pk.b.bbSpot).toBe(0); expect(pk.b.bbBall).toBe(1);
  expect(pk.b.bbScore).toEqual({ points: 10, success: 5, fail: 20 });
  expect(pk.b.score).toEqual({ goal: 0, save: 0, miss: 0 }); expect(pk.b.batScore).toEqual({ homerun: 0, hit: 0, strikeout: 0 });
  await pk.complete(); await pk.start('again'); await ui.redraw();
  expect(pk.b.mode).toBe('bat'); await pk.edit('3'); await ui.redraw();
  expect(pk.b.mode).toBe('bb'); expect(pk.b.bbSpot).toBe(0); expect(pk.b.bbBall).toBe(1);
  expect(pk.b.bbScore).toEqual({ points: 0, success: 0, fail: 0 });
  expect(decode(await raster(ui)).pixels).toEqual(expectedBBWait(0, 1));
});
for (const c of bbCases) {
  test(`G8 locks all switches and repeat Space, then pauses before S0: ${c.result}`, async ($, on) => {
    const h = setup(on), pk = injected(h, [c.r]); await pk.start(); const ui = await pk.mount({ mode: 'requesting' });
    for (const [key, mode] of [['3', 'bb'], ['1', 'kick'], ['2', 'bat'], ['3', 'bb']] as const) {
      expect(await pk.edit(key)).toEqual({ text: '', cursor: 0 }); expect(pk.b.mode).toBe(mode);
    }
    await ui.redraw(); await pk.edit(' '); await ui.redraw();
    for (const at of [0, 300, c.s0 - 1]) {
      await h.clock.set(at);
      for (const key of ['1', '2', '3', ' ', '   ']) expect(await pk.edit(key)).toEqual({ text: '', cursor: 0 });
      expect(pk.b.mode).toBe('bb'); expect(pk.calls()).toBe(1);
    }
    expect(await pk.edit('9')).toEqual({ text: '', cursor: 0 }); await ui.redraw();
    expect(text(await ui.drawn())).toBe('Claude 준비 중clutch 멈춤 · 다음 질문에서 다시 켜집니다'); expect(await ui.find({ type: 'Raster' })).toBeUndefined();
    const blits = h.blits.length; await h.clock.advance(5000); expect(h.blits).toHaveLength(blits);
    expect(pk.b.bbScore).toEqual({ points: 0, success: 0, fail: 0 }); expect(pk.b.bb).toBeUndefined();
    await pk.start('next'); await ui.redraw(); expect(pk.b.mode).toBe('bat');
    await pk.edit('3'); await ui.redraw(); expect(pk.b.mode).toBe('bb');
    expect(decode(await raster(ui)).pixels).toEqual(expectedBBWait(0, 1));
  });
  test(`G8 lock persists from S0 through hold: ${c.result}`, async ($, on) => {
    const h = setup(on), pk = injected(h, [c.r]); await pk.start(); const ui = await pk.mount({ mode: 'requesting' });
    await pk.edit('3'); await ui.redraw(); await pk.edit(' '); await ui.redraw();
    for (const at of [c.s0, c.s0 + 100, c.times.at(-1)! - 1]) {
      await h.clock.set(at);
      for (const key of ['1', '2', '3', ' ']) expect(await pk.edit(key)).toEqual({ text: '', cursor: 0 });
      expect(pk.b.mode).toBe('bb'); expect(pk.calls()).toBe(1);
    }
  });
}
for (const context of ['draft', 'outside', 'narrow', 'disabled', 'no-site', 'subagent']) {
  test(`G8 key 3 delegates exact next result when ${context}`, async ($, on) => {
    const h = setup(on), pk = injected(h, [0]), sentinel = { text: 'host result', cursor: 2 };
    h.observed.editResult = sentinel;
    if (context !== 'outside') await pk.start();
    if (context !== 'no-site') await pk.mount();
    if (context === 'narrow') await pk.run('ui.render', { surface: 'terminal', requestId: 'narrow', props, viewport: { columns: 65 } }, () => engineTree);
    if (context === 'disabled') pk.b.enabled = false;
    const result = context === 'subagent'
      ? await pk.run('prompt.edit', { inputText: '3', text: '', agentId: 'worker' }, () => sentinel)
      : await pk.edit('3', context === 'draft' ? 'text' : '');
    expect(result).toBe(sentinel); expect(pk.calls()).toBe(0); expect(pk.b.mode).toBe('kick');
  });
}
test('G8 selection random excludes last sport across turns and ignores invalid stored values', async ($, on) => {
  let selection = .8;
  const h = setup(on), pk = injected(h, [.9], 'dark', undefined, () => selection);
  await pk.session(); await pk.start(); const ui = await pk.mount();
  expect(await pk.edit('3')).toEqual({ text: '', cursor: 0 }); await ui.redraw(props); expect(h.store.sport).toBe('bb');
  for (const restart of [false, true]) {
    await pk.complete(); if (restart) await pk.session();
    await pk.start(); await ui.redraw(props); expect(decode(await raster(ui)).pixels).toEqual(restart ? expectedBBWait(0, 1) : expectedSky('sky-wait'));
  }
  selection = 0;
  for (const value of ['unknown', 3, null]) {
    h.store.sport = value; await pk.session(); await pk.start(); await ui.redraw(props);
    expect(decode(await raster(ui)).pixels).toEqual(expectedPixels());
    expect(h.store.sport).toBe('kick');
  }
});
for (const theme of ['dark', 'light']) {
  test(`G7 scoreboard colors stay unchanged in ${theme}`, async ($, on) => {
    const h = setup(on), pk = injected(h, [.9], theme); await pk.start(); const ui = await pk.mount({ mode: 'requesting' });
    await pk.edit('3'); await ui.redraw();
    for (const at of [0, 549, 550, 2150]) {
      if (at === 0) { await pk.edit(' '); await ui.redraw(); } else await h.clock.set(at);
      await ui.redraw(); const tree = await ui.drawn();
      expectStyles(tree, 'bb', theme, at < 2150, `점수 0 · 성공 0 · 실패 ${at >= 550 ? 1 : 0}`);
      expect(text(tree)).toBe(board('bb', `점수 0 · 성공 0 · 실패 ${at >= 550 ? 1 : 0}`, '준비 중'));
    }
  });
}

// Check text bounds including outlines against actual pixel differences.
for (const [result, boxes] of [
  ['goal z0', [[8, 52, 7, 11], [3, 57, 6, 12]]],
  ['save z0', [[11, 49, 7, 11], [7, 53, 6, 12]]],
  ['hr', [[12, 48, 7, 11], [7, 52, 6, 12], [3, 57, 5, 13]]],
  ['3b', [[14, 46, 7, 11], [11, 49, 6, 12], [8, 52, 5, 13]]],
  ['2b', [[17, 43, 7, 11], [14, 46, 6, 12], [11, 49, 5, 13]]],
  ['1b', [[23, 36, 7, 11], [22, 38, 6, 12], [20, 39, 5, 13]]],
  ['foul', [[14, 46, 7, 11], [9, 50, 6, 12], [5, 55, 5, 13]]],
  ['k', [[9, 50, 7, 11], [5, 55, 6, 12], [0, 59, 5, 13]]],
] as const) for (const [stage, box] of boxes.entries()) {
  test(`P17 T1 centered text bounds: ${result} S${stage}`, () => {
    const sample = landings.find(c => c.name === result);
    const b = createRuntime();
    let calls = 0;
    if (sample) { b.shot = shoot(() => sample.random[calls++]!); b.kickAt = 0; }
    const current = sample ? scene(b, stage === 0 ? 250 : 350)
      : atBat(result as BatResult).frames.find(([, scene]) => scene.text?.stage === stage)![1];
    const actual = decode(frame(current)).pixels, base = decode(frame({ ...current, text: undefined })).pixels;
    const ink = actual.flatMap((row, y) => row.flatMap((pixel, x) => pixel !== base[y]![x] ? [[x, y]] : []));
    expect(ink.length > 0).toBe(true);
    expect([Math.min(...ink.map(([x]) => x!)), Math.max(...ink.map(([x]) => x!)),
      Math.min(...ink.map(([, y]) => y!)), Math.max(...ink.map(([, y]) => y!))]).toEqual(box);
    const [left, right, top, bottom] = box;
    expect(left >= 0 && right < 60 && top >= 0 && bottom < 18).toBe(true);
  });
}
for (const sample of landings) {
  test(`P17 T2 T4 centered kick preserves scheduled frames: ${sample.name}`, async ($, on) => {
    const h = setup(on), timing: Timing = { late: [], scheduled: [], invalidated: [] };
    const pk = injected(h, sample.random, 'dark', timing); await pk.start(); await pk.mount(); await pk.edit(' ');
    for (const [at, stage] of [[250, 0], [350, 1], [1749, 1]] as const) {
      await h.clock.set(at);
      const good = sample.name.startsWith('goal');
      expect(decode(h.blits.at(-1)!.cells).pixels).toEqual(expectedPixels(sample.x, sample.y, { ...sample.options, kick: true,
        text: { value: good ? 'GOOOOOOOAL!!!!!!!' : 'BOOOOOOO!!!!!!!', stage, tone: good ? 'good' : 'bad' } }));
    }
    await h.clock.set(1750);
    expect(h.blits.filter(b => b.at >= 250).map(b => b.at)).toEqual([250, 350, 1750]);
    expect(h.blits.slice(1).every((b, i) => b.at - h.blits[i]!.at >= 33)).toBe(true);
    expect(timing.scheduled.every(ms => Number.isFinite(ms) && ms >= 1)).toBe(true);
    expect(timing.scheduled).toHaveLength(h.blits.length);
  });
}
for (const sport of ['kick', 'bat'] as const) for (const cause of ['pause', 'narrow']) {
  test(`P17 T5 hides centered text and field: ${sport} ${cause}`, async ($, on) => {
    const h = setup(on), pk = injected(h, sport === 'kick' ? goalLeft : [0]); await pk.start(); const ui = await pk.mount();
    if (sport === 'bat') { await pk.edit('2'); await ui.redraw(); }
    await pk.edit(' '); await h.clock.set(sport === 'kick' ? 350 : 1200); await ui.redraw();
    expect(decode(await raster(ui)).pixels).toEqual(sport === 'kick' ? goalText(1) : batPixels(batCases[0]!, 2));
    if (cause === 'pause') {
      await pk.edit('9'); await ui.redraw(); expectPaused(await ui.drawn());
    } else {
      const tree = await pk.run('ui.render', { surface: 'terminal', requestId: 'injected', props, viewport: { columns: 65 } }, () => engineTree);
      expect(text(tree)).toBe('Claude 생각 중터미널을 넓히면 게임이 나옵니다');
      expect(leaves(tree).some(e => e.type === 'Raster')).toBe(false);
    }
    const blits = h.blits.length; await h.clock.advance(5000); expect(h.blits).toHaveLength(blits);
  });
}

for (const size of [3, 4, 5]) {
  const sports = size === 3 ? [...SPORTS] : Array.from({ length: size }, (_, i) => `sport${i}`);
  test(`P18 R1 R2 selection boundaries and one draw for ${size} sports`, () => {
    for (const current of [undefined, ...sports]) {
      const choices = sports.filter(sport => sport !== current);
      for (let i = 0; i < choices.length; i++) for (const r of [i / choices.length, (i + 1) / choices.length - .000001]) {
        let calls = 0;
        expect(pickSport(sports, () => { calls++; return r; }, current)).toBe(choices[i]);
        expect(calls).toBe(1);
      }
    }
    if (size === 3) for (const [r, sport] of [[0, 'kick'], [.3333, 'kick'], [1 / 3, 'bat'], [.6666, 'bat'], [2 / 3, 'bb'], [.9999, 'bb']] as const)
      expect(pickSport(sports, () => r)).toBe(sport);
    if (size === 3) for (const current of sports) for (const r of [0, .4999, .5, .9999])
      expect(pickSport(sports, () => r, current)).toBe(sports.filter(sport => sport !== current)[r < .5 ? 0 : 1]);
  });
  test(`P18 R2 seeded 30000 selections are uniform for ${size} sports`, () => {
    for (const current of [undefined, ...sports]) {
      let seed = 1, calls = 0;
      const random = () => {
        calls++; let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
      const counts = new Map(sports.map(sport => [sport, 0]));
      for (let i = 0; i < 30000; i++) { const sport = pickSport(sports, random, current); counts.set(sport, counts.get(sport)! + 1); }
      expect(calls).toBe(30000);
      for (const sport of sports) {
        if (sport === current) expect(counts.get(sport)).toBe(0);
        else expect(Math.abs(counts.get(sport)! / 30000 - 1 / (size - (current === undefined ? 0 : 1))) <= .01).toBe(true);
      }
    }
  });
}
const rotationWait = {
  kick: '골 0 · 선방 0 · 빗나감 0',
  bat: '홈런 0 · 안타 0 · 삼진 0',
  bb: '점수 0 · 성공 0 · 실패 0',
};
function rotationPixels(sport: typeof SPORTS[number]) {
  return sport === 'kick' ? expectedPixels() : sport === 'bat' ? expectedSky('sky-wait') : expectedBBWait(0, 1);
}
for (const [index, sport] of SPORTS.entries()) {
  test(`P18 R3 R4 ${sport} first start without history; exact idle rotation at 60000 and 120000`, async ($, on) => {
    let calls = 0;
    const h = setup(on);
    const pk = injected(h, goalLeft, 'dark', undefined, () => { calls++; return index / 3; });
    await pk.session(); await pk.start(); const ui = await pk.mount();
    expect(pk.b.mode).toBe(sport); expect(calls).toBe(1); expect(pk.calls()).toBe(0);
    expect(decode(await raster(ui)).pixels).toEqual(rotationPixels(sport));
    await pk.run('turn.start', { turnId: 'sub', agentId: 'worker' }); expect(calls).toBe(1);
    await h.clock.set(59999); expect(pk.b.mode).toBe(sport);
    const next = SPORTS.filter(s => s !== sport)[Math.floor(index / 3 * 2)]!;
    await h.clock.set(60000); expect(pk.b.mode).toBe(next); expect(calls).toBe(2);
    expect(text(await ui.drawn())).toBe(board(next, rotationWait[next]));
    expect(decode(await raster(ui)).pixels).toEqual(rotationPixels(next));
    await h.clock.set(120000); expect(pk.b.mode === next).toBe(false); expect(calls).toBe(3);
    await pk.edit('1'); await pk.edit('2'); await pk.edit('3'); await pk.b.sportWrites;
    expect(h.store.sport).toBe('bb'); expect(pk.calls()).toBe(0);
    expect(h.observed.storeGets.filter(key => key === 'sport')).toHaveLength(1); expect(h.observed.storeSets.includes('sport')).toBe(true);
  });
  test(`P18 R5 ${sport} finishes exactly once before overdue rotation`, async ($, on) => {
    let choices = 0;
    const h = setup(on), pk = injected(h, sport === 'kick' ? goalLeft : [.1], 'dark', undefined, () => choices++ === 0 ? index / 3 : 0);
    await pk.start(); const ui = await pk.mount();
    const began = sport === 'kick' ? 59000 : sport === 'bat' ? 59500 : 59800;
    await h.clock.set(began); await pk.edit(' '); await ui.redraw();
    const end = began + (sport === 'kick' ? 1750 : sport === 'bat' ? 2900 : 2150);
    await h.clock.set(60000); expect(pk.b.mode).toBe(sport); expect(choices).toBe(1);
    await h.clock.set(end - 1); expect(pk.b.mode).toBe(sport);
    await h.clock.set(end);
    const next = SPORTS.find(s => s !== sport)!;
    expect(pk.b.mode).toBe(next); expect(pk.b.switchedAt).toBe(end); expect(choices).toBe(2);
    expect(h.blits.at(-1)!.at).toBe(end);
    expect(decode(h.blits.at(-1)!.cells).pixels).toEqual(rotationPixels(next));
    await expectReady(ui, next, '생각 중');
    const scores = JSON.stringify([pk.b.score, pk.b.batScore, pk.b.bbScore]);
    expect(sport === 'kick' ? pk.b.score.goal : sport === 'bat' ? pk.b.batScore.hit : pk.b.bbScore.success).toBe(1);
    expect(pk.calls()).toBe(sport === 'kick' ? 5 : 1);
    await h.clock.set(end + 60000); expect(JSON.stringify([pk.b.score, pk.b.batScore, pk.b.bbScore])).toBe(scores);
    await pk.edit(String(index + 1)); await ui.redraw();
    expect(pk.b.mode).toBe(sport); expect(JSON.stringify([pk.b.score, pk.b.batScore, pk.b.bbScore])).toBe(scores);
    if (sport === 'bb') { expect(pk.b.bbSpot).toBe(0); expect(pk.b.bbBall).toBe(2); expect(decode(await raster(ui)).pixels).toEqual(expectedBBWait(0, 2)); }
  });
}
test('P18 R4 R6 manual switch resets the full interval', async ($, on) => {
  const h = setup(on), pk = injected(h, goalLeft, 'dark', undefined, () => 0);
  await pk.start(); await pk.mount();
  await h.clock.set(30000); await pk.edit('3');
  await h.clock.set(89999); expect(pk.b.mode).toBe('bb');
  await h.clock.set(90000); expect(pk.b.mode).toBe('kick');
  await h.clock.set(210000);
  await pk.edit('2'); await h.clock.set(269999); expect(pk.b.mode).toBe('bat');
  await h.clock.set(270000); expect(pk.b.mode).toBe('kick');
});
for (const end of ['pause', 'complete', 'session', 'off']) {
  test(`P18 R6 R9 ${end} stops rotation and blits; next turn selects anew`, async ($, on) => {
    let choices = 0;
    const h = setup(on), pk = injected(h, goalLeft, 'dark', undefined, () => choices++ === 0 ? 0 : .9);
    await pk.start(); const ui = await pk.mount();
    if (end === 'pause') await pk.edit('9');
    else if (end === 'complete') await pk.complete();
    else if (end === 'session') await pk.run('session.end', {});
    else await pk.run('command.run', { args: '' });
    const before = JSON.stringify(await ui.drawn()), blits = h.blits.length;
    await h.clock.set(180000);
    expect(pk.b.sport).toBe(end === 'complete' ? 'bb' : 'kick'); expect(choices).toBe(end === 'complete' ? 2 : 1); expect(h.blits).toHaveLength(blits);
    expect(JSON.stringify(await ui.drawn())).toBe(before); expect(pk.b.rotationTimer).toBeUndefined();
    if (end === 'off') await pk.run('command.run', { args: '' });
    await pk.start('next'); expect(pk.b.mode).toBe('bb'); expect(pk.b.paused).toBe(false); expect(choices).toBe(2);
  });
}
test('P18 R9 narrow field rotates without blits and redraws the new idle scene', async ($, on) => {
  const h = setup(on), pk = injected(h, goalLeft, 'dark', undefined, () => 0);
  await pk.start();
  await pk.run('ui.render', { surface: 'terminal', requestId: 'narrow', viewport: { columns: 65 }, props }, () => engineTree);
  await h.clock.set(60000); expect(pk.b.mode).toBe('bat'); expect(h.blits).toHaveLength(0);
  const ui = await pk.mount(); expect(decode(await raster(ui)).pixels).toEqual(expectedSky('sky-wait'));
});
test('P18 R9 throwing invalidate preserves selection, future rotations and Space consumption', async ($, on) => {
  const h = setup(on);
  const pk = injected(h, goalLeft, 'dark', undefined, () => 0);
  await pk.start(); await pk.mount(); h.faults.invalidate = true;
  await h.clock.set(60000); expect(pk.b.mode).toBe('bat');
  expect(await pk.edit(' ')).toEqual({ text: '', cursor: 0 }); expect(h.edits).toEqual([]);
  await h.clock.set(120000); expect(pk.b.mode).toBe('kick');
  expect(await pk.edit(' ')).toEqual({ text: '', cursor: 0 }); expect(h.edits).toEqual([]);
});
test('P18 R4 host idle timer invalidates both scoreboard and field without input', async ($, on) => {
  const h = setup(on); await session($); await start($); const ui = await mount($);
  const before = text(await ui.drawn()), cells = await raster(ui);
  await h.clock.set(59999); expect(text(await ui.drawn())).toBe(before); expect(await raster(ui)).toBe(cells);
  await h.clock.set(60000);
  expect(text(await ui.drawn()) === before).toBe(false); expect(await raster(ui) === cells).toBe(false);
  expect(h.observed.storeGets.filter(key => key === 'sport')).toHaveLength(1); expect(h.observed.storeSets.includes('sport')).toBe(true);
});

for (const [index, sport] of SPORTS.entries()) {
  test(`N1 first turn selects ${sport} with one random draw`, async ($, on) => {
    let calls = 0;
    const h = setup(on), pk = injected(h, goalLeft, 'dark', undefined, () => { calls++; return index / 3; });
    await pk.session(); await pk.start();
    expect(pk.b.mode).toBe(sport); expect(calls).toBe(1);
    expect(h.observed.storeGets.filter(key => key === 'sport')).toHaveLength(1);
    expect(h.store.sport).toBe(sport);
  });
  for (const random of [0, .4999, .5, .9999]) {
    test(`N2 next turn excludes ${sport} at ${random}`, async ($, on) => {
      let calls = 0;
      const h = setup(on), pk = injected(h, goalLeft, 'dark', undefined, () => calls++ === 0 ? index / 3 : random);
      await pk.session(); await pk.start(); expect(pk.b.mode).toBe(sport);
      await pk.complete(); await pk.start('next');
      expect(pk.b.mode).toBe(SPORTS.filter(s => s !== sport)[random < .5 ? 0 : 1]);
      expect(calls).toBe(2); expect(h.observed.storeGets.filter(key => key === 'sport')).toHaveLength(1);
    });
  }
  for (const random of [0, .5]) {
    test(`N4 new runtime excludes stored ${sport} at ${random}`, async ($, on) => {
      const h = setup(on, { sport }), pk = injected(h, goalLeft, 'dark', undefined, () => random);
      await pk.session(); await pk.start();
      expect(pk.b.mode).toBe(SPORTS.filter(s => s !== sport)[random === 0 ? 0 : 1]);
    });
  }
}
for (const sport of [undefined, 'invalid', null, 3]) for (const [index, expected] of SPORTS.entries()) {
  test(`N4 absent or invalid stored ${sport} selects ${expected} from all sports`, async ($, on) => {
    const h = setup(on, { sport }), pk = injected(h, goalLeft, 'dark', undefined, () => index / 3);
    await pk.session(); await pk.start(); expect(pk.b.mode).toBe(expected);
  });
}
for (const cause of ['rotation', 'key']) {
  test(`N3 ${cause} keeps the last actual sport across turns`, async ($, on) => {
    let random = 0;
    const h = setup(on), pk = injected(h, goalLeft, 'dark', undefined, () => random);
    await pk.session(); await pk.start(); await pk.mount();
    if (cause === 'rotation') await h.clock.set(60000);
    else await pk.edit('3');
    const last = cause === 'rotation' ? 'bat' : 'bb';
    expect(pk.b.mode).toBe(last); expect(h.store.sport).toBe(last);
    random = .5;
    await pk.complete(); await pk.start('next');
    expect(pk.b.mode).toBe(cause === 'rotation' ? 'bb' : 'bat');
  });
}
for (const fault of ['delay', 'failure']) {
  test(`N5 ordered sport writes survive ${fault} without blocking input or turn selection`, async ($, on) => {
    const h = setup(on), pk = injected(h, goalLeft, 'dark', undefined, () => 0);
    await pk.session();
    h.faults.sportDelay = fault === 'delay' ? 1000 : 0; h.faults.sport = fault === 'failure';
    await withoutAdvancing(h.clock, pk.start()); await pk.mount();
    for (const key of ['2', '3', '2']) expect(await withoutAdvancing(h.clock, pk.edit(key))).toEqual({ text: '', cursor: 0 });
    expect(h.clock.now()).toBe(0); expect(h.edits).toEqual([]);
    await pk.complete(); await withoutAdvancing(h.clock, pk.start('next'));
    expect(pk.b.mode).toBe('kick');
    if (fault === 'delay') {
      expect(h.store.sport).toBeUndefined();
      for (const expected of ['kick', 'bat', 'bb', 'bat', 'kick']) {
        await h.clock.advance(1000); expect(h.store.sport).toBe(expected);
      }
    } else {
      expect(h.store.sport).toBeUndefined(); h.faults.sport = false;
      await pk.mount(); await pk.edit('3'); await h.clock.settle(); expect(h.store.sport).toBe('bb');
    }
    expect(h.observed.storeSets.filter(key => key === 'sport')).toHaveLength(fault === 'delay' ? 5 : 6);
  });
}
test('N6 3000 seeded real turns never repeat and have uniform sport counts', async ($, on) => {
  let seed = 1;
  const random = () => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  const h = setup(on), pk = injected(h, goalLeft, 'dark', undefined, random);
  const counts = { kick: 0, bat: 0, bb: 0 };
  let previous: typeof SPORTS[number] | undefined, repeats = 0;
  await pk.session();
  for (let i = 0; i < 3000; i++) {
    await pk.start(String(i));
    if (pk.b.sport === previous) repeats++;
    counts[pk.b.sport]++; previous = pk.b.sport; await pk.complete();
  }
  expect(repeats).toBe(0);
  for (const sport of SPORTS) expect(Math.abs(counts[sport] / 3000 - 1 / 3) <= .03).toBe(true);
});

async function expectReady(ui: Awaited<ReturnType<ReturnType<typeof injected>['mount']>>, sport: typeof SPORTS[number], activity: string) {
  expect(text(await ui.drawn())).toBe(board(sport, rotationWait[sport], activity));
  expect(decode(await raster(ui)).pixels).toEqual(rotationPixels(sport));
}
for (const [index, sport] of SPORTS.entries()) for (const random of [0, .5]) for (const renderFirst of [true, false]) {
  test(`D1 D2 D4 complete ${sport}, draw ${random}, render first ${renderFirst}`, async ($, on) => {
    let calls = 0;
    const h = setup(on), pk = injected(h, goalLeft, 'dark', undefined, () => calls++ === 0 ? index / 3 : random);
    await pk.session(); await pk.start(); await pk.mount(); await pk.b.sportWrites;
    expect(pk.b.sport).toBe(sport);
    const writes = h.observed.storeSets.filter(key => key === 'sport').length;
    await pk.run('turn.complete', { turnId: pk.b.turn, agentId: 'worker' });
    await pk.run('turn.complete', { turnId: 'unrelated' });
    expect(calls).toBe(1); expect(pk.b.turn).toBe('main');
    await pk.complete();
    const next = SPORTS.filter(s => s !== sport)[random === 0 ? 0 : 1]!;
    expect(pk.b.sport).toBe(next); expect(pk.b.mode).toBe(next); expect(calls).toBe(2);
    expect(pk.b.last).toBe(sport); expect(h.store.sport).toBe(sport);
    expect(h.observed.storeSets.filter(key => key === 'sport')).toHaveLength(writes);
    expect(pk.b.rotationTimer).toBeUndefined(); expect(pk.b.turn).toBeUndefined();
    await h.clock.set(120000); expect(calls).toBe(2);
    const ui = renderFirst ? await pk.mount() : undefined;
    if (ui) await expectReady(ui, next, '준비 중');
    await pk.start('next');
    expect(pk.b.sport).toBe(next); expect(pk.b.last).toBe(next); expect(calls).toBe(2);
    expect(pk.b.switchedAt).toBe(120000); await pk.b.sportWrites;
    expect(h.store.sport).toBe(next); expect(h.observed.storeSets.filter(key => key === 'sport')).toHaveLength(writes + 1);
    if (ui) await expectReady(ui, next, '준비 중');
    else await expectReady(await pk.mount(), next, '생각 중');
    await h.clock.set(179999); expect(calls).toBe(2);
    await h.clock.set(180000); expect(calls).toBe(3);
  });
}
for (const stored of ['kick', undefined, 'invalid', null, 3]) for (const [index, sport] of SPORTS.entries()) for (const renderFirst of [true, false]) {
  if (stored === 'kick' && sport === 'kick') continue;
  test(`D3 D4 session stored ${stored}, prepare ${sport}, render first ${renderFirst}`, async ($, on) => {
    let calls = 0;
    const random = stored === 'kick' ? (index - 1) / 2 : index / 3;
    const h = setup(on, { sport: stored }), pk = injected(h, goalLeft, 'dark', undefined, () => { calls++; return random; });
    await pk.session();
    expect(pk.b.sport).toBe(sport); expect(pk.b.mode).toBe(sport); expect(calls).toBe(1);
    expect(h.store.sport).toBe(stored); expect(h.observed.storeSets.filter(key => key === 'sport')).toHaveLength(0);
    expect(pk.b.last).toBe(stored === 'kick' ? 'kick' : undefined); expect(pk.b.rotationTimer).toBeUndefined();
    const ui = renderFirst ? await pk.mount() : undefined;
    if (ui) await expectReady(ui, sport, '준비 중');
    await pk.start(); expect(calls).toBe(1); expect(pk.b.sport).toBe(sport);
    if (ui) await expectReady(ui, sport, '준비 중');
    else await expectReady(await pk.mount(), sport, '생각 중');
    await pk.b.sportWrites; expect(h.store.sport).toBe(sport);
    expect(h.observed.storeSets.filter(key => key === 'sport')).toHaveLength(1);
  });
}
for (const failure of [false, true]) {
  test(`D2 fallback redraws a different previous field, invalidate failure ${failure}`, async ($, on) => {
    let calls = 0;
    const h = setup(on), timing: Timing = { late: [], scheduled: [], invalidated: [] };
    const pk = injected(h, goalLeft, 'dark', timing, () => { calls++; return .5; });
    const ui = await pk.mount(); await expectReady(ui, 'kick', '준비 중');
    h.faults.invalidate = failure;
    await pk.start(); expect(pk.b.sport).toBe('bat'); expect(calls).toBe(1);
    if (!failure) { expect(timing.invalidated).toEqual([0]); await expectReady(ui, 'bat', '생각 중'); }
    expect(await pk.edit(' ')).toEqual({ text: '', cursor: 0 }); expect(pk.b.bat).toBeDefined();
  });
}

// Resolve inherited Text styles per character, including unstyled spaces and numbers.
type StyledChar = { char: string; color?: unknown; backgroundColor?: unknown; weight: unknown };
function styled(tree: RenderElement | string, inherited: Omit<StyledChar, 'char'> = { weight: 'regular' }): StyledChar[] {
  if (typeof tree === 'string') return [...tree].map(char => ({ char, ...inherited }));
  const own = 'props' in tree ? tree.props as Record<string, unknown> : {};
  const style = { ...inherited };
  for (const key of ['color', 'backgroundColor', 'weight'] as const) if (own?.[key] !== undefined) style[key] = own[key];
  expect(own?.bold).toBeUndefined();
  return 'children' in tree ? (tree.children ?? []).flatMap(child => styled(child, style)) : [];
}
function expectStyles(tree: RenderElement, sport: typeof SPORTS[number], theme: string, locked: boolean, totals = rotationWait[sport], activity = '준비 중') {
  const c = theme.startsWith('light')
    ? { strong: '#111418', body: '#24292F', dim: '#6E7781', claude: '#B5502D', space: '#8A5A00', spaceText: '#FFFFFF', key: '#D8D5CC' }
    : { strong: '#F4F1EA', body: '#D7DAE0', dim: '#7D8590', claude: '#D97757', space: '#FFD23F', spaceText: '#111418', key: '#3A3F4B' };
  const chars = (value: string, color: string, weight = 'regular', backgroundColor?: string): StyledChar[] =>
    [...value].map(char => ({ char, color, weight, ...(backgroundColor === undefined ? {} : { backgroundColor }) }));
  const rows = leaves(tree).filter(n => n.type === 'Text');
  expect(rows).toHaveLength(3);
  expect(styled(rows[0]!)).toEqual([...chars('Claude', c.claude, 'bold'), ...chars(' ' + activity, c.strong, 'bold')]);
  const score = [...chars(gameNames[sport], c.strong, 'bold'), ...chars(' │ ', c.dim)];
  for (const [i, entry] of totals.split(' · ').entries()) {
    if (i) score.push(...chars(' · ', c.dim));
    const split = entry.lastIndexOf(' ');
    score.push(...chars(entry.slice(0, split + 1), c.body), ...chars(entry.slice(split + 1), c.strong, 'bold'));
  }
  expect(styled(rows[1]!)).toEqual(score);
  const keys: StyledChar[] = [];
  const hints = sport === 'kick' ? [['Space', '슛'], ['2', '야구'], ['3', '3점슛 콘테스트'], ['9', '멈춤']]
    : sport === 'bat' ? [['Space', '스윙'], ['1', '승부차기'], ['3', '3점슛 콘테스트'], ['9', '멈춤']]
    : [['Space', '슛'], ['1', '승부차기'], ['2', '야구'], ['9', '멈춤']];
  for (const [i, [key, label]] of hints.entries()) {
    if (i) keys.push(...chars('  ', c.body));
    const disabled = locked && key !== '9';
    keys.push(...chars(` ${key} `, disabled ? c.dim : key === 'Space' ? c.spaceText : c.strong,
      disabled ? 'regular' : 'bold', disabled ? undefined : key === 'Space' ? c.space : c.key));
    keys.push(...chars(` ${label}`, disabled ? c.dim : c.body));
  }
  expect(styled(rows[2]!)).toEqual(keys);
}
function expectCurrentNames(tree: RenderElement) {
  // The obsolete standalone label must not reject the current penalty-shootout name containing it.
  expect(text(tree).replaceAll('승부차기', '')).not.toMatch(/패널티킥|시제품|차기|타격|보정|Claude:/);
}
for (const columns of [80, 120]) for (const sport of SPORTS) {
  test(`E1 E8 exact three rows and aligned field ${columns} ${sport}`, async ($, on) => {
    const h = setup(on), pk = injected(h, goalLeft, 'dark', undefined, () => SPORTS.indexOf(sport) / 3);
    await pk.start(); const ui = await pk.mount({ mode: 'requesting' }, 'scoreboard', columns), tree = await ui.drawn();
    const rows = leaves(tree);
    expect(rows.map(n => n.type)).toEqual(['engine', 'Text', 'Text', 'Text', 'Raster']);
    expect(rows[0]).toEqual(engineTree);
    expect(rows.slice(1, 4).map(text)).toEqual(['Claude 준비 중', gameNames[sport] + ' │ ' + rotationWait[sport], keyHints[sport]]);
    expect(rows[4]).toMatchObject({ props: { key: 'field', columns: 60, rows: 9 } });
    const boxes = (await ui.findAll({ type: 'Box' })).filter(n => n.props.marginLeft !== undefined);
    expect(boxes.map(n => n.props.marginLeft)).toEqual(Array(4).fill(Math.floor((columns - 66) / 2)));
    expectCurrentNames(tree);
  });
}
for (const theme of ['dark', 'light', 'light-daltonized', 'config-failure']) {
  test(`E2 host tree exposes every character style ${theme}`, async ($, on) => {
    const h = setup(on, {}, theme); h.faults.config = theme === 'config-failure';
    await session($); await start($); const ui = await mount($);
    await edit($, '1'); await ui.redraw({ ...props, mode: 'requesting' });
    expectStyles(await ui.drawn(), 'kick', theme, false, rotationWait.kick, '생각 중');
    await edit($, '3'); await edit($, ' '); await h.clock.set(550); await ui.redraw({ ...props, mode: 'requesting' });
    const totals = leaves(await ui.drawn()).filter(n => n.type === 'Text')[1]!;
    expectStyles(await ui.drawn(), 'bb', theme, true, text(totals).split(' │ ')[1]!, '생각 중');
  });
}
const longActivity = '파일 편집 중 (clutch-scoreboard-three-line-layout.test.ts)';
test('E3 width ranges, exact truncation, trailing spaces and short status', () => {
  expect(fitActivity(longActivity, 60)).toBe('Claude 파일 편집 중 (clutch-scoreboard-three-line-layout.te…');
  expect(fitActivity(longActivity, 54)).toBe('Claude 파일 편집 중 (clutch-scoreboard-three-line-lay…');
  expect(fitActivity('파일 편집 중 (register.tsx)', 60)).toBe('Claude 파일 편집 중 (register.tsx)');
  expect(fitActivity('가'.repeat(40), 60)).toBe('Claude ' + '가'.repeat(26) + '…');
  expect(fitActivity('a '.repeat(40), 60)).toBe('Claude ' + 'a '.repeat(25) + 'a…');
  for (const code of [0x1100, 0x115f, 0x2e80, 0xa4cf, 0xac00, 0xd7a3, 0xf900, 0xfaff, 0xfe30, 0xfe4f, 0xff00, 0xff60, 0xffe0, 0xffe6]) {
    const char = String.fromCodePoint(code);
    expect(fitActivity(char.repeat(30), 60)).toBe('Claude ' + char.repeat(26) + '…');
  }
  for (const char of ['…', '│', '·', 'a', String.fromCodePoint(0x1160), String.fromCodePoint(0xff61)]) {
    expect(fitActivity(char.repeat(54), 60)).toBe('Claude ' + char.repeat(52) + '…');
  }
});
for (const [tool, expected] of [
  ['mcp__plugin_context7_context7__query-docs', 'query-docs 사용 중'], ['Skill', 'Skill 사용 중'],
  ['mcp__server', 'mcp__server 사용 중'], ['custom__server__tool', 'custom__server__tool 사용 중'],
]) {
  test(`E4 MCP final component only ${tool}`, async ($, on) => {
    const h = setup(on), pk = injected(h, goalLeft); await pk.start(); const ui = await pk.mount({ mode: 'tool-use' });
    await pk.run('tool.call', { tool, tool_use_id: 'mcp' });
    expect(text(leaves(await ui.drawn())[1]!)).toBe('Claude ' + expected);
  });
}
for (const sport of SPORTS) for (const theme of ['dark', 'light']) {
  test(`E5 E8 locked hints through result and automatic restoration ${sport} ${theme}`, async ($, on) => {
    const h = setup(on), timing: Timing = { late: [], scheduled: [], invalidated: [] };
    const pk = injected(h, sport === 'kick' ? goalLeft : [0], theme, timing, () => SPORTS.indexOf(sport) / 3);
    await pk.start(); const ui = await pk.mount({ mode: 'requesting' });
    expectStyles(await ui.drawn(), sport, theme, false);
    const beforeStart = timing.invalidated.length;
    await pk.edit(' '); expect(timing.invalidated.length).toBeGreaterThan(beforeStart);
    expectStyles(await ui.drawn(), sport, theme, true);
    const resultAt = sport === 'kick' ? 250 : sport === 'bat' ? 900 : 550;
    const endAt = sport === 'kick' ? 1750 : sport === 'bat' ? 2700 : 2150;
    const totals = sport === 'kick' ? '골 1 · 선방 0 · 빗나감 0' : sport === 'bat' ? '홈런 1 · 안타 0 · 삼진 0' : '점수 1 · 성공 1 · 실패 0';
    for (const at of [0, resultAt, endAt - 1]) {
      await h.clock.set(at);
      const tree = await ui.drawn();
      expectStyles(tree, sport, theme, true, at >= resultAt ? totals : rotationWait[sport]);
      expect(leaves(tree).map(n => n.type)).toEqual(['engine', 'Text', 'Text', 'Text', 'Raster']);
      expectCurrentNames(tree);
      expect(await pk.edit('0')).toEqual({ text: '0', cursor: 1 }); expect(pk.b.mode).toBe(sport);
      for (const key of ['1', '2', '3']) { await pk.edit(key); expect(pk.b.mode).toBe(sport); }
    }
    const beforeEnd = timing.invalidated.length;
    await h.clock.set(endAt);
    expect(timing.invalidated.length).toBeGreaterThan(beforeEnd);
    const tree = await ui.drawn(); // No input or explicit redraw after the hold ends.
    expectStyles(tree, sport, theme, false, totals); expectCurrentNames(tree);
  });
}
for (const columns of [80, 60]) for (const theme of ['dark', 'light']) {
  test(`E6 E8 pause retains live activity ${columns} ${theme}`, async ($, on) => {
    const h = setup(on), pk = injected(h, goalLeft, theme); await pk.start(); await pk.mount({ mode: 'tool-use' });
    await pk.edit('9');
    const ui = await pk.mount({ mode: 'tool-use' }, 'paused', columns);
    let tree = await ui.drawn(); expectPaused(tree, theme);
    expect(text(leaves(tree)[1]!)).toBe('Claude 준비 중');
    expect((await ui.findAll({ type: 'Box' })).filter(n => n.props.marginLeft !== undefined).map(n => n.props.marginLeft)).toEqual(Array(2).fill(columns === 80 ? 7 : 0));
    await pk.run('tool.call', { tool: 'Bash', command: 'pwd', tool_use_id: 'paused' });
    tree = await ui.drawn(); expect(text(leaves(tree)[1]!)).toBe('Claude 명령 실행 중');
    expectCurrentNames(tree);
    await pk.run('tool.call', { tool: 'Edit', file_path: 'clutch-scoreboard-three-line-layout.test.ts', tool_use_id: 'long' });
    expect(text(leaves(await ui.drawn())[1]!)).toBe(fitActivity(longActivity, columns === 80 ? 60 : 54));
  });
}
for (const columns of [60, 65]) for (const theme of ['dark', 'light']) {
  test(`E7 E8 narrow notice and activity ${columns} ${theme}`, async ($, on) => {
    const h = setup(on), pk = injected(h, goalLeft, theme); await pk.start();
    await pk.run('tool.call', { tool: 'Edit', file_path: 'clutch-scoreboard-three-line-layout.test.ts', tool_use_id: 'narrow' });
    const ui = await pk.mount({ mode: 'tool-use' }, 'narrow', columns), tree = await ui.drawn(), rows = leaves(tree);
    expect(rows.map(n => n.type)).toEqual(['engine', 'Text', 'Text']); expect(rows[0]).toEqual(engineTree);
    expect(text(rows[1]!)).toBe(columns === 60 ? 'Claude 파일 편집 중 (clutch-scoreboard-three-line-lay…' : 'Claude 파일 편집 중 (clutch-scoreboard-three-line-layout.t…');
    expect(rows[2]).toEqual({ type: 'Text', props: { color: theme === 'light' ? '#57606A' : '#9AA3B2' }, children: ['터미널을 넓히면 게임이 나옵니다'] });
    expect((await ui.findAll({ type: 'Box' })).filter(n => n.props.marginLeft !== undefined).map(n => n.props.marginLeft)).toEqual([0, 0]);
    expectCurrentNames(tree);
  });
}
for (const site of [false, true]) {
  test(`E9 zero delegates without changing game at site ${site}`, async ($, on) => {
    const h = setup(on), pk = injected(h, goalLeft); await pk.start(); if (site) await pk.mount();
    const result = { text: 'host result', cursor: 2 }; h.observed.editResult = result;
    const before = JSON.stringify([pk.b.mode, pk.b.sport, pk.b.score, pk.b.batScore, pk.b.bbScore]);
    expect(await pk.edit('0')).toBe(result); expect(h.edits).toEqual(['0']);
    expect(JSON.stringify([pk.b.mode, pk.b.sport, pk.b.score, pk.b.batScore, pk.b.bbScore])).toBe(before);
  });
}
test('E8 E9 command description and untouched legacy store', async ($, on) => {
  const saved = { offsetMs: 40, iqrMs: 5, samples: 10, measuredAt: '2026-10-18T00:00:00.000Z' };
  const h = setup(on, { calibration: saved }); await session($); await start($); await mount($);
  expect(h.observed.commandDefinitions).toEqual([{ name: 'clutch', description: '스포츠 미니게임 켜기·끄기', immediate: true }]);
  expect(await edit($, '0')).toEqual({ text: '0', cursor: 1 });
  for (const key of ['1', ' ', '2', '3', '9']) await edit($, key);
  await command($, 'probe'); await command($, 'probe reset');
  expect(h.store.calibration).toEqual(saved);
  for (const accessed of [h.observed.storeGets, h.observed.storeSets, h.observed.storeDeletes]) expect(accessed).not.toContain('calibration');
  expect(h.observed.storeDeletes).toEqual([]);
});

test('E3 long and short edit activities fit the wide Spinner status row', async ($, on) => {
  const h = setup(on), pk = injected(h, goalLeft); await pk.start(); const ui = await pk.mount({ mode: 'tool-use' });
  for (const [file, expected] of [
    ['clutch-scoreboard-three-line-layout.test.ts', 'Claude 파일 편집 중 (clutch-scoreboard-three-line-layout.te…'],
    ['register.tsx', 'Claude 파일 편집 중 (register.tsx)'],
    ['가'.repeat(40), 'Claude 파일 편집 중 (' + '가'.repeat(19) + '…'],
  ]) {
    await pk.run('tool.call', { tool: 'Edit', file_path: file, tool_use_id: 'wide' });
    expect(text(leaves(await ui.drawn())[1]!)).toBe(expected);
  }
});
