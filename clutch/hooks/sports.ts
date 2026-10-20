export const SPORTS = ['kick', 'bat', 'bb'] as const;
export type Sport = typeof SPORTS[number];

export function pickSport<T>(sports: readonly T[], random: () => number, current?: T): T {
  const choices = current === undefined ? sports : sports.filter(sport => sport !== current);
  return choices[Math.floor(random() * choices.length)]!;
}
