import { messages } from './i18n'
import type { Language } from './i18n'

const dark = [
  [messages.ko.palettes.dark[0], '#FF5F5F'], [messages.ko.palettes.dark[1], '#FF8700'], [messages.ko.palettes.dark[2], '#FFD700'], [messages.ko.palettes.dark[3], '#AFFF00'],
  [messages.ko.palettes.dark[4], '#00FF87'], [messages.ko.palettes.dark[5], '#00D7FF'], [messages.ko.palettes.dark[6], '#5F87FF'], [messages.ko.palettes.dark[7], '#AF5FFF'],
  [messages.ko.palettes.dark[8], '#FF5FFF'], [messages.ko.palettes.dark[9], '#FFAF87'], [messages.ko.palettes.dark[10], '#FFFF87'], [messages.ko.palettes.dark[11], '#87FFD7'],
  [messages.ko.palettes.dark[12], '#00AFAF'], [messages.ko.palettes.dark[13], '#AFD7FF'], [messages.ko.palettes.dark[14], '#D7AFFF'], [messages.ko.palettes.dark[15], '#FFAFD7'],
  [messages.ko.palettes.dark[16], '#FF0087'], [messages.ko.palettes.dark[17], '#EEEEEE'],
] as const
const light = [
  [messages.ko.palettes.light[0], '#D70000'], [messages.ko.palettes.light[1], '#D75F00', '#AF5F00'], [messages.ko.palettes.light[2], '#AF8700', '#875F00'],
  [messages.ko.palettes.light[3], '#5F8700', '#5F5F00'], [messages.ko.palettes.light[4], '#00875F'], [messages.ko.palettes.light[5], '#0087AF', '#005F87'],
  [messages.ko.palettes.light[6], '#005FD7'], [messages.ko.palettes.light[7], '#8700D7'], [messages.ko.palettes.light[8], '#D700D7', '#AF00AF'],
  [messages.ko.palettes.light[9], '#D75F5F', '#AF5F5F'], [messages.ko.palettes.light[10], '#AF5F00'], [messages.ko.palettes.light[11], '#008787', '#005F5F'],
  [messages.ko.palettes.light[12], '#5F87D7', '#5F5FAF'], [messages.ko.palettes.light[13], '#0000AF'], [messages.ko.palettes.light[14], '#875FD7'],
  [messages.ko.palettes.light[15], '#D75FAF', '#AF0087'], [messages.ko.palettes.light[16], '#D7005F'], [messages.ko.palettes.light[17], '#3A3A3A'],
] as const
export const palettes = { dark, light }
export const background = (isLight: boolean) => isLight ? '#FFFFFF' : '#0D0D0D'
const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
const hex = (channels: number[]) => '#' + channels.map(c => Math.round(c).toString(16).padStart(2, '0')).join('').toUpperCase()
const levels = [0, 95, 135, 175, 215, 255]
export function contrastOnWhite(color: string) {
  const linear = rgb(color).map(c => c / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 1.05 / (linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722 + 0.05)
}
export function contrastOnDark(color: string) {
  return (1.05 / contrastOnWhite(color)) / (1.05 / contrastOnWhite('#0D0D0D'))
}
export function titleColor(color: string, isLight: boolean): string {
  if (!isLight) return color
  const preset = light.find(p => p[1] === color.toUpperCase())
  if (preset) return preset.length === 3 ? preset[2] : color
  const channels = rgb(color)
  while (contrastOnWhite(hex(channels)) < 4.5) {
    for (let i = 0; i < channels.length; i++) channels[i] = Math.max(0, channels[i]! - 1)
  }
  return hex(channels)
}
export function glowColor(color: string, isLight: boolean) {
  const bg = isLight ? 255 : 13
  return hex(rgb(color).map(c => c + (bg - c) * 0.55).map(c =>
    levels.reduce((best, n) => Math.abs(n - c) < Math.abs(best - c) ? n : best)))
}
export function approximation(color: string, language: Language = 'ko') {
  const channels = rgb(color)
  let distance = Infinity, closest = '', index = 16
  for (let n = 16; n <= 255; n++) {
    const k = n - 16
    const candidate = n < 232 ? [levels[Math.floor(k / 36)]!, levels[Math.floor(k / 6) % 6]!, levels[k % 6]!] : Array<number>(3).fill(8 + (n - 232) * 10)
    const d = candidate.reduce((sum, c, i) => sum + (c - channels[i]!) ** 2, 0)
    if (d < distance) { distance = d; closest = hex(candidate); index = n }
  }
  return distance === 0 ? '' : messages[language].approximation(closest, index)
}
