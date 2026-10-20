import { SPOTS } from './field';
import type { BBScene, Scene } from './field';

export type BBResult = 'three' | 'bang' | 'downtown' | 'clank' | 'brick' | 'air';
export function threePoint(random: () => number): BBResult {
  const r = random();
  return r < .24 ? 'three' : r < .42 ? 'bang' : r < .60 ? 'downtown' : r < .75 ? 'clank' : r < .90 ? 'brick' : 'air';
}
const words: Record<BBResult, string> = {
  three: 'THREEEEEEE!!!!!!!', bang: 'BANG!!!!!!!', downtown: 'FROM DOWNTOWN!!!!!!!',
  clank: 'CLANK!!!!!!!', brick: 'BRICK!!!!!!!', air: 'AIR BALL!!!!!!!',
};
const BB3: Record<string, BBScene> = {
  shot:   { jump: 1, ball: [16, 3] },                                                      // 0.00 jump and release (all results)
  top:    { ball: [22, 0], ghost: [[20, 1], [18, 2], [16, 3, 'M']] },                      // 0.30 apex (made and missed shots)
  in1:    { ball: [29, 8], flash: 'W', ghost: [[28, 6], [27, 5], [25, 3, 'M']] },          // 0.55 made shot: through the net, net flashes
  in2:    { ball: [29, 9], sway: 'W' },                                                    // 0.65 made shot: net sways, ball drops below it (behind text at 0.75s)
  clank0: { ball: [32, 5], sparks: [[32, 6]], ghost: [[30, 4], [28, 2], [25, 0, 'M']] },   // 0.45 CLANK: right edge of rim
  clank1: { ball: [38, 8], ghost: [[37, 6], [35, 5, 'M']] },                               // 0.60 bounces out to the right
  clank2: { ball: [42, 9], ghost: [[41, 8], [40, 7, 'M']] },                               // 0.85 lands on the floor
  brick0: { ball: [30, 4], sparks: [[31, 3]], ghost: [[28, 2], [25, 0], [21, 0, 'M']] },   // 0.40 BRICK: low, hard hit to the front of the backboard
  brick1: { ball: [20, 5], ghost: [[22, 5], [25, 4], [28, 4, 'M']] },                      // 0.60 bounces forward and left
  brick2: { ball: [19, 9], ghost: [[20, 7], [21, 6, 'M']] },                               // 0.85 onto the floor beside the shooter
  air0:   { ball: [20, 1], ghost: [[18, 1], [17, 2], [16, 3, 'M']] },                      // 0.30 air ball: low apex
  air1:   { ball: [21, 8], ghost: [[21, 6], [21, 4], [21, 2, 'M']] },                      // 0.55 falls short of the rim (no contact)
  air2:   { ball: [23, 9], ghost: [[22, 10], [21, 10, 'M']] },                             // 0.80 lands on the floor and rolls
  mtop:   { rack: 0, ball: [22, 0, 'money'], ghost: [[20, 1], [18, 2], [16, 3, 'M']] },    // 0.30 money-ball apex, empty rack
  min1:   { rack: 0, cheer: 1, flash: 'Y', sparks: [[20, 3], [38, 2]], ball: [29, 8, 'money'], ghost: [[28, 6], [27, 5], [25, 3, 'M']] },   // 0.55 money ball scores
  min2:   { rack: 0, cheer: 2, sway: 'Y', sparks: [[17, 0], [40, 2]], ball: [29, 9, 'money'] }   // 0.65 yellow net sway, crowd and sparks change positions
};

export function bbWait(cur: number, ball: number): Scene {
  return { bb: { cur, rack: 5 - ball, hold: ball === 5 ? 'money' : 'bb' } };
}
export function basketball(result: BBResult, cur: number, ball: number) {
  const money = ball === 5, good = result === 'three' || result === 'bang' || result === 'downtown';
  const s0 = result === 'clank' || result === 'brick' ? 600 : 550;
  const sprite = money ? 'money' : 'bb';
  const spot = SPOTS[cur]!, x = Math.min(49, Math.max(10, spot[0] - 1)) + 1, y = spot[1] - 10;
  const frames: [number, Scene][] = [[0, { bb: { cur, rack: 5 - ball, jump: 1, ball: [x, y, sprite] } }]];
  const moves: [number, string][] = good
    ? [[300, money ? 'mtop' : 'top'], [550, money ? 'min1' : 'in1'], [650, money ? 'min2' : 'in2'],
      [750, money ? 'min2' : 'in2'], [850, money ? 'min2' : 'in2'], [950, money ? 'min2' : 'in2']]
    : result === 'air' ? [[300, 'air0'], [550, 'air1'], [650, 'air1'], [800, 'air2']]
    : [[300, money ? 'mtop' : 'top'], [result === 'clank' ? 450 : 400, result + '0'],
      [600, result + '1'], [700, result + '1'], [850, result + '2']];
  for (const [at, key] of moves) {
    const o = BB3[key]!, flip = cur >= 3;
    const bb: BBScene = { ...o, cur, rack: 5 - ball,
      ball: o.ball ? [flip ? 58 - o.ball[0] : o.ball[0], o.ball[1], sprite] : undefined,
      ghost: o.ghost?.map(([gx, gy, color]) => gx === 16 && gy === 3 && color === 'M'
        ? [x, y, color] : [flip ? 59 - gx : gx, gy, color]),
      sparks: o.sparks?.map(([sx, sy]) => [flip ? 57 - sx : sx, sy]),
    };
    if (good && at >= 750) bb.ball = undefined;
    if (good && (at === 750 || at === 950)) bb.sway = undefined;
    frames.push([at, { bb, ...(at >= s0 ? { text: { value: words[result], stage: at >= s0 + 100 ? 1 : 0,
      tone: good ? 'good' : result === 'air' ? 'bad' : 'warn', cy: 14 } as const } : {}) }]);
  }
  frames.push([s0 + 1600, bbWait(ball === 5 ? (cur + 1) % 5 : cur, ball === 5 ? 1 : ball + 1)]);
  return { result, good, frames, s0 };
}
export type Basketball = ReturnType<typeof basketball>;
export function bbFrame(shot: Basketball, elapsed: number) {
  let i = 0;
  while (i + 1 < shot.frames.length && shot.frames[i + 1]![0] <= elapsed) i++;
  return i;
}
