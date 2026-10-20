import { bbFrame, bbWait } from './basketball';
import type { Basketball } from './basketball';
import { batFrame } from './batting';
import type { AtBat } from './batting';
import type { EngineInterface, Timer } from 'claude-code';
import { frame } from './field';
import type { Scene } from './field';
import { kickPosition } from './model';
import type { Shot } from './model';
import type { Activity } from './language';
import { pickSport, SPORTS } from './sports';
import type { Sport } from './sports';

export function createRuntime(random: () => number = Math.random, selectionRandom: () => number = Math.random) {
  return {
    enabled: true, paused: false,
    turn: undefined as string | undefined, site: undefined as string | undefined,
    sport: 'kick' as Sport, selectionRandom, switchedAt: 0, prepared: false,
    drawnSport: undefined as Sport | undefined,
    last: undefined as Sport | undefined, sportWrites: Promise.resolve() as Promise<unknown>,
    rotationTimer: undefined as Timer | undefined, rotationEpoch: 0,
    mode: 'kick' as Sport, kickAt: undefined as number | undefined,
    random, shot: undefined as Shot | undefined, landed: false, textStage: -1, score: { goal: 0, save: 0, miss: 0 },
    activity: { key: 'ready' } as Activity, bat: undefined as AtBat | undefined, batAt: undefined as number | undefined,
    batShown: 0, batCounted: false, batFinalAt: undefined as number | undefined, batScore: { homerun: 0, hit: 0, strikeout: 0 },
    bb: undefined as Basketball | undefined, bbAt: undefined as number | undefined, bbSpot: 0, bbBall: 1,
    bbShown: 0, bbCounted: false, bbFinalAt: undefined as number | undefined, bbScore: { points: 0, success: 0, fail: 0 },
    spaces: 0,
    timer: undefined as Timer | undefined, busy: false, generation: 0,
    lastBlit: undefined as number | undefined, lastCells: '',
  };
}
export type Runtime = ReturnType<typeof createRuntime>;
export function setActivity($: EngineInterface, b: Runtime, activity: Activity) {
  if (b.activity.key === activity.key && b.activity.detail === activity.detail) return;
  b.activity = activity; $.ui.invalidate('ui.render');
}
export function stop(b: Runtime) { b.timer?.cancel(); b.timer = undefined; b.generation++; b.lastBlit = undefined; }
export function hide(b: Runtime) { stop(b); b.site = undefined; }
export function stopRotation(b: Runtime) { b.rotationTimer?.cancel(); b.rotationTimer = undefined; b.rotationEpoch++; }
export function invalidate($: EngineInterface) {
  try { $.ui.invalidate('ui.render'); } catch { /* A missing render must not break rotation or consume handling. */ }
}
export function prepareSport(b: Runtime) {
  b.sport = pickSport(SPORTS, b.selectionRandom, b.last); b.mode = b.sport; b.prepared = true;
}
export function selectSport($: EngineInterface, b: Runtime, sport: Sport, now: number) {
  stopRotation(b); b.sport = sport; b.mode = sport; b.switchedAt = now;
  b.last = sport;
  b.sportWrites = b.sportWrites.then(() => $.store.set('sport', sport)).catch(() => {});
  const epoch = b.rotationEpoch;
  b.rotationTimer = $.clock.every(60000, () => {
    if (epoch !== b.rotationEpoch) return;
    b.rotationTimer?.cancel(); b.rotationTimer = undefined;
    void $.clock.now().then(now => {
      if (epoch === b.rotationEpoch) rotate($, b, now);
    }).catch(() => {});
  });
}
export function rotate($: EngineInterface, b: Runtime, now: number) {
  if (!b.enabled || !b.turn || b.paused || now - b.switchedAt < 60000
    || b.kickAt !== undefined || b.batAt !== undefined || b.bbAt !== undefined) return;
  selectSport($, b, pickSport(SPORTS, b.selectionRandom, b.sport), now);
  invalidate($);
}
export function resetTurn(b: Runtime) {
  stopRotation(b); b.prepared = false;
  hide(b); b.paused = false; b.mode = b.sport; b.kickAt = undefined;
  b.shot = undefined; b.landed = false; b.textStage = -1; b.activity = { key: 'ready' }; b.score = { goal: 0, save: 0, miss: 0 };
  b.bat = undefined; b.batAt = undefined; b.batShown = 0; b.batCounted = false; b.batFinalAt = undefined;
  b.batScore = { homerun: 0, hit: 0, strikeout: 0 };
  b.bb = undefined; b.bbAt = undefined; b.bbSpot = 0; b.bbBall = 1; b.bbShown = 0; b.bbCounted = false; b.bbFinalAt = undefined;
  b.bbScore = { points: 0, success: 0, fail: 0 };
  b.spaces = 0;
}
export function updateShot(b: Runtime, now: number): boolean {
  if (b.mode === 'bb') return updateBB(b, now);
  if (b.mode === 'bat') return updateBat(b, now);
  if (b.kickAt === undefined || !b.shot) return false;
  let changed = false;
  if (!b.landed && now - b.kickAt >= 250) {
    b.score[b.shot.result]++; b.landed = true; changed = true;
  }
  if (now - b.kickAt >= 1750) { b.kickAt = undefined; b.shot = undefined; b.landed = false; changed = true; }
  return changed;
}
export function scene(b: Runtime, now: number): Scene {
  if (b.mode === 'bb') return b.bb && b.bbAt !== undefined ? b.bb.frames[currentBBFrame(b, now)]![1] : bbWait(b.bbSpot, b.bbBall);
  if (b.mode === 'bat') return b.bat && b.batAt !== undefined ? b.bat.frames[currentBatFrame(b, now)]![1] : { sky: {} };
  if (b.kickAt === undefined || !b.shot) return {};
  const elapsed = now - b.kickAt, shot = b.shot;
  if (elapsed >= 1750) return {};
  return {
    kick: true, ball: kickPosition(elapsed, shot.ball), keeper: elapsed >= 100 ? shot.keeper : undefined,
    ghost: elapsed < 250 ? [elapsed - 40, elapsed - 80].filter(t => t >= 0).map(t => kickPosition(t, shot.ball)) : [],
    ...(elapsed >= 250 ? { cheer: shot.result === 'goal', rip: shot.rip, spark: shot.spark,
      text: { value: shot.result === 'goal' ? 'GOOOOOOOAL!!!!!!!' : 'BOOOOOOO!!!!!!!',
        stage: elapsed >= 350 ? 1 : 0, tone: shot.result === 'goal' ? 'good' : 'bad' } } : {}),
  };
}
export function animate($: EngineInterface, b: Runtime, now: number) {
  if (b.timer || b.paused || !b.enabled || !b.turn || b.site === undefined || (b.mode === 'kick' && b.kickAt === undefined) || (b.mode === 'bat' && b.batAt === undefined) || (b.mode === 'bb' && b.bbAt === undefined)) return;
  const epoch = b.generation;
  const elapsed = b.kickAt === undefined ? 0 : now - b.kickAt;
  const sinceBlit = b.lastBlit === undefined ? Infinity : now - b.lastBlit;
  const stage = elapsed >= 350 ? 1 : 0;
  // Retry the current text stage after throttling; do not replay stale stages.
  const delay = Math.max(1, b.mode === 'bb' ? bbDelay(b, now, sinceBlit) : b.mode === 'bat' ? batDelay(b, now, sinceBlit)
    : elapsed >= 1750 || (elapsed >= 250 && b.textStage < stage) ? 33 - sinceBlit
    : elapsed >= 250 ? (elapsed < 350 ? 350 : 1750) - elapsed
    : 250 - elapsed < 66 ? 250 - elapsed : 33);
  b.timer = $.clock.every(delay, () => {
    if (b.busy) return;
    b.timer?.cancel(); b.timer = undefined;
    b.busy = true;
    let nextAt = now;
    void (async () => {
      const now = await $.clock.now(); nextAt = now;
      if (epoch !== b.generation || !b.enabled || !b.turn || b.site === undefined) return;
      if (b.lastBlit !== undefined && now - b.lastBlit < 33) return;
      const changed = updateShot(b, now);
      rotate($, b, now);
      const current = scene(b, now), cells = frame(current);
      // Draw scheduled 3-point frames even when centered text obscures the pixel changes.
      if (cells !== b.lastCells || (b.mode === 'bb' && b.bb && currentBBFrame(b, now) > b.bbShown)) {
        b.lastBlit = now;
        try {
          const result = await $.ui.blit({ requestId: b.site, key: 'field', columns: 60, rows: 9, cells });
          if (epoch !== b.generation) return;
          if (result.deny) { hide(b); }
          else { b.lastCells = cells; b.drawnSport = b.mode; b.textStage = current.text?.stage ?? -1; markBatFrame(b, now, current); markBBFrame(b, now, current); }
        } catch { if (epoch !== b.generation) return; hide(b); }
      }
      if (changed) invalidate($);
      if ((b.mode === 'kick' && b.kickAt === undefined) || (b.mode === 'bat' && b.batAt === undefined) || (b.mode === 'bb' && b.bbAt === undefined)) stop(b);
    })().catch(() => { stop(b); }).finally(() => { b.busy = false; if (epoch === b.generation) animate($, b, nextAt); });
  });
}

function currentBatFrame(b: Runtime, now: number) {
  const bat = b.bat!, i = batFrame(bat, now - b.batAt!);
  // Even a callback arriving after the return time must show S2 once.
  return i === bat.frames.length - 1 ? i - 1 : i;
}
export function markBatFrame(b: Runtime, now: number, current: Scene) {
  if (!b.bat || b.batAt === undefined) return;
  b.batShown = currentBatFrame(b, now);
  if (current.text?.stage === 2 && b.batFinalAt === undefined) b.batFinalAt = now;
}
function updateBat(b: Runtime, now: number) {
  if (!b.bat || b.batAt === undefined) return false;
  const elapsed = now - b.batAt, bat = b.bat;
  let changed = false;
  if (!b.batCounted && elapsed >= bat.s0) {
    if (bat.result === 'hr') b.batScore.homerun++;
    else if (bat.result === 'k') b.batScore.strikeout++;
    else if (bat.result !== 'foul') b.batScore.hit++;
    b.batCounted = true; changed = true;
  }
  if (elapsed >= bat.frames.at(-1)![0] && b.batFinalAt !== undefined && now - b.batFinalAt >= 33) {
    b.bat = undefined; b.batAt = undefined; b.batCounted = false; changed = true;
  }
  return changed;
}
function batDelay(b: Runtime, now: number, sinceBlit: number) {
  const bat = b.bat!, elapsed = now - b.batAt!;
  const current = batFrame(bat, elapsed);
  const finalGap = b.batFinalAt === undefined ? 0 : b.batFinalAt + 33 - now;
  return current > b.batShown ? Math.max(finalGap, 33 - sinceBlit)
    : Math.max(bat.frames[current + 1]![0] - elapsed, 33 - sinceBlit);
}

function currentBBFrame(b: Runtime, now: number) {
  return Math.min(bbFrame(b.bb!, now - b.bbAt!), b.bb!.frames.length - 2);
}
export function markBBFrame(b: Runtime, now: number, current: Scene) {
  if (!b.bb || b.bbAt === undefined) return;
  b.bbShown = currentBBFrame(b, now);
  if (current.text?.stage === 1 && b.bbFinalAt === undefined) b.bbFinalAt = now;
}
function updateBB(b: Runtime, now: number) {
  if (!b.bb || b.bbAt === undefined) return false;
  const elapsed = now - b.bbAt, shot = b.bb;
  let changed = false;
  if (!b.bbCounted && elapsed >= shot.s0) {
    if (shot.good) { b.bbScore.success++; b.bbScore.points += b.bbBall === 5 ? 2 : 1; }
    else b.bbScore.fail++;
    b.bbCounted = true; changed = true;
  }
  // A late callback must display S1 before advancing to the next ball.
  if (elapsed >= shot.frames.at(-1)![0] && b.bbFinalAt !== undefined && now - b.bbFinalAt >= 33) {
    if (b.bbBall === 5) { b.bbSpot = (b.bbSpot + 1) % 5; b.bbBall = 1; } else b.bbBall++;
    b.bb = undefined; b.bbAt = undefined; b.bbCounted = false; changed = true;
  }
  return changed;
}
function bbDelay(b: Runtime, now: number, sinceBlit: number) {
  const shot = b.bb!, elapsed = now - b.bbAt!, current = bbFrame(shot, elapsed);
  const finalGap = b.bbFinalAt === undefined ? 0 : b.bbFinalAt + 33 - now;
  return current > b.bbShown ? Math.max(finalGap, 33 - sinceBlit)
    : Math.max(shot.frames[current + 1]![0] - elapsed, 33 - sinceBlit);
}
