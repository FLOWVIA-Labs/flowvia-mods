import type { Keeper, Point } from './model';

// Fixed visuals for the pk and sky scenes.
const PAL: Record<string, string> = {
  '.': 'transparent',
  N: '#141B2D', n: '#22304A', X: '#0B0F1A', q: '#2A3146',
  G: '#2E7D3A', g: '#38893F', D: '#1D5A2B', m: '#5E8C6A',
  W: '#F4F1EA', w: '#A9B8C4', M: '#66748A',
  d: '#B8743F', b: '#6B4226',
  A: '#1A1E2C', h: '#C98A4E', H: '#B0733D',
  S: '#E8B48A', r: '#3A2A20',
  C: '#E8743B', c: '#A9522A', k: '#1F2A44',
  T: '#22A6A0', t: '#157A75',
  P: '#D5DCE4', p: '#8C99A8',
  E: '#D9A35B', O: '#F26B1D', o: '#A8460F',
  Y: '#FFD23F', F: '#F5A524', L: '#3DD68C', R: '#D6453D', V: '#4C6A92'
};
const kdiveL = ['W.rr.....', 'WSSrTTTkk', '.W.TTTkSS'];
const SPR = {
  shooter: ['S..S', 'SrrS', '.rr.', 'CCCC', '.CC.', '.kk.', '.S.S', '.k.k'],
  shootUp: ['S..S', 'SrrS', '.rr.', 'CCCC', '.CC.', '.kk.', '.SS.', '.kk.'],
  bb:      ['OO', 'Oo'],
  money:   ['YC', 'CY'],

  kicker: ['..rr.', '..rr.', '.CCCC', 'SCCCC', '.CCCS', '.kkk.', '.S..S', '.k..k'],
  kickerF: ['..rr..', '..rr..', '.CCCC.', 'SCCCCS', '.CCC..', '.kkk..', '.S.SSk', '.k....'],
  keeper: ['W.rr.W', 'T.SS.T', 'TTTTTT', '.TTTT.', '.kkkk.', '.S..S.', '.k..k.'],
  kdiveL, kdiveR: kdiveL.map(row => [...row].reverse().join('')),
  sball: ['Wk', 'WW'], spark: ['.Y.', 'YWY', '.Y.'],
  skyFld:  ['k', 'P'],
  skyRun:  ['k', 'C'],
  skyCat:  ['bk'],
  skyPitch:['.k', 'PP'],
  skyBatR: ['..', '.k', 'EC'],
  skyBatS: ['....', '.kEE', '.C..'],
  skyBatF: ['E.', '.k', '.C'],
  skyDiveR:['Pk'], skyDiveL: ['Pk'].map(row => [...row].reverse().join('')),
};
// Fixed result lettering with TypeScript annotations.
const FONT5: Record<string, string[]> = {
  W: ['10001', '10001', '10101', '11011', '10001'],
  C: ['111', '100', '100', '100', '111'],
  A: ['111', '101', '111', '101', '101'],
  B: ['110', '101', '110', '101', '110'],
  D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'],
  F: ['111', '100', '110', '100', '100'],
  G: ['111', '100', '101', '101', '111'],
  H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'],
  K: ['101', '101', '110', '101', '101'],
  L: ['100', '100', '100', '100', '111'],
  M: ['10001', '11011', '10101', '10001', '10001'],
  N: ['1001', '1101', '1011', '1001', '1001'],
  O: ['111', '101', '101', '101', '111'],
  P: ['111', '101', '111', '100', '100'],
  R: ['110', '101', '110', '101', '101'],
  S: ['111', '100', '111', '001', '111'],
  T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '111'],
  '!': ['1', '1', '1', '0', '1'],
  ' ': ['00', '00', '00', '00', '00']
};
const TSTAGE = [3, 5, 7, 10];   // S0 silhouette · S1 base size · S2 final batting size · S3 final penalty-kick size (2x)
const TGAP = [1, 1, 1, 2];
const TSPLIT = [2, 3, 5, 6];
const TTONE = { good: ['Y', 'F'], bad: ['R', 'c'], warn: ['F', 'O'] };   // [top color, bottom color]
function glyph(ch: string, H: number) {
  const g = FONT5[ch] || FONT5[' ']!, w = g[0]!.length, W = Math.max(1, Math.round(w * H / 5));
  const out = [];
  for (let j = 0; j < H; j++) {
    const r = g[Math.floor((2 * j + 1) * 5 / (2 * H))]!;
    let s = '';
    for (let i = 0; i < W; i++) s += r[Math.floor((2 * i + 1) * w / (2 * W))];
    out.push(s);
  }
  return out;
}
export function textW(str: string, st: number) {
  const H = TSTAGE[st]!;
  let w = 0;
  for (let k = 0; k < str.length; k++) w += glyph(str[k]!, H)[0]!.length;
  return w + (str.length - 1) * TGAP[st]!;
}
function bigText(p: string[][], str: string, st: number, tone: keyof typeof TTONE, cx: number, cy: number) {
  const H = TSTAGE[st]!, col = TTONE[tone] || TTONE.good;
  const W = textW(str, st) + 2, BH = H + 2;
  const left = cx - Math.floor(W / 2), top = cy - Math.floor(BH / 2);
  const m = Array.from({ length: BH }, () => Array<number>(W).fill(0));
  let x = 1;
  for (let k = 0; k < str.length; k++) {
    const g = glyph(str[k]!, H);
    for (let j = 0; j < H; j++) for (let i = 0; i < g[j]!.length; i++) if (g[j]![i] === '1') m[1 + j]![x + i] = 1;
    x += g[0]!.length + TGAP[st]!;
  }
  for (let j = 0; j < BH; j++) for (let i = 0; i < W; i++) {
    if (m[j]![i]) { set(p, left + i, top + j, j - 1 < TSPLIT[st]! ? col[0]! : col[1]!); continue; }
    let near = false;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (m[j + dj] && m[j + dj]![i + di]) near = true;
    if (near) set(p, left + i, top + j, 'X');
  }
}

export type Scene = { bb?: BBScene; sky?: SkyScene; ball?: Point; keeper?: Keeper; kick?: boolean; ghost?: Point[]; cheer?: boolean; rip?: Point; spark?: Point; text?: { value: string; stage: number; tone: 'good' | 'bad' | 'warn'; cy?: number } };
function put(p: string[][], sprite: keyof typeof SPR, x: number, y: number) {
  SPR[sprite].forEach((row, j) => [...row].forEach((c, i) => { if (c !== '.') set(p, x + i, y + j, c); }));
}
function ripple(p: string[][], cx: number, cy: number) {
  for (let y = 3; y < 10; y++) for (let x = 16; x < 44; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d < 4.2 && p[y]![x] === 'm') p[y]![x] = d < 2.6 ? 'W' : 'w';
  }
}
function cheer(p: string[][]) {
  for (let x = 0; x < 60; x++) if (x % 3 === 1) {
    set(p, x, 1, ['Y', 'C', 'W'][(x >> 1) % 3]!); set(p, x, 3, ['C', 'W', 'Y'][(x >> 2) % 3]!);
  }
}
function set(p: string[][], x: number, y: number, c: string) { if (y >= 0 && y < 18 && x >= 0 && x < 60) p[y]![x] = c; }
function rect(p: string[][], x: number, y: number, w: number, h: number, c: string) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(p, x + i, y + j, c);
}
function crowd(p: string[][], y: number, cols: string[]) {
  for (let x = 0; x < 60; x++) if (x % 3 === 1) set(p, x, y, cols[(x * 7) % cols.length]!);
}
function pkField(p: string[][]) {
  rect(p, 0, 0, 60, 5, 'N'); crowd(p, 1, ['c', 'N', 't', 'p']); crowd(p, 3, ['p', 't', 'N', 'c']);
  for (let x = 0; x < 60; x++) set(p, x, 5, (Math.floor(x / 4) % 2) ? 'n' : 'k');
  for (let y = 6; y < 18; y++) for (let x = 0; x < 60; x++) p[y]![x] = (Math.floor(x / 6) % 2) ? 'g' : 'G';
  rect(p, 16, 3, 28, 7, 'D');
  for (let y = 3; y < 10; y++) for (let x = 16; x < 44; x++) if (x % 2 === 0 && y % 2 === 1) p[y]![x] = 'm';
  rect(p, 0, 10, 60, 1, 'W');
  rect(p, 15, 2, 30, 1, 'W'); rect(p, 15, 2, 1, 9, 'W'); rect(p, 44, 2, 1, 9, 'W');
}
// Explicit little-endian packing; no Node or browser globals are needed in the mod.
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += alphabet[(n >>> 18) & 63]! + alphabet[(n >>> 12) & 63]!
      + (i + 1 < bytes.length ? alphabet[(n >>> 6) & 63] : '=')
      + (i + 2 < bytes.length ? alphabet[n & 63] : '=');
  }
  return out;
}
export function frame(o: Scene = {}): string {
  const p = Array.from({ length: 18 }, () => Array<string>(60).fill('G'));
  const cells: Cells = {};
  if (o.bb) {
    const draw = bb3(o.bb);
    (o.text ? bbText(draw, o.text.value, o.text.stage, o.text.tone) : draw)(p);
  } else if (o.sky) sky(o.sky)(p, cells);
  else {
    pkField(p);
    put(p, ...(o.keeper ?? ['keeper', 27, 3]));
    if (o.cheer) cheer(p);
    if (o.rip) ripple(p, ...o.rip);
    put(p, o.kick ? 'kickerF' : 'kicker', 22, 10);
    for (const [x, y] of o.ghost ?? []) set(p, x, y, 'w');
    put(p, 'sball', ...(o.ball ?? [28, 15]));
    if (o.spark) put(p, 'spark', ...o.spark);
  }
  if (o.text && !o.bb) bigText(p, o.text.value, o.text.stage, o.text.tone, 30, o.text.cy ?? 9);
  const bytes = new Uint8Array(60 * 9 * 12), view = new DataView(bytes.buffer);
  for (let row = 0; row < 9; row++) for (let col = 0; col < 60; col++) {
    const top = p[row * 2]![col]!, bottom = p[row * 2 + 1]![col]!, at = (row * 60 + col) * 12;
    const cell = cells[row + ',' + col];
    view.setUint32(at, cell ? cell.ch.codePointAt(0)! : top === bottom ? 32 : 0x2580, true);
    view.setUint32(at + 4, parseInt(PAL[cell?.f ?? top]!.slice(1), 16), true);
    view.setUint32(at + 8, parseInt(PAL[cell?.b ?? bottom]!.slice(1), 16), true);
  }
  return base64(bytes);
}

// Independent sky-view reference.
type Cells = Record<string, { ch: string; f: string; b: string }>;
export type SkyScene = {
  pitch?: number; flash?: number; line?: number; k?: number; bat?: 'R' | 'S' | 'F' | 0;
  lit?: (keyof typeof SKYBASE)[]; fld?: Partial<Record<keyof typeof SKYFLD, [number, number, ('skyDiveR' | 'skyDiveL')?]>>;
  run?: [number, number]; ball?: [number, number]; spark?: [number, number]; ghost?: [number, number, string?][];
};
function txt(o: Cells, row: number, col: number, str: string, f: string, b: string) {
  for (let i = 0; i < str.length; i++) o[row + ',' + (col + i)] = { ch: str[i]!, f, b };
}
const SKY_L = [
  'NcNNtNNpNNcNNNNNtNNcNNpNNtNNcN', // y0  stands
  'NNNNNNNNNNNNNNNNNNNNNNNNNNNNNN', // y1
  'NNtNNpNNcNNtNNcNNpNNtNDDDDDDDD', // y2  top of outfield fence x22-37
  'NNNNNNNNNNNNNNNNNDDDDDDbbbbbbb', // y3  warning track x23-36
  'pNNcNNtNNpNNcNDDDDbbbbbGggggGG', // y4
  'NNNNNNNNNNNDDDbbbbggGGGGggggGG', // y5
  'NtNNcNNpNFFDbbbGggggGGGGggggGG', // y6  foul pole F (9-10,6)
  'NNNNNNNNNggwwGGGggggGGGddddddd', // y7  infield dirt x23-36
  'NNpNNcNNtgggGwwGggggGddddddddW', // y8  2nd base (29-30,8)
  'NNNNNNNNNNNgGGGwwgggdddddddddG', // y9
  'cNNtNNpNNcNNtGGGgwwddddddddgGG', // y10
  'NNNNNNNNNNNNNNNGgggwwddddgggGG', // y11
  'NpNNcNNtNNpNNcNNtgggGWWGggggdd', // y12 3rd base (21-22,12) · mound x28-31
  'NNNNNNNNNNNNNNNNNNNgGGGwwgggGG', // y13
  'NNcNNtNNpNNcNNtNNpNNcGGGgwwgGG', // y14
  'NNNNNNNNNNNNNNNNNNNNNNNGgggwwd', // y15
  'pNNcNNtNNpNNcNNtNNpNNcNNtgggdW', // y16 home plate (29-30,16)
  'NNNNNNNNNNNNNNNNNNNNNNNNNNNgdd'  // y17 catcher position
];
const SKY = SKY_L.map(function (l) { return l + l.split('').reverse().join(''); });
// Left pixel of each base (width 2) · fielder head pixel (body directly below, skyFld)
// Runner head positions in run: 1st (36,11) · 2nd (30,6) · 3rd (23,11), just inside/above each base to keep it visible when lit.
const SKYBASE: Record<'b1' | 'b2' | 'b3' | 'h', [number, number]> = { b1: [37, 12], b2: [29, 8], b3: [21, 12], h: [29, 16] };
const SKYFLD: Record<'p' | 'b1' | 'b2' | 'ss' | 'b3' | 'lf' | 'cf' | 'rf', [number, number]> = { p: [30, 11], b1: [39, 9], b2: [36, 8], ss: [23, 8], b3: [20, 9], lf: [19, 6], cf: [30, 4], rf: [40, 6] };
function skyLine(p: string[][], side: number, c: string) {
  // Draw foul lines from home (y15) to the poles (y6). side −1 = 3rd-base side, 1 = 1st-base side; skip the 1st/3rd-base row (y12).
  for (let y = 6; y <= 15; y++) {
    if (y === 12) continue;
    const a = 29 - 2 * (16 - y);
    (side < 0 ? [a, a + 1] : [58 - a, 59 - a]).forEach(function (x) { set(p, x, y, c); });
  }
}
function skyFlash(p: string[][]) {
  // Home-run crowd flash: color crowd dots Y·C·F; add Y at x%6 = 3 on odd rows of the stands.
  for (let y = 0; y < 18; y++) for (let x = 0; x < 60; x++) {
    const k = SKY[y]![x]!;
    if (k === 'c' || k === 't' || k === 'p') p[y]![x] = ['Y', 'C', 'F'][(x + y) % 3]!;
    else if (k === 'N' && y % 2 === 1 && x % 6 === 3) p[y]![x] = 'Y';
  }
}
function skyK(p: string[][], t: Cells) {
  // Strikeout indicator: row 8, columns 48-56 background X; column 49 K(W); columns 51·53·55 lights (R, full cell).
  rect(p, 48, 16, 9, 2, 'X');
  txt(t, 8, 49, 'K', 'W', 'X');
  [51, 53, 55].forEach(function (x) { rect(p, x, 16, 1, 2, 'R'); });
}
function sky(o: SkyScene) {
  return function (p: string[][], t: Cells) {
    for (let y = 0; y < 18; y++) for (let x = 0; x < 60; x++) p[y]![x] = SKY[y]![x]!;
    if (o.flash) skyFlash(p);
    if (o.line) skyLine(p, o.line, 'Y');
    (o.lit || []).forEach(function (k) { const b = SKYBASE[k]; rect(p, b[0], b[1], 2, 1, 'Y'); });
    const f: Record<keyof typeof SKYFLD, [number, number, ('skyDiveR' | 'skyDiveL')?]> = { ...SKYFLD, ...o.fld };
    (Object.keys(f) as (keyof typeof f)[]).forEach(function (k) {
      const q = f[k];
      if (k === 'p' && o.pitch) put(p, 'skyPitch', q[0] - 1, q[1]);
      else put(p, q[2] || 'skyFld', q[0], q[1]);
    });
    put(p, 'skyCat', 29, 17);
    const bat = o.bat === undefined ? 'R' : o.bat;
    if (bat) put(p, `skyBat${bat}`, 25, 14); else set(p, 27, 16, 'E');   // 0 = batter has run off, leaving only the bat
    if (o.run) put(p, 'skyRun', o.run[0], o.run[1]);
    (o.ghost || []).forEach(function (q) { set(p, q[0], q[1], q[2] || 'w'); });
    if (o.spark) put(p, 'spark', o.spark[0], o.spark[1]);
    if (o.ball) set(p, o.ball[0], o.ball[1], 'W');
    if (o.k) skyK(p, t);
  };
}

// 3-point drawing without a gauge.
export type BBScene = {
  cur?: number; rack?: number; jump?: number; hold?: 'bb' | 'money'; cheer?: number; flash?: string; sway?: string;
  ball?: [number, number, ('bb' | 'money')?]; ghost?: [number, number, string?][]; sparks?: [number, number][];
};
export const SPOTS: [number, number][] = [[10, 17], [16, 13], [30, 11], [44, 13], [50, 17]];
function bbField(p: string[][], cur: number) {
  rect(p, 0, 0, 60, 10, 'A'); crowd(p, 1, ['c', 'A', 't', 'p']); crowd(p, 3, ['p', 't', 'A', 'c']);
  for (let y = 10; y < 18; y++) for (let x = 0; x < 60; x++) p[y]![x] = ((x + y * 2) % 9 === 0) ? 'H' : 'h';
  for (let a = -90; a <= 90; a += 2) { const r = a * Math.PI / 180; set(p, Math.round(30 + 20 * Math.sin(r)), Math.round(11 + 6 * (1 - Math.cos(r))), 'W'); }
  rect(p, 23, 1, 14, 6, 'n'); rect(p, 23, 1, 14, 1, 'W'); rect(p, 23, 6, 14, 1, 'W'); rect(p, 23, 1, 1, 6, 'W'); rect(p, 36, 1, 1, 6, 'W');
  rect(p, 27, 3, 6, 1, 'W'); rect(p, 27, 3, 1, 3, 'W'); rect(p, 32, 3, 1, 3, 'W');
  for (let x = 27; x <= 32; x++) if (x % 2 === 1) set(p, x, 8, 'W');
  for (let x = 28; x <= 31; x++) if (x % 2 === 0) set(p, x, 9, 'w');
  rect(p, 26, 7, 8, 1, 'O');
  SPOTS.forEach(function (s, i) { const c = i < cur ? 'M' : (i === cur ? 'Y' : 'C'); set(p, s[0], s[1], c); set(p, s[0] + 1, s[1], c); });
}
function netFlash(p: string[][], c: string) { rect(p, 27, 8, 6, 1, c); rect(p, 28, 9, 4, 1, c); }
function rack(p: string[][], n: number) {
  rect(p, 0, 16, 10, 1, 'p'); set(p, 0, 17, 'p'); set(p, 9, 17, 'p');
  for (let i = 5 - n; i < 5; i++) put(p, i === 4 ? 'money' : 'bb', i * 2, 14);
}
const BBLINES: Record<string, string[]> = { 'FROM DOWNTOWN!!!!!!!': ['FROM', 'DOWNTOWN!!!!!!!'] };
// Multiline text: stack line boxes (height H+2) with no gap; center the last line at cy.
// If left is set, align every line box to left; otherwise center each line at x30.
function bigLines(p: string[][], lines: string[], st: number, tone: keyof typeof TTONE, cy: number, left?: number) {
  const BH = TSTAGE[st]! + 2;
  lines.forEach(function (s, k) {
    const cx = left === undefined ? 30 : left + Math.floor((textW(s, st) + 2) / 2);
    bigText(p, s, st, tone, cx, cy - (lines.length - 1 - k) * BH);
  });
}
// 3-point result text: S0 at the result → S1 (5px) after 0.1s, held until the end. All 6 results use S1.
// Center both single-line and two-line text on the court.
function bbText(base: (p: string[][]) => void, str: string, st: number, tone: keyof typeof TTONE) {
  return function (p: string[][]) {
    base(p);
    if (BBLINES[str]) bigLines(p, BBLINES[str]!, st, tone, 12);
    else bigText(p, str, st, tone, 30, 9);
  };
}
function netSway(p: string[][], c: string) {
  // Net sway: row 8 x27·29·31 → w, row 9 x28-31 → c (W, money ball Y), row 10 x29·30 → w. Sway at 0.65·0.85s; normal net at 0.75·0.95s.
  [27, 29, 31].forEach(function (x) { set(p, x, 8, 'w'); });
  rect(p, 28, 9, 4, 1, c); set(p, 29, 10, 'w'); set(p, 30, 10, 'w');
}
function bb3(o: BBScene) {
  return function (p: string[][]) {
    const cur = o.cur === undefined ? 1 : o.cur;
    bbField(p, cur);
    if (o.cheer) { const a = o.cheer === 2 ? ['Y', 'C'] : ['C', 'Y']; crowd(p, 1, [a[0]!]); crowd(p, 3, [a[1]!]); }   // Money-ball crowd: 1 (row 1 C · row 3 Y) ↔ 2 (swapped)
    if (o.flash) netFlash(p, o.flash);
    if (o.sway) netSway(p, o.sway);
    rack(p, o.rack === undefined ? 3 : o.rack);
    const s = SPOTS[cur]!, sx = Math.min(49, Math.max(10, s[0] - 1)), sy = s[1] - 7 - (o.jump ? 1 : 0);
    put(p, o.jump ? 'shootUp' : 'shooter', sx, sy);
    if (o.hold) put(p, o.hold, sx + 1, sy - 2);
    (o.ghost || []).forEach(function (q) { set(p, q[0], q[1], q[2] || 'w'); });
    (o.sparks || []).forEach(function (q) { put(p, 'spark', q[0], q[1]); });
    if (o.ball) put(p, o.ball[2] || 'bb', o.ball[0], o.ball[1]);
  };
}
