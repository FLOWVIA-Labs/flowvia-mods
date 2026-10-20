import type { EngineInterface } from 'claude-code'

export type Language = 'ko' | 'en'
export type LanguageOption = 'auto' | Language
export const sectionKeys = ['conclusion', 'rationale', 'attention', 'next'] as const
export type SectionKey = typeof sectionKeys[number]
export const languageOption = (value: unknown): LanguageOption => value === 'ko' || value === 'en' ? value : 'auto'
export async function resolveLanguage($: Pick<EngineInterface, 'settings'>, value: unknown): Promise<Language> {
  const option = languageOption(value)
  if (option !== 'auto') return option
  try {
    const language = (await $.settings.read()).language
    return typeof language === 'string' && ['korean', 'ko', 'ko-kr', '한국어'].includes(language.trim().toLowerCase()) ? 'ko' : 'en'
  } catch { return 'en' }
}

export const messages = {
  ko: {
    sections: { conclusion: '결론', rationale: '근거', attention: '확인 필요', next: '다음 단계' },
    gridSections: { conclusion: '결론', attention: '확인 필요', next: '다음 단계' },
    statuses: { done: '완료', waiting: '대기', blocked: '막힘' },
    title: '답변 섹션 설정', answerSections: '답변 섹션', show: '답변 섹션 표시', fold: '도구 호출 접기',
    dark: '다크 테마용', light: '라이트 테마용', language: '언어', apply: '적용', reset: '기본값',
    workLog: '작업 과정', tools: (n: number) => `도구 ${n}회`, progress: (n: number) => `진행 문장 ${n}개`,
    failed: (n: number, details: string) => `실패 ${n}: ${details}`,
    rejected: (reason: string) => `거부: ${reason}`,
    command: '답변 섹션·색·테두리 효과 설정',
    usage: '거부: 색은 결론|확인 필요|다음 단계와 #RRGGBB [dark|light], 효과는 /ns-setting effect <glow|latest|hover|blink|breathe> <결론|확인 필요|다음 단계> <on|off>, 접기는 /ns-setting fold <on|off>를 사용합니다. 근거 색은 고정입니다.',
    colorError: '색 오류: #RRGGBB 형식으로 입력하세요',
    approximation: (color: string, index: number) => `256색 화면에서는 ${color}(${index})로 보임`,
    fixedRationale: '근거 · 바꿀 수 없습니다 · 효과 없음',
    copyFailed: '복사 실패 · 문장을 직접 선택해 복사하세요',
    effect: '효과', desktopOnly: '데스크톱·전체화면에서만',
    unsupported: (name: string) => `${name} — 이 화면에서 안 됨 · 데스크톱·전체화면에서 바꾸세요`,
    enabledFor: (section: string, enabled: boolean) => `${section}에 ${enabled ? '켜 둠' : '꺼 둠'}`,
    gridKeys: '↑↓ 효과  ←→ 섹션  Space 체크/해제  Esc 나가기',
    panelKeys: 'Tab 다음 칸  Enter 고르기  o 표시  f 접기  t 테마  Esc 닫기',
    effects: {
      Glow: ['이중 테두리 글로우', '상자 바깥에 흐린 테두리를 한 겹 더합니다'],
      LatestOnly: ['최신 답변만 네온', '지난 답변의 상자를 흐리게 합니다'],
      Hover: ['마우스 올리면 강조', '마우스를 올린 상자를 굵고 밝게 합니다'],
      Blink: ['깜빡임', '답변이 끝나면 한 번 밝아졌다 돌아옵니다'],
      Breathe: ['숨쉬기', '다음 질문까지 천천히 밝기가 오갑니다'],
    },
    palettes: {
      dark: ['빨강', '주황', '금색', '라임', '네온 그린', '시안', '파랑', '보라', '마젠타', '살구', '연노랑', '민트', '청록', '연하늘', '라벤더', '연분홍', '장미', '흰색'],
      light: ['빨강', '주황', '금색', '올리브', '초록', '시안', '파랑', '보라', '마젠타', '다홍', '갈색', '청록', '하늘', '남색', '라벤더', '연분홍', '장미', '먹색'],
    },
    prompt: "[답변 섹션 표기 — neon-sections mod]\n답변이 두 부분 이상이면 아래 소제목을 이 순서로, 줄 맨 앞에 정확히 쓴다. 내용이 없는 섹션은 쓰지 않는다.\n### 결론\n### 근거\n### 확인 필요\n### 다음 단계\n- 작업 결과를 보고하는 답이면 결론 소제목 뒤에 상태를 붙인다: \"### 결론 · 완료\", \"### 결론 · 대기\", \"### 결론 · 막힘\". 질문에 답하는 경우처럼 상태가 없는 답에는 붙이지 않는다.\n- 결론은 한두 문장으로 쓴다.\n- 근거의 핵심 문장은 **굵게** 쓴다. 문장 하나를 통째로 강조할 때만 그 목록 항목이나 문단 전체를 <u>와 </u>로 감싼다.\n- 확인 필요에는 사용자가 답하거나 정해야 하는 것만 쓴다.\n- 다음 단계는 할 일을 줄 맨 앞 번호(1. 2.)로 쓴다. 한 번호 안에 할 일이 둘 이상이면 1-1. 1-2.로 나눈다. 항목에 딸린 문장과 코드 블록은 번호 뒤 글자 시작 위치만큼 들여 써서 그 항목 안에 둔다.\n- 한두 문장으로 끝나는 짧은 답과 도구 호출 사이의 진행 상황 문장에는 소제목을 쓰지 않는다.\n- 다른 규칙이나 스킬이 출력 형식을 정했으면 이 소제목을 쓰지 않고 그 형식을 따른다.",
  },
  en: {
    sections: { conclusion: 'Conclusion', rationale: 'Rationale', attention: 'Needs your input', next: 'Next steps' },
    gridSections: { conclusion: 'Concl.', attention: 'Input', next: 'Next' },
    statuses: { done: 'Done', waiting: 'Waiting', blocked: 'Blocked' },
    title: 'Answer sections', answerSections: 'Answer sections', show: 'Show answer sections', fold: 'Fold tool calls',
    dark: 'Dark theme', light: 'Light theme', language: 'Language', apply: 'Apply', reset: 'Default',
    workLog: 'Work log', tools: (n: number) => `${n} tool ${n === 1 ? 'call' : 'calls'}`,
    progress: (n: number) => `${n} progress ${n === 1 ? 'note' : 'notes'}`,
    failed: (n: number, details: string) => `${n} failed: ${details}`,
    rejected: (reason: string) => `Rejected: ${reason}`,
    command: 'Configure answer sections, colors and border effects',
    usage: 'Rejected: for colors use Conclusion|Needs your input|Next steps and #RRGGBB [dark|light]; for effects use /ns-setting effect <glow|latest|hover|blink|breathe> <Conclusion|Needs your input|Next steps> <on|off>; for folding use /ns-setting fold <on|off>. The rationale color is fixed.',
    colorError: 'Invalid color: enter #RRGGBB',
    approximation: (color: string, index: number) => `Shown as ${color}(${index}) on 256-color displays`,
    fixedRationale: 'Rationale · fixed color · no effects',
    copyFailed: 'Copy failed · select the text and copy it yourself',
    effect: 'Effect', desktopOnly: 'Desktop and fullscreen only',
    unsupported: (name: string) => `${name} — unavailable here · change it on desktop or in fullscreen`,
    enabledFor: (section: string, enabled: boolean) => `${enabled ? 'On' : 'Off'} for ${section}`,
    gridKeys: '↑↓ effect  ←→ section  Space toggle  Esc exit',
    panelKeys: 'Tab next field  Enter select  o show  f fold  t theme  Esc close',
    effects: {
      Glow: ['Double-border glow', 'Add a dim outer border to the box'],
      LatestOnly: ['Neon on latest only', 'Dim boxes in earlier answers'],
      Hover: ['Highlight on hover', 'Make the hovered box bold and bright'],
      Blink: ['Blink', 'Brighten once when the answer finishes'],
      Breathe: ['Breathe', 'Slowly vary brightness until the next question'],
    },
    palettes: {
      dark: ['Red', 'Orange', 'Gold', 'Lime', 'Neon green', 'Cyan', 'Blue', 'Purple', 'Magenta', 'Apricot', 'Pale yellow', 'Mint', 'Teal', 'Pale sky blue', 'Lavender', 'Pale pink', 'Rose', 'White'],
      light: ['Red', 'Orange', 'Gold', 'Olive', 'Green', 'Cyan', 'Blue', 'Purple', 'Magenta', 'Vermilion', 'Brown', 'Teal', 'Sky blue', 'Navy', 'Lavender', 'Pale pink', 'Rose', 'Charcoal'],
    },
    prompt: "[Answer sections — neon-sections mod]\nWhen an answer has two or more parts, write the headings below in this order, exactly as shown, at the start of a line. Leave out any section that would be empty.\n### Conclusion\n### Rationale\n### Needs your input\n### Next steps\n- Write these headings exactly as shown, even when you answer in another language.\n- When the answer reports the result of a task, add a status after the Conclusion heading: \"### Conclusion · Done\", \"### Conclusion · Waiting\", \"### Conclusion · Blocked\". Add no status when there is none, such as when answering a question.\n- Keep the conclusion to one or two sentences.\n- Put the key sentences of the rationale in **bold**. Wrap a whole list item or paragraph in <u> and </u> only when the entire sentence needs emphasis.\n- Under Needs your input, list only what the user has to answer or decide.\n- Under Next steps, write each task as a number at the start of a line (1. 2.). When one number holds two or more tasks, split them as 1-1. 1-2. Indent sentences and code blocks that belong to an item to where the text after its number starts, so they stay inside that item.\n- Do not use these headings for short answers of one or two sentences, or for progress sentences between tool calls.\n- When another rule or skill defines the output format, follow that format instead of these headings.",
  },
} as const

export function sectionKey(name: string): SectionKey | undefined {
  return sectionKeys.find(key => key === name.toLowerCase() ||
    Object.values(messages).some(pack => pack.sections[key].toLowerCase() === name.toLowerCase()))
}
export function statusBadge(status: string, language: Language) {
  const key = (['done', 'waiting', 'blocked'] as const).find(key =>
    Object.values(messages).some(pack => pack.statuses[key] === status))
  if (!key) return undefined
  const [symbol, color] = { done: ['✓', 'success'], waiting: ['…', 'warning'], blocked: ['✗', 'error'] }[key]!
  return [`${symbol} ${messages[language].statuses[key]}`, color] as const
}
