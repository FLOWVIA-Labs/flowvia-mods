import type { Scene, SkyScene } from './field';

export type BatResult = 'hr' | '3b' | '2b' | '1b' | 'foul' | 'k';
export function swing(random: () => number): BatResult {
  const r = random();
  return r < .10 ? 'hr' : r < .15 ? '3b' : r < .35 ? '2b' : r < .65 ? '1b' : r < .80 ? 'foul' : 'k';
}

type Play = { moves: [number, SkyScene][]; base: SkyScene; text: string; cy: number; tone: 'good' | 'warn' | 'bad'; s0: number };
const plays: Record<BatResult, Play> = {
  hr: {
    moves: [[550, { bat: 'F', ball: [26, 7], ghost: [[27, 9], [28, 11], [28, 13, 'M']] }],
      [800, { bat: 0, run: [33, 13], flash: 1, ball: [24, 1], ghost: [[25, 3], [25, 5], [26, 7, 'M']], fld: { lf: [21, 4], cf: [27, 4] } }]],
    base: { bat: 0, run: [35, 10], flash: 1, lit: ['b1'], fld: { lf: [21, 4], cf: [27, 4], b2: [32, 7] } },
    text: 'HOMERUN!!!!!!!', cy: 9, tone: 'good', s0: 900,
  },
  '3b': {
    moves: [[600, { bat: 0, run: [31, 14], ball: [36, 6], ghost: [[34, 9], [32, 12, 'M']] }],
      [900, { bat: 0, run: [35, 10], ball: [38, 4], ghost: [[37, 5], [36, 6, 'M']], fld: { cf: [33, 4], rf: [40, 5], b2: [34, 7] } }]],
    base: { bat: 0, run: [23, 11], lit: ['b3'], ball: [21, 9], fld: { cf: [33, 4], rf: [39, 4], b2: [34, 7] } },
    text: 'TRIPLE!!!!!!!', cy: 9, tone: 'good', s0: 1100,
  },
  '2b': {
    moves: [[550, { bat: 'F', ball: [26, 9], ghost: [[27, 11], [28, 13, 'M']] }],
      [800, { bat: 0, run: [35, 10], ball: [22, 5], ghost: [[24, 6], [25, 8, 'M']], fld: { lf: [20, 5], cf: [27, 4], b2: [32, 8] } }]],
    base: { bat: 0, run: [30, 6], lit: ['b2'], ball: [24, 8], fld: { lf: [21, 4], cf: [27, 4], b2: [32, 8] } },
    text: 'DOUBLE!!!!', cy: 9, tone: 'good', s0: 1100,
  },
  '1b': {
    moves: [[500, { bat: 'F', ball: [28, 10], ghost: [[28, 12], [29, 14, 'M']] }],
      [750, { bat: 0, run: [33, 13], ball: [27, 6], ghost: [[27, 8], [28, 10, 'M']], fld: { ss: [24, 8, 'skyDiveR'], b2: [31, 7, 'skyDiveL'], cf: [29, 4] } }]],
    base: { bat: 0, run: [36, 11], lit: ['b1'], ball: [28, 6], fld: { ss: [25, 8], b2: [32, 7], cf: [29, 5] } },
    text: 'HIT!!', cy: 9, tone: 'good', s0: 1100,
  },
  foul: {
    moves: [[550, { bat: 'F', ball: [36, 11], ghost: [[33, 13], [31, 14, 'M']] }],
      [750, { bat: 'F', line: 1, ball: [53, 6], ghost: [[47, 8], [42, 9], [37, 11, 'M']] }]],
    base: { bat: 'F', line: 1, ball: [53, 6] },
    text: 'FOUL BALL!!!', cy: 9, tone: 'warn', s0: 800,
  },
  k: {
    moves: [[400, { bat: 'F', ball: [29, 15], ghost: [[29, 14], [29, 13, 'M']] }],
      [550, { bat: 'F', ball: [29, 17], k: 1 }]],
    base: { bat: 'F', ball: [29, 17], k: 1 },
    text: 'STRIKEOUT!!!!!!!', cy: 9, tone: 'bad', s0: 600,
  },
};
export function atBat(result: BatResult) {
  const play = plays[result];
  const frames: [number, Scene][] = [
    [0, { sky: {} }], [120, { sky: { pitch: 1, ball: [29, 13] } }],
    [250, { sky: { ball: [29, 14], ghost: [[29, 13]] } }],
  ];
  if (result !== 'k') frames.push([350, { sky: { bat: 'S', spark: [28, 14] } }]);
  for (const [at, sky] of play.moves) frames.push([at, { sky }]);
  for (const stage of [0, 1, 2]) frames.push([play.s0 + stage * 150, {
    sky: play.base, text: { value: play.text, stage, tone: play.tone, cy: play.cy },
  }]);
  if (result === 'foul') frames.push([1250, { ...frames.at(-1)![1], sky: { ...play.base, line: undefined } }]);
  frames.push([play.s0 + 1800, { sky: {} }]);
  return { result, frames, s0: play.s0 };
}
export type AtBat = ReturnType<typeof atBat>;
export function batFrame(bat: AtBat, elapsed: number) {
  let i = 0;
  while (i + 1 < bat.frames.length && bat.frames[i + 1]![0] <= elapsed) i++;
  return i;
}
