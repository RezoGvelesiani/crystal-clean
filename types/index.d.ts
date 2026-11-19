export type Hud = {
  counts: Record<string, number>
  last: Record<string, string>
  ms: Record<string, number>
  active: string | null
  model: string
  thinking: string
  compactions: number
  compactStart: number | null
  compactLastMs: number | null
  turnStart: number | null
  lastTurnMs: number | null
  tokPerSec: number | null
  subagents: number
  now: number
}

declare module 'claude-code' {
  interface PluginState {
    'armazi-hud': { hud: Hud; isExpanded: boolean }
  }
}
