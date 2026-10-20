import type { EngineInterface, PluginOptions } from 'claude-code';

export type Activity = {
  key: 'ready' | 'thinking' | 'writing' | 'tool' | 'tests' | 'git' | 'command' | 'editing' | 'reading' | 'web' | 'subagent';
  detail?: string;
};

export const messages = {
  ko: {
    names: { kick: '승부차기', bat: '야구', bb: '3점슛 콘테스트' },
    shortNames: { kick: '승부차기', bat: '야구', bb: '3점슛 콘테스트' },
    totals: { kick: ['골', '선방', '빗나감'], bat: ['홈런', '안타', '삼진'], bb: ['점수', '성공', '실패'] },
    shoot: '슛', swing: '스윙', pause: '멈춤',
    activity: {
      ready: '준비 중', thinking: '생각 중', writing: '답 쓰는 중',
      tool: (name = '') => `${name} 사용 중`,
      tests: '테스트 실행 중', git: 'git 작업 중', command: '명령 실행 중',
      editing: (file = '') => `파일 편집 중 (${file})`,
      reading: '코드 읽는 중', web: '웹 찾는 중', subagent: '서브에이전트 작업 중',
    },
    paused: 'clutch 멈춤 · 다음 질문에서 다시 켜집니다',
    narrow: '터미널을 넓히면 게임이 나옵니다',
    description: '스포츠 미니게임 켜기·끄기',
    on: 'clutch 켜짐', off: 'clutch 꺼짐',
    usage: '사용법: /clutch (켜기·끄기)',
  },
  en: {
    names: { kick: 'Penalty Shootout', bat: 'Baseball', bb: '3-Point Contest' },
    shortNames: { kick: 'Shootout', bat: 'Baseball', bb: '3-Point' },
    totals: { kick: ['Goals', 'Saves', 'Misses'], bat: ['HR', 'Hits', 'K'], bb: ['Pts', 'Made', 'Missed'] },
    shoot: 'Shoot', swing: 'Swing', pause: 'Pause',
    activity: {
      ready: 'is getting ready', thinking: 'is thinking', writing: 'is writing',
      tool: (name = '') => `is using ${name}`,
      tests: 'is running tests', git: 'is working with git', command: 'is running a command',
      editing: (file = '') => `is editing ${file || 'a file'}`,
      reading: 'is reading code', web: 'is searching the web', subagent: 'is running a subagent',
    },
    paused: 'clutch paused · back on your next prompt',
    narrow: 'Widen the terminal to play',
    description: 'Toggle sports minigames',
    on: 'clutch on', off: 'clutch off',
    usage: 'Usage: /clutch (toggle on/off)',
  },
} as const;

export async function language($: EngineInterface, options: PluginOptions): Promise<keyof typeof messages> {
  let choice = options.language;
  try {
    choice = (await $.config.list()).find(row => row.key === 'clutch.language')?.value ?? choice;
  } catch { /* Use the registered option when config is unavailable. */ }
  if (choice === 'ko' || choice === 'en') return choice;
  try {
    const value = (await $.settings.read()).language;
    return typeof value === 'string' && ['korean', 'ko', 'ko-kr', '한국어'].includes(value.trim().toLowerCase()) ? 'ko' : 'en';
  } catch { return 'en'; }
}

export function activityText(words: typeof messages[keyof typeof messages], activity: Activity): string {
  const value = words.activity[activity.key];
  return typeof value === 'function' ? value(activity.detail) : value;
}
