import type { ClientModule } from 'claude-code'

const Copy: ClientModule<{ color: string; label: 'COPIED' | 'FAILED' | null }> = (props, surface) => {
  const { Text } = surface.elements
  surface.onPointer(e => {
    if (e.type === 'down' && e.button === 'left') surface.post('copy')
  })
  return props.label
    ? <Text mono color={props.label === 'COPIED' ? '#4EBA65' : '#FF6B80'}>{props.label}</Text>
    : <Text mono color={props.color}>[<Text color={props.color} bold>COPY</Text>]</Text>
}

export default Copy
