import { messages } from './i18n'
import type { Language } from './i18n'
import type { ClientElements, ClientModule } from 'claude-code'
import { editable, effects } from './effects'
import type { EffectKey } from '../types/index'

export type GridProps = {
  values: Record<EffectKey, boolean>; row: number; column: number;
  wide: boolean; interactive: boolean; notice: string; language: Language;
}
export function drawGrid(elements: Pick<ClientElements, 'Box' | 'Text' | 'Button'>, p: GridProps,
  select: (row: number, column: number, toggle: boolean) => void) {
  const { Box, Text, Button } = elements
  const t = messages[p.language]
  const description = (row: number) => p.notice || `${t.effects[effects[row]!.key][1]} · ${t.enabledFor(t.sections[editable[p.column]!.key], p.values[`${editable[p.column]!.key}${effects[row]!.key}`])}`
  return <Box flexDirection="column">
    <Box><Box width={22}><Text>{t.effect}</Text></Box>{editable.map(s => <Box width={10}><Text>{t.gridSections[s.key]}</Text></Box>)}</Box>
    {effects.map((effect, row) => <Box flexDirection="column">
      {row === 1 ? <Text dimColor>{t.desktopOnly}</Text> : null}
      <Box>
        <Box width={22}><Text>{t.effects[effect.key][0]}</Text></Box>
        {editable.map((section, column) => {
          const supported = p.interactive || row === 0
          const current = row === p.row && column === p.column
          return <Box width={10}><Button key={`effect-${row}-${column}`} plain
            label={`${t.effects[effect.key][0]} × ${t.sections[section.key]}`} dimColor={!supported}
            onPress={() => select(row, column, true)}>
            <Text inverse={current} dimColor={!supported}>{supported ? p.values[`${section.key}${effect.key}`] ? '[✓]' : '[ ]' : ' ╌ '}</Text>
          </Button></Box>
        })}
        {p.wide ? <Text dimColor>{p.row === row ? description(row) : t.effects[effect.key][1]}</Text> : null}
      </Box>
    </Box>)}
    {!p.wide ? <Text dimColor>{description(p.row)}</Text> : null}
  </Box>
}
const EffectsGrid: ClientModule<GridProps, { row: number; column: number }> = (props, surface) => {
  const current = surface.state ?? { row: props.row, column: props.column }
  const select = (row: number, column: number, toggle: boolean) => {
    surface.setState({ row, column })
    surface.post({ row, column, toggle })
  }
  surface.onKey(e => {
    if (e.ctrl || e.meta) return
    const { row, column } = surface.state ?? current
    if (e.key === 'up') select(Math.max(0, row - 1), column, false)
    else if (e.key === 'down') select(Math.min(4, row + 1), column, false)
    else if (e.key === 'left') select(row, Math.max(0, column - 1), false)
    else if (e.key === 'right') select(row, Math.min(2, column + 1), false)
    else if (e.key === ' ' || e.key === 'return') select(row, column, true)
  })
  return drawGrid(surface.elements, { ...props, ...current }, select)
}
export default EffectsGrid
