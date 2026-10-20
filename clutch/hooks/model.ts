export type Point = [number, number];
export type Keeper = ['keeper' | 'kdiveL' | 'kdiveR', number, number];
export type Shot = { result: 'goal' | 'save' | 'miss'; ball: Point; keeper: Keeper; rip?: Point; spark?: Point };
export type Score = Record<Shot['result'], number>;
export function shoot(random: () => number): Shot {
  const r1 = random(), r2 = random(), r3 = random(), r4 = random(), r5 = random();
  const z = Math.min(4, Math.floor(r3 * 5)), x = [18, 23, 29, 34, 40][z]!;
  const left = r5 < .5, dive: Keeper = left ? ['kdiveL', 18, 6] : ['kdiveR', 34, 6];
  if (r1 < .30) return r4 < .5
    ? { result: 'miss', ball: [x, 0], keeper: dive }
    : { result: 'miss', ball: [left ? 15 : 43, 4], keeper: dive, spark: [left ? 13 : 44, 3] };
  if (r2 < .30) return { result: 'save', ball: [x, z === 2 ? 6 : 5],
    keeper: z < 2 ? ['kdiveL', x + 2, 5] : z > 2 ? ['kdiveR', x - 9, 5] : ['keeper', 27, 3] };
  return { result: 'goal', ball: [x, 4], rip: [x + 1, 5],
    keeper: z < 2 ? ['kdiveR', 34, 6] : z > 2 ? ['kdiveL', 18, 6] : dive };
}
export function kickPosition(elapsed: number, end: Point): Point {
  const t = Math.min(elapsed / 250, 1);
  return [Math.round(28 + (end[0] - 28) * t), Math.round(15 + (end[1] - 15) * t)];
}
export function fitActivity(activity: string, limit: number) {
  const value = `Claude ${activity}`;
  const width = (c: string) => /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/u.test(c) ? 2 : 1;
  if ([...value].reduce((n, c) => n + width(c), 0) <= limit) return value;
  let result = '', columns = 0;
  for (const c of value) {
    if (columns + width(c) > limit - 1) break;
    result += c; columns += width(c);
  }
  return result.trimEnd() + '…';
}
