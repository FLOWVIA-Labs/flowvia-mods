import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, PluginOptions } from 'claude-code'
import type { NeonSectionsConfig, PanelState, ColorKey, Section } from '../types/index'
import { empty } from './state'
import { languageOption, messages, resolveLanguage } from './i18n'
import { editable, effects } from './effects'
import { approximation, background, glowColor, palettes, titleColor } from './colors'
import { config, defaults, validColor } from './sections'
import { drawGrid } from './effects-grid'

const session = atom({ plugin: 'neon-sections', key: 'session' } as const, empty)
const appearance = atom({ plugin: 'neon-sections', key: 'appearance' } as const, { light: false, verbose: false })
export const panelId = 'neon-sections-settings'
const initial: PanelState = { light: null, messages: { conclusion: null, attention: null, next: null }, row: 0, column: 0, notice: null }
const panel = atom({ plugin: 'neon-sections', key: 'panel' } as const, initial)
export async function resetPanel($: EngineInterface) { await update($, panel, () => initial) }
export async function openPanel($: EngineInterface, light: boolean, title: string) {
  await update($, panel, (p): PanelState => p.light === null ? { ...p, light } : p)
  await $.ui.open({ id: panelId, title, focus: true, closeOnEscape: true })
}
async function save($: EngineInterface, c: NeonSectionsConfig, key: keyof NeonSectionsConfig, value: string | boolean) {
  const result = await $.config.set({ key: `neon-sections.${key}`, value })
  if (result.deny !== undefined) {
    const section = editable.find(s => key.startsWith(s.key))?.key
    await update($, panel, (p): PanelState => key.includes('Color')
      ? { ...p, messages: { ...p.messages, [section!]: { kind: 'rejected', reason: result.deny } } }
      : { ...p, notice: { kind: 'rejected', reason: result.deny } })
    return false
  }
  const settings = atom({ plugin: 'neon-sections', key: 'config' } as const, c)
  await update($, settings, old => config({ ...old, [key]: result.value }))
  return true
}
async function select($: EngineInterface, c: NeonSectionsConfig, row: number, column: number, toggle: boolean, interactive: boolean) {
  const effect = effects[row]!, section = editable[column]!
  await update($, panel, (p): PanelState => ({ ...p, row, column, notice: !interactive && row > 0 && toggle
    ? { kind: 'unsupported', row } : null }))
  if (toggle && (interactive || row === 0)) {
    const key = `${section.key}${effect.key}` as const
    await save($, c, key, !c[key])
  }
}
export function registerPanel(on: On, options: PluginOptions, stop: () => void) {
  const preference = atom({ plugin: 'neon-sections', key: 'language' } as const, languageOption(options.language))
  const settings = atom({ plugin: 'neon-sections', key: 'config' } as const, config(options))
  on('ui.message', { component: 'Pane', requestId: panelId, element: 'effects-grid' }, async ($, e) => {
    if (!e.data || typeof e.data !== 'object') return {}
    const { row, column, toggle } = e.data as Record<string, unknown>
    if (typeof row !== 'number' || !Number.isInteger(row) || row < 0 || row >= effects.length ||
        typeof column !== 'number' || !Number.isInteger(column) || column < 0 || column >= editable.length || typeof toggle !== 'boolean') return {}
    await select($, await read($, settings), row, column, toggle, true)
    return {}
  })
  on('ui.focus', { component: 'Pane', requestId: panelId }, async ($, e, next) => {
    const result = await next(e)
    if (result.deny !== undefined) return result
    const cell = /^effect-([0-4])-([0-2])$/.exec(e.element ?? '')
    if (cell) await update($, panel, (p): PanelState => ({ ...p, row: Number(cell[1]), column: Number(cell[2]), notice: null }))
    const color = /^palette-(conclusion|attention|next)-(\d+)$/.exec(e.element ?? '')
    if (color) {
      const p = await read($, panel), a = await read($, appearance)
      const palette = palettes[(p.light ?? a.light) ? 'light' : 'dark']
      const choice = palette[Number(color[2])]
      if (choice) await update($, panel, (p): PanelState => ({ ...p, messages: { ...p.messages, [color[1]!]: { kind: 'palette', index: Number(color[2]), light: p.light ?? a.light } } }))
    }
    return result
  })
  on('ui.render', { component: 'Pane', requestId: panelId }, async ($, e, next) => {
    if (e.surface !== 'terminal' && e.surface !== 'desktop') return next(e)
    const p = await read($, panel), c = await read($, settings), s = await read($, session), a = await read($, appearance)
    const language = await resolveLanguage($, await read($, preference)), t = messages[language]
    const option = await read($, preference)
    const light = p.light ?? a.light, wide = e.props.bodyColumns >= 110
    const interactive = e.surface !== 'terminal' || e.viewport?.isFullscreen === true
    const { Box, Text, Button, Input, Client } = $.ui.resolve(e)
    const palette = palettes[light ? 'light' : 'dark']
    async function color(section: Section, value: string) {
      if (!validColor(value)) { await update($, panel, (p): PanelState => ({ ...p, messages: { ...p.messages, [section]: { kind: 'colorError' } } })); return }
      const key: ColorKey = `${section}Color${light ? 'Light' : 'Dark'}`
      if (await save($, c, key, value)) await update($, panel, (p): PanelState => ({ ...p, messages: { ...p.messages, [section]: { kind: 'approximation', value } } }))
    }
    function colorMessage(section: Section) {
      const message = p.messages[section]
      if (!message) return ' '
      if (message.kind === 'rejected') return t.rejected(message.reason)
      if (message.kind === 'colorError') return t.colorError
      if (message.kind === 'approximation') return approximation(message.value, language) || ' '
      const theme = message.light ? 'light' : 'dark'
      return `${t.sections[section]} · ${t.palettes[theme][message.index]} ${palettes[theme][message.index]![1]}`
    }
    const grid = { values: c, row: p.row, column: p.column, notice: !p.notice ? '' : p.notice.kind === 'rejected' ? t.rejected(p.notice.reason) : t.unsupported(t.effects[effects[p.notice.row]!.key][0]), wide, interactive, language }
    return <Box flexDirection="column">
      <Text bold>{t.title}</Text>
      <Button key="enabled" plain hotkey="o" autoFocus label={`${s.enabled ? '[✓]' : '[ ]'} ${t.show}`}
        onPress={async () => { stop(); await update($, session, s => ({ ...s, enabled: !s.enabled })) }} />
      <Button key="foldTools" plain hotkey="f" label={`${c.foldTools ? '[✓]' : '[ ]'} ${t.fold}`}
        onPress={() => save($, c, 'foldTools', !c.foldTools)} />
      <Button key="theme" plain hotkey="t" label={`${light ? '○' : '●'} ${t.dark}  ${light ? '●' : '○'} ${t.light}`}
        onPress={() => update($, panel, (p): PanelState => ({ ...p, light: !light, messages: initial.messages }))} />
      <Button key="language" plain label={`${t.language}  ${(['auto', 'ko', 'en'] as const).map(value => `${option === value ? '●' : '○'} ${value}`).join('  ')}`}
        onPress={async () => {
          const value = option === 'auto' ? 'ko' : option === 'ko' ? 'en' : 'auto'
          const result = await $.config.set({ key: 'neon-sections.language', value })
          if (result.deny !== undefined) {
            await update($, panel, (p): PanelState => ({ ...p, notice: { kind: 'rejected', reason: result.deny! } }))
          } else {
            await update($, preference, () => languageOption(result.value))
            await $.ui.open({ id: panelId, title: messages[await resolveLanguage($, result.value)].title, focus: true, closeOnEscape: true })
          }
        }} />
      {editable.map(section => {
        const key: ColorKey = `${section.key}Color${light ? 'Light' : 'Dark'}`
        const rows = wide ? [palette] : [palette.slice(0, 9), palette.slice(9)]
        return <Box key={`colors-${section.key}`} flexDirection="column" {...(light !== a.light ? { backgroundColor: background(light) } : {})}>
          <Box justifyContent="space-between">
            <Text bold color={titleColor(c[key], light)}><Text color={c[key]}>██ </Text>{t.sections[section.key]}</Text>
            <Input key={`hex-${section.key}`} label="hex" value={c[key]} submitLabel={t.apply} onSubmit={value => color(section.key, value)} />
            <Button key={`reset-${section.key}`} plain label={t.reset} onPress={() => color(section.key, defaults[key])} />
          </Box>
          {rows.map((row, rowIndex) => <Box key={`palette-row-${section.key}-${rowIndex}`}>
            {row.map((choice, index) => <Button key={`palette-${section.key}-${rowIndex * 9 + index}`} plain
              label={`${t.sections[section.key]} · ${t.palettes[light ? 'light' : 'dark'][rowIndex * 9 + index]} ${choice[1]}`} onPress={() => color(section.key, choice[1])}>
              <Text color={choice[1]}>{c[key].toUpperCase() === choice[1] ? '[██]' : ' ██ '}</Text>
            </Button>)}
          </Box>)}
          <Text color={light ? '#585858' : '#BCBCBC'}>{colorMessage(section.key)}</Text>
        </Box>
      })}
      <Text><Text color={light ? '#949494' : '#626262'}>██ </Text><Text color={light ? '#585858' : '#BCBCBC'}>{t.fixedRationale}</Text></Text>
      <Box key="previews" {...(light !== a.light ? { backgroundColor: background(light) } : {})}>
        {editable.map(section => {
          const key: ColorKey = `${section.key}Color${light ? 'Light' : 'Dark'}`
          const box = <Box key={`preview-${section.key}`} flexDirection="column" borderStyle="round" borderColor={c[key]} paddingX={1}>
            <Text bold color={titleColor(c[key], light)}>{t.sections[section.key]}</Text>
          </Box>
          return c[`${section.key}Glow`] ? <Box key={`preview-glow-${section.key}`} borderStyle="round" borderColor={glowColor(c[key], light)}>{box}</Box> : box
        })}
      </Box>
      {interactive ? <Client key="effects-grid" module="./effects-grid.tsx" props={grid} />
        : drawGrid({ Box, Text, Button }, grid, (row, column, toggle) => select($, c, row, column, toggle, false))}
      {interactive ? <Text dimColor>{t.gridKeys}</Text> : null}
      <Text dimColor>{t.panelKeys}</Text>
    </Box>
  }).catch(($, e, next) => next(e))
}
