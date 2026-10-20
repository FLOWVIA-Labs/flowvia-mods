import { test, expect } from 'claude-code/testing';
import type { EngineInterface, On, PluginOptions, RenderElement } from 'claude-code';
import { register } from '../hooks/register';
import { createRuntime } from '../hooks/runtime';
import { language } from '../hooks/language';
import { atBat } from '../hooks/batting';
import { basketball } from '../hooks/basketball';
import { shoot } from '../hooks/model';
import { SPORTS } from '../hooks/sports';

const hangul = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;
const engineTree: RenderElement = { type: 'engine', ref: 0 };
function text(tree: RenderElement | string): string {
  return typeof tree === 'string' ? tree : 'children' in tree ? (tree.children ?? []).map(text).join('') : '';
}
function rows(tree: RenderElement): string[] {
  return 'children' in tree ? (tree.children ?? []).filter((child): child is RenderElement => typeof child !== 'string' && child.type === 'Box').map(text).filter(Boolean) : [];
}
function cells(tree: RenderElement): string | undefined {
  if (tree.type === 'Raster' && 'props' in tree) return String(tree.props?.cells);
  if ('children' in tree) for (const child of tree.children ?? []) {
    if (typeof child === 'string') continue;
    const value = cells(child); if (value !== undefined) return value;
  }
}
const width = (value: string) => [...value].reduce((sum, char) => sum + (/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(char) ? 2 : 1), 0);

function harness(options: PluginOptions = { language: 'en' }) {
  const b = createRuntime(() => .5, () => 0);
  const hooks: Record<string, (...args: any[]) => any> = {};
  register(((name: string, ...args: any[]) => { hooks[name] = args.at(-1); return { catch() {} }; }) as On, options, b);
  const state = { choice: options.language, settings: {} as Record<string, unknown>, settingsFailure: '', configFailure: false,
    now: 0, invalidations: 0, settingsCalls: 0, definitions: [] as { description: string }[], store: {} as Record<string, unknown> };
  const api = {
    clock: { now: async () => state.now, every: () => ({ cancel() {} }) },
    config: { list: async () => {
      if (state.configFailure) throw new Error('config unavailable');
      return [{ key: 'theme', value: 'dark' }, { key: 'clutch.language', value: state.choice }];
    } },
    settings: { read: (args?: unknown) => {
      expect(args).toBe(undefined); state.settingsCalls++;
      if (state.settingsFailure === 'throw') throw new Error('settings unavailable');
      if (state.settingsFailure === 'reject') return Promise.reject(new Error('settings denied'));
      return Promise.resolve(state.settings);
    } },
    store: { get: async (key: string) => state.store[key], set: async (key: string, value: unknown) => { state.store[key] = value; }, delete: async (key: string) => { delete state.store[key]; } },
    command: { register: async (definition: { description: string }) => { state.definitions.push(definition); return { command: 'clutch' }; } },
    ui: { resolve: () => ({ Box: 'Box', Text: 'Text', Raster: 'Raster' }), invalidate: () => { state.invalidations++; } },
  };
  const run = (name: string, event: any = {}) => hooks[name]!(api, event, () => engineTree);
  return { b, state, api, run,
    render: (mode = 'requesting', columns = 80): Promise<RenderElement> => run('ui.render', { component: 'Spinner', props: { mode }, surface: 'terminal', requestId: 'spinner', viewport: { columns } }),
    command: (args: string): Promise<{ text: string }> => run('command.run', { args }),
  };
}

for (const [setting, expected] of [
  ['Korean', 'ko'], ['korean', 'ko'], [' KO ', 'ko'], ['ko-KR', 'ko'], ['한국어', 'ko'],
  ['japanese', 'en'], ['English', 'en'], [undefined, 'en'], [42, 'en'], [null, 'en'], ['', 'en'],
] as const) {
  test(`language auto merged settings ${JSON.stringify(setting)}`, { options: { language: 'auto' } }, async ($, on) => {
    on('settings.read', ($, e) => { expect(e.source).toBe(undefined); return { value: setting === undefined ? {} : { language: setting } }; });
    on('config.list', () => ({ value: [] }));
    on('session.start', ($, e) => ({ cwd: e.cwd }));
    on('store.get', () => ({ value: undefined }));
    let description = '';
    on('command.register', ($, e) => { description = e.description ?? ''; return { value: { command: e.name } }; });
    on('ui.render', () => engineTree);
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true });
    expect(description).toBe(expected === 'ko' ? '스포츠 미니게임 켜기·끄기' : 'Toggle sports minigames');
    const ui = await $.ui.mount({ plugin: 'clutch', surface: 'terminal', requestId: 'spinner', component: 'Spinner', props: { word: 'Working', message: null, suffix: '…', mode: 'requesting' }, viewport: { columns: 65, rows: 40, isFullscreen: true } });
    expect(text(await ui.drawn())).toBe(expected === 'ko' ? 'Claude 준비 중터미널을 넓히면 게임이 나옵니다' : 'Claude is getting readyWiden the terminal to play');
  });
}
for (const failure of ['throw', 'reject']) {
  test(`language auto settings ${failure} falls back to English`, async () => {
    const h = harness({ language: 'auto' }); h.state.settingsFailure = failure;
    expect(await language(h.api as unknown as EngineInterface, { language: 'auto' })).toBe('en');
    expect(rows(await h.render())[0]).toBe('Claude is getting ready');
    expect((await h.command('bad')).text).toBe('Usage: /clutch (toggle on/off)');
  });
}
for (const choice of ['ko', 'en', 'auto', 'invalid']) {
  test(`language explicit and invalid choice ${choice}`, async () => {
    const h = harness({ language: choice }); h.state.settings.language = 'Korean';
    expect(await language(h.api as unknown as EngineInterface, { language: choice })).toBe(choice === 'en' ? 'en' : 'ko');
    expect(h.state.settingsCalls).toBe(choice === 'ko' || choice === 'en' ? 0 : 1);
    h.state.configFailure = true;
    expect(await language(h.api as unknown as EngineInterface, { language: choice })).toBe(choice === 'en' ? 'en' : 'ko');
  });
}

const boards = {
  kick: 'Penalty Shootout │ Goals 12 · Saves 3 · Misses 4',
  bat: 'Baseball │ HR 12 · Hits 3 · K 4',
  bb: '3-Point Contest │ Pts 12 · Made 3 · Missed 4',
};
const hints = {
  kick: ' Space  Shoot   2  Baseball   3  3-Point   9  Pause',
  bat: ' Space  Swing   1  Shootout   3  3-Point   9  Pause',
  bb: ' Space  Shoot   1  Shootout   2  Baseball   9  Pause',
};
for (const sport of SPORTS) for (const phase of ['waiting', 'playing', 'result']) {
  test(`language English ${sport} ${phase} exact rows, width and identical Korean Raster`, async () => {
    const h = harness(); h.b.mode = h.b.sport = sport;
    if (phase !== 'waiting') {
      if (sport === 'kick') { h.b.shot = shoot(() => .5); h.b.kickAt = 0; h.b.landed = true; }
      if (sport === 'bat') { h.b.bat = atBat('hr'); h.b.batAt = 0; h.b.batCounted = true; }
      if (sport === 'bb') { h.b.bb = basketball('three', 0, 1); h.b.bbAt = 0; h.b.bbCounted = true; }
      h.state.now = phase === 'playing' ? 100 : sport === 'kick' ? 350 : sport === 'bat' ? h.b.bat!.s0 : h.b.bb!.s0;
    }
    h.b.score = { goal: 12, save: 3, miss: 4 }; h.b.batScore = { homerun: 12, hit: 3, strikeout: 4 }; h.b.bbScore = { points: 12, success: 3, fail: 4 };
    const en = await h.render();
    expect(rows(en)).toEqual(['Claude is getting ready', boards[sport], hints[sport]]);
    expect(hangul.test(text(en))).toBe(false);
    expect(rows(en).slice(1).every(row => width(row) <= 60)).toBe(true);
    expect(cells(en)).toBeDefined();
    h.state.choice = 'ko'; const ko = await h.render();
    expect(cells(ko)).toBe(cells(en));
  });
}

for (const choice of ['ko', 'en'] as const) {
  test(`U3 ${choice} command accepts only the toggle and omits argument hints`, async () => {
    const h = harness({ language: choice }); await h.run('session.start');
    expect(h.state.definitions).toEqual([{ name: 'clutch',
      description: choice === 'ko' ? '스포츠 미니게임 켜기·끄기' : 'Toggle sports minigames', immediate: true }]);
    const usage = choice === 'ko' ? '사용법: /clutch (켜기·끄기)' : 'Usage: /clutch (toggle on/off)';
    for (const args of ['probe', 'probe reset', 'x', ' probe ', 'probe reset extra']) {
      expect((await h.command(args)).text).toBe(usage);
      expect(h.b.enabled).toBe(true); expect(h.state.store).toEqual({});
    }
    expect((await h.command('')).text).toBe(choice === 'ko' ? 'clutch 꺼짐' : 'clutch off');
    expect(h.state.store.enabled).toBe(false);
    expect((await h.command('')).text).toBe(choice === 'ko' ? 'clutch 켜짐' : 'clutch on');
    expect(h.state.store.enabled).toBe(true);
  });
}

test('language English notices and command replies are exact and have no Hangul', async () => {
  const h = harness(); await h.run('session.start');
  expect(h.state.definitions).toEqual([{ name: 'clutch', description: 'Toggle sports minigames', immediate: true }]);
  h.b.paused = true;
  const paused = await h.render();
  expect(rows(paused)).toEqual(['Claude is getting ready', 'clutch paused · back on your next prompt']);
  expect(cells(paused)).toBe(undefined); expect(hangul.test(text(paused))).toBe(false);
  h.b.paused = false;
  const narrow = await h.render('requesting', 65);
  expect(rows(narrow)).toEqual(['Claude is getting ready', 'Widen the terminal to play']);
  expect(cells(narrow)).toBe(undefined); expect(hangul.test(text(narrow))).toBe(false);
  for (const [input, expected] of [['', 'clutch off'], ['', 'clutch on'], ['probe reset', 'Usage: /clutch (toggle on/off)'], ['bad', 'Usage: /clutch (toggle on/off)']]) {
    const result = (await h.command(input!)).text;
    expect(result).toBe(expected); expect(hangul.test(result)).toBe(false);
  }
  h.state.choice = 'ko'; expect((await h.command('')).text).toBe('clutch 꺼짐');
  expect(h.state.definitions[0]!.description).toBe('Toggle sports minigames');
});

const tools = [
  [{ tool: 'Bash', command: 'npm test' }, { key: 'tests' }, 'is running tests'],
  [{ tool: 'Bash', command: 'git status' }, { key: 'git' }, 'is working with git'],
  [{ tool: 'Bash', command: 'echo hi' }, { key: 'command' }, 'is running a command'],
  [{ tool: 'Edit', file_path: '/work/main.ts' }, { key: 'editing', detail: 'main.ts' }, 'is editing main.ts'],
  [{ tool: 'Write' }, { key: 'editing', detail: undefined }, 'is editing a file'],
  [{ tool: 'NotebookEdit', notebook_path: '/work/demo.ipynb' }, { key: 'editing', detail: 'demo.ipynb' }, 'is editing demo.ipynb'],
  [{ tool: 'Read' }, { key: 'reading' }, 'is reading code'],
  [{ tool: 'WebSearch' }, { key: 'web' }, 'is searching the web'],
  [{ tool: 'Agent' }, { key: 'subagent' }, 'is running a subagent'],
  [{ tool: 'mcp__server__lookup' }, { key: 'tool', detail: 'lookup' }, 'is using lookup'],
  [{ tool: 'TodoWrite' }, { key: 'tool', detail: 'TodoWrite' }, 'is using TodoWrite'],
] as const;
for (const [event, state, expected] of tools) {
  test(`language English activity ${expected}`, async () => {
    const h = harness(); await h.run('turn.start', { turnId: 'main' });
    await h.run('tool.call', { ...event, tool_use_id: 'tool' });
    expect(h.b.activity).toEqual(state);
    const tree = await h.render('tool-use');
    expect(rows(tree)[0]).toBe(`Claude ${expected}`); expect(hangul.test(text(tree))).toBe(false);
  });
}
for (const [mode, key, expected] of [['requesting', 'ready', 'is getting ready'], ['thinking', 'thinking', 'is thinking'], ['responding', 'writing', 'is writing']]) {
  test(`language English spinner ${mode}`, async () => {
    const h = harness(); await h.run('turn.start', { turnId: 'main' });
    const tree = await h.render(mode); expect(h.b.activity).toEqual({ key });
    expect(rows(tree)[0]).toBe(`Claude ${expected}`); expect(hangul.test(text(tree))).toBe(false);
  });
}
for (const choice of ['ko', 'en', 'auto']) {
  test(`language changes mid-turn and redraw decisions are independent of ${choice}`, async () => {
    const h = harness({ language: choice }); h.state.settings.language = 'Korean';
    await h.run('turn.start', { turnId: 'main' });
    await h.run('tool.call', { tool: 'Edit', file_path: '/work/a.ts', tool_use_id: 'edit' });
    const activity = h.b.activity;
    expect(rows(await h.render('tool-use'))[0]).toBe(choice === 'en' ? 'Claude is editing a.ts' : 'Claude 파일 편집 중 (a.ts)');
    if (choice === 'auto') h.state.settings.language = 'English'; else h.state.choice = choice === 'en' ? 'ko' : 'en';
    expect(rows(await h.render('tool-use'))[0]).toBe(choice === 'en' ? 'Claude 파일 편집 중 (a.ts)' : 'Claude is editing a.ts');
    expect(h.b.activity).toBe(activity);
    const before = h.state.invalidations;
    await h.run('tool.call', { tool: 'Edit', file_path: '/work/a.ts', tool_use_id: 'same' });
    expect(h.state.invalidations).toBe(before);
    await h.run('tool.call', { tool: 'Edit', file_path: '/work/b.ts', tool_use_id: 'different' });
    expect(h.state.invalidations).toBe(before + 1);
    await h.run('turn.start', { turnId: 'new' }); expect(h.state.invalidations).toBe(before + 2);
    expect(h.b.activity).toEqual({ key: 'ready' });
    await h.run('turn.start', { turnId: 'ready' }); expect(h.state.invalidations).toBe(before + 2);
  });
}
for (const locale of ['ko', 'en']) {
  test(`language long tool and file names truncate to 60 columns in ${locale}`, async () => {
    const h = harness({ language: locale }); await h.run('turn.start', { turnId: 'main' });
    for (const event of [{ tool: 'mcp__server__' + 'x'.repeat(100) }, { tool: 'Edit', file_path: '/work/' + 'x'.repeat(100) }]) {
      await h.run('tool.call', { ...event, tool_use_id: 'long' });
      const line = rows(await h.render('tool-use'))[0]!;
      expect(line.endsWith('…')).toBe(true); expect(width(line) <= 60).toBe(true);
      if (locale === 'en') expect(hangul.test(line)).toBe(false);
    }
  });
}

test('language host redraw reads current config and auto settings without re-registering commands', { options: { language: 'en' } }, async ($, on) => {
  let choice = 'en', setting = 'Korean', reads = 0;
  const definitions: string[] = [];
  on('settings.read', () => { reads++; return { value: { language: setting } }; });
  on('config.list', () => ({ value: [{ key: 'clutch.language', value: choice, kind: 'text', label: 'Language', provider: { plugin: 'clutch', tier: 'user' }, isLocked: false }] }));
  on('session.start', ($, e) => ({ cwd: e.cwd }));
  on('store.get', () => ({ value: undefined }));
  on('store.set', () => ({ value: undefined }));
  on('command.register', ($, e) => { definitions.push(e.description ?? ''); return { value: { command: e.name } }; });
  on('ui.render', () => engineTree);
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true });
  const props = { word: 'Working', message: null, suffix: '…', mode: 'requesting' as const };
  const ui = await $.ui.mount({ plugin: 'clutch', surface: 'terminal', requestId: 'spinner', component: 'Spinner', props, viewport: { columns: 65, rows: 40, isFullscreen: true } });
  expect(text(await ui.drawn())).toBe('Claude is getting readyWiden the terminal to play');
  expect(reads).toBe(0);
  choice = 'ko'; await ui.redraw(props);
  expect(text(await ui.drawn())).toBe('Claude 준비 중터미널을 넓히면 게임이 나옵니다');
  expect(reads).toBe(0);
  choice = 'auto'; setting = 'English'; await ui.redraw(props);
  expect(text(await ui.drawn())).toBe('Claude is getting readyWiden the terminal to play');
  setting = 'Korean'; await ui.redraw(props);
  expect(text(await ui.drawn())).toBe('Claude 준비 중터미널을 넓히면 게임이 나옵니다');
  expect(reads >= 2).toBe(true);
  expect(definitions).toEqual(['Toggle sports minigames']);
});
