// Fixed visual reference values.
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
const SPR = {
  shooter: ['S..S', 'SrrS', '.rr.', 'CCCC', '.CC.', '.kk.', '.S.S', '.k.k'],
  shootUp: ['S..S', 'SrrS', '.rr.', 'CCCC', '.CC.', '.kk.', '.SS.', '.kk.'],
  bb:      ['OO', 'Oo'],
  money:   ['YC', 'CY'],

  kicker:  ['..rr.', '..rr.', '.CCCC', 'SCCCC', '.CCCS', '.kkk.', '.S..S', '.k..k'],
  kickerF: ['..rr..', '..rr..', '.CCCC.', 'SCCCCS', '.CCC..', '.kkk..', '.S.SSk', '.k....'],
  keeper:  ['W.rr.W', 'T.SS.T', 'TTTTTT', '.TTTT.', '.kkkk.', '.S..S.', '.k..k.'],
  kdiveL:  ['W.rr.....', 'WSSrTTTkk', '.W.TTTkSS'],
  kdiveR: [] as string[], sball: ['Wk', 'WW'], spark: ['.Y.', 'YWY', '.Y.'],
  skyFld:  ['k', 'P'],
  skyRun:  ['k', 'C'],
  skyCat:  ['bk'],
  skyPitch:['.k', 'PP'],
  skyBatR: ['..', '.k', 'EC'],
  skyBatS: ['....', '.kEE', '.C..'],
  skyBatF: ['E.', '.k', '.C'],
  skyDiveR:['Pk'], skyDiveL: ['Pk'].map(row => [...row].reverse().join('')),
};
SPR.kdiveR = SPR.kdiveL.map(function (r) { return r.split('').reverse().join(''); });
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
  if (left < 0 || top < 0 || left + W > 60 || top + BH > 18) throw new Error('clipped text');
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

// Independent pk() options and raster port: never import production drawing or shot logic.
type DesignScene = { kick?: boolean; keeper?: ['keeper' | 'kdiveL' | 'kdiveR', number, number];
  cheer?: boolean; rip?: [number, number]; ghost?: [number, number][]; spark?: [number, number]; text?: { value: string; stage: number; tone: 'good' | 'bad' } };
function put(p: string[][], s: keyof typeof SPR, x: number, y: number) {
  const m = SPR[s];
  if (x < 0 || y < 0 || y + m.length > 18 || m.some(row => x + row.length > 60)) throw new Error('clipped sprite');
  for (let j = 0; j < m.length; j++) for (let i = 0; i < m[j]!.length; i++) {
    const ch = m[j]![i]!; if (ch !== '.') set(p, x + i, y + j, ch);
  }
}
function ripple(p: string[][], cx: number, cy: number) {
  for (let y = 3; y < 10; y++) for (let x = 16; x < 44; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d < 4.2 && p[y]![x] === 'm') p[y]![x] = d < 2.6 ? 'W' : 'w';
  }
}
function cheer(p: string[][]) {
  for (let x = 0; x < 60; x++) { if (x % 3 === 1) {
    set(p, x, 1, ['Y', 'C', 'W'][x % 3 === 1 ? (x >> 1) % 3 : 0]!);
    set(p, x, 3, ['C', 'W', 'Y'][(x >> 2) % 3]!);
  } }
}
function set(p: string[][], x: number, y: number, c: string) { if (y >= 0 && y < p.length && x >= 0 && x < p[0]!.length) p[y]![x] = c; }
function rect(p: string[][], x: number, y: number, w: number, h: number, c: string) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(p, x + i, y + j, c); }
function crowd(p: string[][], y: number, cols: string[]) { for (let x = 0; x < p[0]!.length; x++) if (x % 3 === 1) set(p, x, y, cols[(x * 7) % cols.length]!); }
function pkField(p: string[][]) {
  rect(p, 0, 0, 60, 5, 'N'); crowd(p, 1, ['c', 'N', 't', 'p']); crowd(p, 3, ['p', 't', 'N', 'c']);
  for (let x = 0; x < 60; x++) set(p, x, 5, (Math.floor(x / 4) % 2) ? 'n' : 'k');
  for (let y = 6; y < 18; y++) for (let x = 0; x < 60; x++) p[y]![x] = (Math.floor(x / 6) % 2) ? 'g' : 'G';
  rect(p, 16, 3, 28, 7, 'D');
  for (let y = 3; y < 10; y++) for (let x = 16; x < 44; x++) if (x % 2 === 0 && y % 2 === 1) p[y]![x] = 'm';
  rect(p, 0, 10, 60, 1, 'W');
  rect(p, 15, 2, 30, 1, 'W'); rect(p, 15, 2, 1, 9, 'W'); rect(p, 44, 2, 1, 9, 'W');
}
export function expectedPixels(x = 28, y = 15, o: DesignScene = {}) {
  const p = Array.from({ length: 18 }, () => Array<string>(60).fill('G'));
  pkField(p);
  if (o.keeper) put(p, o.keeper[0], o.keeper[1], o.keeper[2]); else put(p, 'keeper', 27, 3);
  if (o.cheer) cheer(p);
  if (o.rip) ripple(p, o.rip[0], o.rip[1]);
  put(p, o.kick ? 'kickerF' : 'kicker', 22, 10);
  (o.ghost || []).forEach(function (q) { set(p, q[0], q[1], 'w'); });
  put(p, 'sball', x, y);
  if (o.spark) put(p, 'spark', o.spark[0], o.spark[1]);
  // Penalty-kick text is centered vertically on the field (cy 9).
  if (o.text) {
    const width = textW(o.text.value, o.text.stage) + 2, height = TSTAGE[o.text.stage]! + 2;
    if (30 - Math.floor(width / 2) < 0 || 30 - Math.floor(width / 2) + width > 60
      || 9 - Math.floor(height / 2) < 0 || 9 - Math.floor(height / 2) + height > 18) throw new Error('clipped text');
    bigText(p, o.text.value, o.text.stage, o.text.tone, 30, 9);
  }
  return p.map(row => row.map(c => parseInt(PAL[c]!.slice(1), 16)));
}
export function decode(cells: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes: number[] = [];
  let bits = 0, value = 0;
  for (const char of cells.replace(/=+$/, '')) {
    value = (value << 6) | alphabet.indexOf(char); bits += 6;
    if (bits >= 8) { bits -= 8; bytes.push((value >>> bits) & 255); }
  }
  const view = new DataView(Uint8Array.from(bytes).buffer);
  const pixels = Array.from({ length: 18 }, () => Array<number>(60).fill(0));
  const glyphs: number[] = [], pairs = new Set<string>();
  for (let i = 0; i < 540; i++) {
    const ch = view.getUint32(i * 12, true), fg = view.getUint32(i * 12 + 4, true), bg = view.getUint32(i * 12 + 8, true);
    glyphs.push(ch); pairs.add(`${fg}:${bg}`);
    pixels[Math.floor(i / 60) * 2]![i % 60] = ch === 32 ? bg : fg;
    pixels[Math.floor(i / 60) * 2 + 1]![i % 60] = bg;
  }
  return { pixels, glyphs, pairs: pairs.size, byteLength: bytes.length };
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

type DesignDraw = (p: string[][], t: Cells) => void;
const SCENES: Record<string, DesignDraw> = {};
function withText(base: DesignDraw, str: string, st: number, tone: keyof typeof TTONE, cy: number): DesignDraw {
  return (p, t) => {
    base(p, t);
    const w = textW(str, st) + 2, h = TSTAGE[st]! + 2;
    if (30 - Math.floor(w / 2) < 0 || 30 - Math.floor(w / 2) + w > 60
      || cy - Math.floor(h / 2) < 0 || cy - Math.floor(h / 2) + h > 18) throw new Error('clipped text');
    bigText(p, str, st, tone, 30, cy);
  };
}
SCENES['sky-wait'] = sky({});
SCENES['sky-pitch-0'] = sky({ pitch: 1, ball: [29, 13] });
SCENES['sky-pitch-1'] = sky({ ball: [29, 14], ghost: [[29, 13]] });
SCENES['sky-contact'] = sky({ bat: 'S', spark: [28, 14] });
// Results: first two frames show motion; the third shows the completed action and final text size. Text sits above (cy 4, rows 0-8) or below (cy 13, rows 9-17).
// Home run 0.55 / 0.80 / 1.20s (text from 0.90s): into the left-center sky → above the fence and stands → off the top edge.
SCENES['sky-hr-0'] = sky({ bat: 'F', ball: [26, 7], ghost: [[27, 9], [28, 11], [28, 13, 'M']] });
SCENES['sky-hr-1'] = sky({ bat: 0, run: [33, 13], flash: 1, ball: [24, 1], ghost: [[25, 3], [25, 5], [26, 7, 'M']], fld: { lf: [21, 4], cf: [27, 4] } });
SCENES['sky-hr-2'] = withText(sky({ bat: 0, run: [35, 10], flash: 1, lit: ['b1'], fld: { lf: [21, 4], cf: [27, 4], b2: [32, 7] } }), 'HOMERUN!!!!!!!', 2, 'good', 9); // Text is centered vertically on the field (cy 9).
// Triple 0.60 / 0.90 / 1.40s (reaches 3rd at 1.10s, text from 1.10s): rolls deep into right-center, stopping before the fence.
SCENES['sky-3b-0'] = sky({ bat: 0, run: [31, 14], ball: [36, 6], ghost: [[34, 9], [32, 12, 'M']] });
SCENES['sky-3b-1'] = sky({ bat: 0, run: [35, 10], ball: [38, 4], ghost: [[37, 5], [36, 6, 'M']], fld: { cf: [33, 4], rf: [40, 5], b2: [34, 7] } });
const SKY_3B = sky({ bat: 0, run: [23, 11], lit: ['b3'], ball: [21, 9], fld: { cf: [33, 4], rf: [39, 4], b2: [34, 7] } });
SCENES['sky-3b-t0'] = withText(SKY_3B, 'TRIPLE!!!!!!!', 0, 'good', 9);   // 1.10s; text is centered vertically on the field (cy 9).
SCENES['sky-3b-t1'] = withText(SKY_3B, 'TRIPLE!!!!!!!', 1, 'good', 9);   // 1.25s; text is centered vertically on the field (cy 9).
SCENES['sky-3b-2'] = withText(SKY_3B, 'TRIPLE!!!!!!!', 2, 'good', 9);    // 1.40s final; text is centered vertically on the field (cy 9).
// Double 0.55 / 0.80 / 1.40s (reaches 2nd at 1.10s): lands in left-center and bounces toward the fence.
SCENES['sky-2b-0'] = sky({ bat: 'F', ball: [26, 9], ghost: [[27, 11], [28, 13, 'M']] });
SCENES['sky-2b-1'] = sky({ bat: 0, run: [35, 10], ball: [22, 5], ghost: [[24, 6], [25, 8, 'M']], fld: { lf: [20, 5], cf: [27, 4], b2: [32, 8] } });
SCENES['sky-2b-2'] = withText(sky({ bat: 0, run: [30, 6], lit: ['b2'], ball: [24, 8], fld: { lf: [21, 4], cf: [27, 4], b2: [32, 8] } }), 'DOUBLE!!!!', 2, 'good', 9); // Text is centered vertically on the field (cy 9).
// Single 0.50 / 0.75 / 1.40s (reaches 1st at 1.10s): grounder between shortstop and second baseman, stopping in shallow outfield.
SCENES['sky-1b-0'] = sky({ bat: 'F', ball: [28, 10], ghost: [[28, 12], [29, 14, 'M']] });
SCENES['sky-1b-1'] = sky({ bat: 0, run: [33, 13], ball: [27, 6], ghost: [[27, 8], [28, 10, 'M']], fld: { ss: [24, 8, 'skyDiveR'], b2: [31, 7, 'skyDiveL'], cf: [29, 4] } });
SCENES['sky-1b-2'] = withText(sky({ bat: 0, run: [36, 11], lit: ['b1'], ball: [28, 6], fld: { ss: [25, 8], b2: [32, 7], cf: [29, 5] } }), 'HIT!!', 2, 'good', 9); // Text is centered vertically on the field (cy 9).
// Foul 0.55 / 0.75 / 1.10s (text from 0.80s): curves outside the 1st-base foul line toward the stands; that line and pole light up for about 0.5s.
SCENES['sky-foul-0'] = sky({ bat: 'F', ball: [36, 11], ghost: [[33, 13], [31, 14, 'M']] });
SCENES['sky-foul-1'] = sky({ bat: 'F', line: 1, ball: [53, 6], ghost: [[47, 8], [42, 9], [37, 11, 'M']] });
SCENES['sky-foul-2'] = withText(sky({ bat: 'F', line: 1, ball: [53, 6] }), 'FOUL BALL!!!', 2, 'warn', 9); // Text is centered vertically on the field (cy 9).
// Strikeout 0.40 / 0.55 / 0.90s (text from 0.60s): swing and miss → catcher's mitt → K + 3 strike lights.
SCENES['sky-k-0'] = sky({ bat: 'F', ball: [29, 15], ghost: [[29, 14], [29, 13, 'M']] });
SCENES['sky-k-1'] = sky({ bat: 'F', ball: [29, 17], k: 1 });
SCENES['sky-k-2'] = withText(SCENES['sky-k-1'], 'STRIKEOUT!!!!!!!', 2, 'bad', 9); // Text is centered vertically on the field (cy 9).


const SKY_RESULTS: Record<string, DesignDraw> = {
  'hr': sky({ bat: 0, run: [35, 10], flash: 1, lit: ['b1'], fld: { lf: [21, 4], cf: [27, 4], b2: [32, 7] } }),
  '2b': sky({ bat: 0, run: [30, 6], lit: ['b2'], ball: [24, 8], fld: { lf: [21, 4], cf: [27, 4], b2: [32, 8] } }),
  '1b': sky({ bat: 0, run: [36, 11], lit: ['b1'], ball: [28, 6], fld: { ss: [25, 8], b2: [32, 7], cf: [29, 5] } }),
  'foul': sky({ bat: 'F', line: 1, ball: [53, 6] }),
  '3b': SKY_3B, k: SCENES['sky-k-1']!,
};
export function expectedSky(name: string, result?: { value: string; stage: number; tone: keyof typeof TTONE; cy: number; lineOff?: boolean }) {
  const p = Array.from({ length: 18 }, () => Array<string>(60).fill('G')), t: Cells = {};
  const base = result ? result.lineOff ? sky({ bat: 'F', ball: [53, 6] }) : SKY_RESULTS[name]! : SCENES[name]!;
  (result ? withText(base, result.value, result.stage, result.tone, result.cy) : base)(p, t);
  const pixels = p.map(row => row.map(c => parseInt(PAL[c]!.slice(1), 16)));
  // Decode represents a character cell by its foreground and background pair.
  for (const [key, cell] of Object.entries(t)) {
    const [row, col] = key.split(',').map(Number) as [number, number];
    pixels[row * 2]![col] = parseInt(PAL[cell.f]!.slice(1), 16);
    pixels[row * 2 + 1]![col] = parseInt(PAL[cell.b]!.slice(1), 16);
  }
  return pixels;
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

const BB3 = {
  shot:   bb3({ jump: 1, ball: [16, 3] }),                                                      // 0.00 jump and release (all results)
  top:    bb3({ ball: [22, 0], ghost: [[20, 1], [18, 2], [16, 3, 'M']] }),                      // 0.30 apex (made and missed shots)
  in1:    bb3({ ball: [29, 8], flash: 'W', ghost: [[28, 6], [27, 5], [25, 3, 'M']] }),          // 0.55 made shot: through the net, net flashes
  in2:    bb3({ ball: [29, 9], sway: 'W' }),                                                    // 0.65 made shot: net sways, ball drops below it (behind text at 0.75s)
  clank0: bb3({ ball: [32, 5], sparks: [[32, 6]], ghost: [[30, 4], [28, 2], [25, 0, 'M']] }),   // 0.45 CLANK: right edge of rim
  clank1: bb3({ ball: [38, 8], ghost: [[37, 6], [35, 5, 'M']] }),                               // 0.60 bounces out to the right
  clank2: bb3({ ball: [42, 9], ghost: [[41, 8], [40, 7, 'M']] }),                               // 0.85 lands on the floor
  brick0: bb3({ ball: [30, 4], sparks: [[31, 3]], ghost: [[28, 2], [25, 0], [21, 0, 'M']] }),   // 0.40 BRICK: low, hard hit to the front of the backboard
  brick1: bb3({ ball: [20, 5], ghost: [[22, 5], [25, 4], [28, 4, 'M']] }),                      // 0.60 bounces forward and left
  brick2: bb3({ ball: [19, 9], ghost: [[20, 7], [21, 6, 'M']] }),                               // 0.85 onto the floor beside the shooter
  air0:   bb3({ ball: [20, 1], ghost: [[18, 1], [17, 2], [16, 3, 'M']] }),                      // 0.30 air ball: low apex
  air1:   bb3({ ball: [21, 8], ghost: [[21, 6], [21, 4], [21, 2, 'M']] }),                      // 0.55 falls short of the rim (no contact)
  air2:   bb3({ ball: [23, 9], ghost: [[22, 10], [21, 10, 'M']] }),                             // 0.80 lands on the floor and rolls
  mtop:   bb3({ rack: 0, ball: [22, 0, 'money'], ghost: [[20, 1], [18, 2], [16, 3, 'M']] }),    // 0.30 money-ball apex, empty rack
  min1:   bb3({ rack: 0, cheer: 1, flash: 'Y', sparks: [[20, 3], [38, 2]], ball: [29, 8, 'money'], ghost: [[28, 6], [27, 5], [25, 3, 'M']] }),   // 0.55 money ball scores
  min2:   bb3({ rack: 0, cheer: 2, sway: 'Y', sparks: [[17, 0], [40, 2]], ball: [29, 9, 'money'] })   // 0.65 yellow net sway, crowd and sparks change positions
};
// Shot preparation: hold the ball and wait for Space (no time limit).
SCENES['bb3-wait-0'] = bb3({ hold: 'bb' });                            // Left 45 degrees · 2nd ball · rack 3
SCENES['bb3-wait-m'] = bb3({ rack: 0, hold: 'money' });                // Left 45 degrees · money ball · rack 0
SCENES['bb3-wait-2'] = bb3({ cur: 2, rack: 4, hold: 'bb' });           // Next spot (top) · 1st ball · rack 4
SCENES['bb3-wait-4m'] = bb3({ cur: 4, rack: 0, hold: 'money' });       // Right corner · money ball · rack 0
// Result scenes (frames without text)
SCENES['bb3-shot'] = BB3.shot;
SCENES['bb3-shot-m'] = bb3({ rack: 0, jump: 1, ball: [16, 3, 'money'] });
SCENES['bb3-next'] = bb3({ rack: 2, hold: 'bb' });                     // Hold ends → pick up the 3rd ball (rack 3 → 2)
SCENES['bb3-top'] = BB3.top;
SCENES['bb3-clank-0'] = BB3.clank0;
SCENES['bb3-brick-0'] = BB3.brick0;
SCENES['bb3-air-0'] = BB3.air0;
SCENES['bb3-money-0'] = BB3.mtop;
// Result text: -0 = S0 at the result, -1 = final S1
SCENES['bbt-three-0'] = bbText(BB3.in1, 'THREEEEEEE!!!!!!!', 0, 'good');    // 0.55
SCENES['bbt-three-1'] = bbText(BB3.in2, 'THREEEEEEE!!!!!!!', 1, 'good');    // 0.65 final
SCENES['bbt-bang-1'] = bbText(BB3.in2, 'BANG!!!!!!!', 1, 'good');
SCENES['bbt-dt-0'] = bbText(BB3.in1, 'FROM DOWNTOWN!!!!!!!', 0, 'good');
SCENES['bbt-dt-1'] = bbText(BB3.in2, 'FROM DOWNTOWN!!!!!!!', 1, 'good');
SCENES['bbt-clank-0'] = bbText(BB3.clank1, 'CLANK!!!!!!!', 0, 'warn');      // 0.60
SCENES['bbt-clank-1'] = bbText(BB3.clank2, 'CLANK!!!!!!!', 1, 'warn');      // 0.85 (S1 from 0.70)
SCENES['bbt-brick-0'] = bbText(BB3.brick1, 'BRICK!!!!!!!', 0, 'warn');      // 0.60
SCENES['bbt-brick-1'] = bbText(BB3.brick2, 'BRICK!!!!!!!', 1, 'warn');      // 0.85 (S1 from 0.70)
SCENES['bbt-air-0'] = bbText(BB3.air1, 'AIR BALL!!!!!!!', 0, 'bad');        // 0.55
SCENES['bbt-air-1'] = bbText(BB3.air2, 'AIR BALL!!!!!!!', 1, 'bad');        // 0.80 (S1 from 0.65)
SCENES['bbt-mbang-0'] = bbText(BB3.min1, 'BANG!!!!!!!', 0, 'good');         // 0.55 money ball
SCENES['bbt-mbang-1'] = bbText(BB3.min2, 'BANG!!!!!!!', 1, 'good');         // 0.65 final money ball

// Fixed scene options and an independent implementation, never production imports.
const BB_OPTIONS: Record<string, BBScene> = {
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

export function expectedBBWait(cur: number, ball: number) {
  return bbPixels(bb3({ cur, rack: 5 - ball, hold: ball === 5 ? 'money' : 'bb' }));
}
function bbPixels(draw: DesignDraw) {
  const p = Array.from({ length: 18 }, () => Array<string>(60).fill('G'));
  draw(p, {});
  return p.map(row => row.map(c => parseInt(PAL[c]!.slice(1), 16)));
}
export function expectedBBDesign(name: string) { return bbPixels(SCENES[name]!); }
export function expectedBB(key: string, cur: number, ball: number, label?: { value: string; stage: number; tone: keyof typeof TTONE }, at = 0) {
  const o: BBScene = JSON.parse(JSON.stringify(BB_OPTIONS[key]));
  o.cur = cur; o.rack = 5 - ball;
  const release = [[11, 7], [16, 3], [30, 1], [44, 3], [50, 7]][cur]!;
  if (key === 'shot') o.ball = [release[0]!, release[1]!];
  else {
    if (cur >= 3) {
      if (o.ball) o.ball[0] = 58 - o.ball[0];
      for (const q of o.ghost ?? []) q[0] = 59 - q[0];
      for (const q of o.sparks ?? []) q[0] = 57 - q[0];
    }
    if (key === 'top' || key === 'mtop' || key === 'air0') o.ghost![2] = [release[0]!, release[1]!, 'M'];
  }
  if (ball === 5 && o.ball) o.ball[2] = 'money';
  if ((key === 'in2' || key === 'min2') && at >= 750) {
    delete o.ball;
    if (at === 750 || at === 950) delete o.sway;
  }
  for (const q of o.ghost ?? []) if (q[0] < 0 || q[0] >= 60 || q[1] < 0 || q[1] >= 18) throw new Error('clipped ghost');
  return bbPixels(label ? bbText(bb3(o), label.value, label.stage, label.tone) : bb3(o));
}
