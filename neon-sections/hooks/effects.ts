import { messages } from './i18n'

export const editable = [
  { key: 'conclusion', name: messages.ko.sections.conclusion },
  { key: 'attention', name: messages.ko.sections.attention },
  { key: 'next', name: messages.ko.sections.next },
] as const
export const effects = [
  { key: 'Glow', command: 'glow', name: messages.ko.effects.Glow[0], description: messages.ko.effects.Glow[1] },
  { key: 'LatestOnly', command: 'latest', name: messages.ko.effects.LatestOnly[0], description: messages.ko.effects.LatestOnly[1] },
  { key: 'Hover', command: 'hover', name: messages.ko.effects.Hover[0], description: messages.ko.effects.Hover[1] },
  { key: 'Blink', command: 'blink', name: messages.ko.effects.Blink[0], description: messages.ko.effects.Blink[1] },
  { key: 'Breathe', command: 'breathe', name: messages.ko.effects.Breathe[0], description: messages.ko.effects.Breathe[1] },
] as const
