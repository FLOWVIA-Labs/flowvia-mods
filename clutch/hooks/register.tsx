import { basketball, threePoint } from './basketball';
import { atBat, swing } from './batting';
import type { On, PluginOptions } from 'claude-code';
import { frame } from './field';
import { activityText, language, messages } from './language';
import type { Activity } from './language';
import { fitActivity, shoot } from './model';
import { animate, createRuntime, hide, invalidate, markBatFrame, markBBFrame, prepareSport, rotate, scene, resetTurn, selectSport, setActivity, stop, stopRotation, updateShot } from './runtime';
import { pickSport, SPORTS } from './sports';

export function register(on: On, options: PluginOptions, b = createRuntime()) {
  on('session.start', async ($, e, next) => {
    const result = await next(e);
    try {
      resetTurn(b); b.turn = undefined;
      const sport = await $.store.get('sport');
      b.last = SPORTS.find(value => value === sport);
      prepareSport(b);
      b.enabled = (await $.store.get('enabled')) !== false;
      await $.command.register({ name: 'clutch', description: messages[await language($, options)].description, immediate: true });
    } catch { /* A failed optional mod must not block session startup. */ }
    return result;
  });
  on('command.run', { command: 'clutch' }, async ($, e) => {
    const args = e.args.trim();
    const words = messages[await language($, options)];
    if (!args) {
      const value = !b.enabled;
      await $.store.set('enabled', value);
      b.enabled = value;
      if (!b.enabled) { resetTurn(b); b.turn = undefined; }
      $.ui.invalidate('ui.render');
      return { text: b.enabled ? words.on : words.off };
    }
    return { text: words.usage };
  });
  on('turn.start', async ($, e, next) => {
    // 2.1.295 omits agentId here; reject it defensively if the host supplies it.
    if (b.enabled && !('agentId' in e && e.agentId !== undefined)) {
      // A terminal field can be drawn before its turn starts.
      const site = b.site;
      const sport = b.prepared ? b.sport : pickSport(SPORTS, b.selectionRandom, b.last);
      const redraw = b.activity.key !== 'ready' || (b.drawnSport !== undefined && b.drawnSport !== sport);
      resetTurn(b); b.turn = e.turnId; b.site = site;
      selectSport($, b, sport, await $.clock.now());
      if (redraw) invalidate($);
    }
    return next(e);
  });
  on('turn.complete', ($, e, next) => {
    if (b.enabled && !e.agentId && e.turnId === b.turn) { resetTurn(b); b.turn = undefined; prepareSport(b); }
    return next(e);
  });
  on('session.end', ($, e, next) => {
    if (b.enabled) { resetTurn(b); b.turn = undefined; }
    return next(e);
  });
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (!b.enabled) return next(e);
    const result = await next(e);
    try {
      if (e.surface !== 'terminal') return result;
      if (b.turn && (e.props.mode === 'thinking' || e.props.mode === 'responding'))
        setActivity($, b, { key: e.props.mode === 'thinking' ? 'thinking' : 'writing' });
      const { Box, Text, Raster } = $.ui.resolve(e);
      let light = false;
      try { light = String((await $.config.list()).find(r => r.key === 'theme')?.value ?? '').startsWith('light'); } catch { /* dark fallback */ }
      const colors = light
        ? { body: '#24292F', dim: '#6E7781', strong: '#111418', claude: '#B5502D', notice: '#57606A', space: '#8A5A00', spaceText: '#FFFFFF', key: '#D8D5CC' }
        : { body: '#D7DAE0', dim: '#7D8590', strong: '#F4F1EA', claude: '#D97757', notice: '#9AA3B2', space: '#FFD23F', spaceText: '#111418', key: '#3A3F4B' };
      const width = (e.viewport?.columns ?? 80) - 6, margin = Math.max(0, Math.floor((width - 60) / 2));
      const words = messages[await language($, options)];
      const activity = fitActivity(activityText(words, b.activity), Math.min(60, width));
      const status = <Box marginLeft={margin}><Text color={colors.strong} weight="bold"><Text color={colors.claude} weight="bold">{activity.slice(0, 6)}</Text>{activity.slice(6)}</Text></Box>;
      if (b.paused) {
        hide(b);
        return <Box flexDirection="column">{result}{status}<Box marginLeft={margin}><Text color={colors.notice}>{words.paused}</Text></Box></Box>;
      }
      if (width < 60) {
        hide(b);
        return <Box flexDirection="column">{result}{status}<Box marginLeft={0}><Text color={colors.notice}>{words.narrow}</Text></Box></Box>;
      }
      const now = await $.clock.now(); updateShot(b, now); rotate($, b, now);
      const current = scene(b, now), cells = frame(current);
      b.textStage = current.text?.stage ?? -1; markBatFrame(b, now, current); markBBFrame(b, now, current);
      if (b.site !== e.requestId) stop(b);
      b.site = e.requestId; b.lastCells = cells; b.drawnSport = b.mode;
      const names = words.names;
      const totals: [string, number][] = b.mode === 'bb'
        ? [[words.totals.bb[0], b.bbScore.points], [words.totals.bb[1], b.bbScore.success], [words.totals.bb[2], b.bbScore.fail]]
        : b.mode === 'bat' ? [[words.totals.bat[0], b.batScore.homerun], [words.totals.bat[1], b.batScore.hit], [words.totals.bat[2], b.batScore.strikeout]]
        : [[words.totals.kick[0], b.score.goal], [words.totals.kick[1], b.score.save], [words.totals.kick[2], b.score.miss]];
      const locked = b.kickAt !== undefined || b.batAt !== undefined || b.bbAt !== undefined;
      const keys = [['Space', b.mode === 'bat' ? words.swing : words.shoot],
        ...SPORTS.flatMap((sport, i) => sport === b.mode ? [] : [[String(i + 1), words.shortNames[sport]]]), ['9', words.pause]];
      animate($, b, now);
      return <Box flexDirection="column">{result}{status}
        <Box marginLeft={margin}><Text color={colors.body}><Text color={colors.strong} weight="bold">{names[b.mode]}</Text><Text color={colors.dim}> │ </Text>{totals.map(([label, value], i) => <Text key={label} color={colors.body}>{i > 0 ? <Text color={colors.dim}> · </Text> : null}{label} <Text color={colors.strong} weight="bold">{value}</Text></Text>)}</Text></Box>
        <Box marginLeft={margin}><Text color={colors.body}>{keys.map(([key, label], i) => {
          const disabled = locked && key !== '9';
          return <Text key={key} color={disabled ? colors.dim : colors.body}>{i > 0 ? <Text color={colors.body}>  </Text> : null}<Text
            color={disabled ? colors.dim : key === 'Space' ? colors.spaceText : colors.strong}
            backgroundColor={disabled ? undefined : key === 'Space' ? colors.space : colors.key}
            weight={disabled ? 'regular' : 'bold'}>{` ${key} `}</Text>{` ${label}`}</Text>;
        })}</Text></Box>
        <Box marginLeft={margin}><Raster key="field" columns={60} rows={9} cells={cells} /></Box>
      </Box>;
    } catch { hide(b); return result; }
  });
  on('prompt.edit', async ($, e, next) => {
    if (!b.enabled || ('agentId' in e && e.agentId !== undefined)) return next(e);
    let consume = false, countedSpaces = 0, now = 0;
    const key = e.key?.key;
    const arrow = key === 'left' || key === 'right' || key === 'up' || key === 'down' ? key : undefined;
    try {
      const space = /^ +$/.test(e.inputText);
      const gameKey = !b.paused && !arrow && (space || e.inputText === '1' || e.inputText === '2' || e.inputText === '3' || e.inputText === '9');
      consume = Boolean(b.turn && b.site !== undefined && e.text === '' && gameKey);
      if (consume) {
        now = await $.clock.now(); updateShot(b, now); rotate($, b, now);
        if (e.inputText === '9') {
          stop(b); stopRotation(b); b.paused = true; b.mode = b.sport;
          b.kickAt = undefined; b.shot = undefined; b.landed = false; b.textStage = -1;
          b.bat = undefined; b.batAt = undefined; b.batShown = 0; b.batCounted = false; b.batFinalAt = undefined;
          b.bb = undefined; b.bbAt = undefined; b.bbShown = 0; b.bbCounted = false; b.bbFinalAt = undefined;
        } else if (!space && b.kickAt === undefined && b.batAt === undefined && b.bbAt === undefined) {
          const wanted = e.inputText === '1' ? 'kick' : e.inputText === '2' ? 'bat' : 'bb';
          if (wanted !== b.mode) { stop(b); b.mode = wanted; b.kickAt = undefined; }
          selectSport($, b, wanted, now);
        } else if (space) {
          b.spaces += e.inputText.length; countedSpaces = e.inputText.length;
          if (b.mode === 'kick') { if (b.kickAt === undefined) { b.shot = shoot(b.random); b.kickAt = now; b.landed = false; b.textStage = -1; } }
          else if (b.mode === 'bat') {
            if (b.batAt === undefined) { b.bat = atBat(swing(b.random)); b.batAt = now; b.batShown = 0; b.batCounted = false; b.batFinalAt = undefined; }
          }
          else if (b.mode === 'bb') {
            if (b.bbAt === undefined) { b.bb = basketball(threePoint(b.random), b.bbSpot, b.bbBall); b.bbAt = now; b.bbShown = 0; b.bbCounted = false; b.bbFinalAt = undefined; }
          }
        }
      }
      if (consume) { invalidate($); animate($, b, now); }
    } catch {
      b.spaces -= countedSpaces;
      return next(e);
    }
    return consume ? { text: e.text, cursor: e.cursor } : next(e);
  }).catch(($, e, next) => next(e));
  on('tool.call', async ($, e, next) => {
    if (!b.enabled) return next(e);
    try {
      if (b.turn && e.agentId === undefined) {
        const parts = e.tool.split('__');
        let activity: Activity = { key: 'tool', detail: e.tool.startsWith('mcp__') && parts.length >= 3 ? parts.at(-1) : e.tool };
        if (e.tool === 'Bash') {
          const command = typeof e.command === 'string' ? e.command : '';
          activity = { key: /\b(test|jest|vitest|pytest)\b/.test(command) ? 'tests'
            : /\bgit\b/.test(command) ? 'git' : 'command' };
        } else if (e.tool === 'Edit' || e.tool === 'Write' || e.tool === 'NotebookEdit') {
          const path = e.tool === 'NotebookEdit' ? e.notebook_path : e.file_path;
          activity = { key: 'editing', detail: typeof path === 'string' ? path.split('/').at(-1) : undefined };
        } else if (['Read', 'Grep', 'Glob'].includes(e.tool)) activity = { key: 'reading' };
        else if (e.tool === 'WebSearch' || e.tool === 'WebFetch') activity = { key: 'web' };
        else if (e.tool === 'Agent') activity = { key: 'subagent' };
        setActivity($, b, activity);
      }
    } catch { /* Observation failure cannot skip the call. */ }
    return next(e);
  }).catch(($, e, next) => next(e));
}
