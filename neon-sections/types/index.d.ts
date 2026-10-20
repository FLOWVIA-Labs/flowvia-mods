export type PanelMessage = { kind: 'rejected'; reason: string } | { kind: 'colorError' }
  | { kind: 'approximation'; value: string } | { kind: 'palette'; index: number; light: boolean } | null;
export type PanelNotice = { kind: 'rejected'; reason: string } | { kind: 'unsupported'; row: number } | null;
export type Section = 'conclusion' | 'attention' | 'next';
export type Effect = 'Glow' | 'LatestOnly' | 'Hover' | 'Blink' | 'Breathe';
export type EffectKey = `${Section}${Effect}`;
export type ColorKey = `${Section}Color${'Dark' | 'Light'}`;
export type NeonSectionsConfig = {
  foldTools: boolean;
  conclusionColorDark: string; conclusionColorLight: string;
  attentionColorDark: string; attentionColorLight: string;
  nextColorDark: string; nextColorLight: string;
} & Record<EffectKey, boolean>;
export type Prismantis<Surface, Drawing> = {
  markdown: (args: { surface: Surface; text: string; columns: number }) => Promise<Drawing | undefined>;
};
export type PanelState = {
  light: boolean | null; messages: Record<Section, PanelMessage>; row: number; column: number; notice: PanelNotice;
};
export type NeonSectionsEntry =
  | { kind: 'text'; id: string; text: string }
  | { kind: 'tool'; id: string; name: string; summary: string; failed: boolean };
export type NeonSectionsTurn = {
  id: string; entries: NeonSectionsEntry[]; completedAt: number | null; attention: boolean;
};
export type NeonSectionsState = {
  enabled: boolean; active: string; latest: string; turns: NeonSectionsTurn[];
  expanded: Record<string, boolean>;
};
declare module 'claude-code' {
  interface PluginState {
    'neon-sections': {
      language: 'auto' | 'ko' | 'en';
      session: NeonSectionsState;
      config: NeonSectionsConfig;
      appearance: { light: boolean; verbose: boolean };
      tick: number;
      panel: PanelState;
      copy: Record<string, { revision: number; label: 'COPIED' | 'FAILED' | null; failed: boolean }>;
    };
  }
}
