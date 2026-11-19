import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Hud } from '../types'

// Port of Caqtus/armazi-hud (a DSH web HUD) to Claude Code: a read-only strip
// above the prompt. It observes events and never changes what passes through.

const EMPTY: Hud = {
  counts: {}, last: {}, ms: {}, active: null, model: '', thinking: '',
  compactions: 0, compactStart: null, compactLastMs: null,
  turnStart: null, lastTurnMs: null, tokPerSec: null, subagents: 0, now: 0,
}

const hud = atom({ plugin: 'armazi-hud', key: 'hud' } as const, EMPTY)
const isExpanded = atom({ plugin: 'armazi-hud', key: 'isExpanded' } as const, false)

const ACTIVE = '#22c55e'
const COMPACT = '#f59e0b'

// family -> [label, color]; order is the strip's order
const FAMILIES: Array<[string, string, string]> = [
  ['thinking', 'think', '#f4a6c6'],
  ['bash', 'bash', '#7aa2f7'],
  ['read', 'read', '#9ece6a'],
  ['edit', 'edit', '#e0af68'],
  ['skill', 'skill', '#7dcfff'],
  ['grep', 'grep', '#bb9af7'],
  ['search', 'search', '#ff9e64'],
  ['agent', 'agent', '#f7768e'],
  ['task', 'todo', '#c0caf5'],
  ['mcp', 'mcp', '#73daca'],
  ['other', 'other', '#a9b1d6'],
]

const family = (tool: string): string => {
  if (tool.startsWith('mcp__')) return 'mcp'
  switch (tool) {
    case 'Bash': case 'BashOutput': case 'KillShell': case 'Monitor': return 'bash'
    case 'Read': case 'NotebookRead': return 'read'
    case 'Edit': case 'Write': case 'MultiEdit': case 'NotebookEdit': return 'edit'
    case 'Skill': return 'skill'
    case 'Grep': case 'Glob': return 'grep'
    case 'WebSearch': case 'WebFetch': case 'ToolSearch': return 'search'
    case 'Agent': case 'Task': case 'SendMessage': return 'agent'
    case 'TodoWrite': case 'TaskCreate': case 'TaskUpdate': case 'TaskList': case 'TaskGet': return 'task'
    default: return 'other'
  }
}

const base = (p: string) => p.split('/').pop() ?? p

const describe = (e: Record<string, unknown>): string => {
  const s = (k: string) => (typeof e[k] === 'string' ? (e[k] as string) : '')
  return (
    s('command') || base(s('file_path')) || base(s('notebook_path')) || s('pattern') ||
    s('query') || s('url') || s('skill') || s('description') || s('subject') || String(e.tool)
  ).replace(/\s+/g, ' ').slice(0, 60)
}

const fmtTime = (ms: number) => {
  const t = Math.max(0, Math.round(ms / 1000))
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

const fmtK = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : String(n))

let ticker: Timer | null = null
let running = 0 // things that need the clock to tick (turn, compaction)

function set($: EngineInterface, fn: (h: Hud) => Hud) {
  return update($, hud, h => fn({ ...EMPTY, ...h }))
}

function startTick($: EngineInterface) {
  running += 1
  if (ticker) return
  ticker = $.clock.every(1000, () => {
    void $.clock.now().then(now => set($, h => ({ ...h, now })))
  })
}

function stopTick() {
  running = Math.max(0, running - 1)
  if (running === 0 && ticker) {
    ticker.cancel()
    ticker = null
  }
}

export const register: Register = on => {
  on('session.end', async ($, e, next) => {
    await update($, hud, () => EMPTY)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const now = await $.clock.now()
    await set($, h => ({ ...h, turnStart: now, now }))
    startTick($)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const now = await $.clock.now()
      await set($, h => ({
        ...h, active: null, now,
        lastTurnMs: h.turnStart === null ? h.lastTurnMs : now - h.turnStart,
        turnStart: null,
      }))
      stopTick()
    }
    return next(e)
  })

  // Every model request: "thinking". Count it, keep a preview of the latest
  // reasoning/text, and measure output tokens per second.
  on('turn.step', async function* ($, e, next) {
    const t0 = await $.clock.now()
    await set($, h => ({
      ...h, active: 'thinking', model: e.model,
      counts: { ...h.counts, thinking: (h.counts.thinking ?? 0) + 1 },
    }))
    let preview = ''
    let lastPush = 0
    let outTokens: number | null = null
    const stream = next(e)
    for await (const chunk of stream) {
      if (chunk.kind === 'thinking' || chunk.kind === 'text') {
        preview = (preview + chunk.text).slice(-400)
        const now = await $.clock.now()
        if (now - lastPush > 500) {
          lastPush = now
          const p = preview
          await set($, h => ({ ...h, thinking: p }))
        }
      } else if (chunk.kind === 'stop' && chunk.usage) {
        outTokens = chunk.usage.output_tokens ?? null
      }
      yield chunk
    }
    const result = await stream.result
    const t1 = await $.clock.now()
    const secs = (t1 - t0) / 1000
    const p = preview
    await set($, h => ({
      ...h,
      active: h.active === 'thinking' ? null : h.active,
      thinking: p || h.thinking,
      tokPerSec: outTokens !== null && secs > 0 ? Math.round(outTokens / secs) : h.tokPerSec,
      ms: { ...h.ms, thinking: (h.ms.thinking ?? 0) + (t1 - t0) },
    }))
    return result
  })

  on('tool.call', async ($, e, next) => {
    const fam = family(e.tool)
    const what = describe(e as unknown as Record<string, unknown>)
    const t0 = await $.clock.now()
    await set($, h => ({
      ...h, active: fam,
      counts: { ...h.counts, [fam]: (h.counts[fam] ?? 0) + 1 },
      last: { ...h.last, [fam]: `${e.tool}: ${what}` },
    }))
    try {
      return await next(e)
    } finally {
      const t1 = await $.clock.now()
      await set($, h => ({
        ...h,
        active: h.active === fam ? null : h.active,
        ms: { ...h.ms, [fam]: (h.ms[fam] ?? 0) + (t1 - t0) },
      }))
    }
  })

  on('agent.spawn', async ($, e, next) => {
    await set($, h => ({ ...h, subagents: h.subagents + 1 }))
    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    if (e.trigger === 'precompute') return next(e)
    const t0 = await $.clock.now()
    await set($, h => ({ ...h, compactStart: t0, compactLastMs: null, now: t0 }))
    startTick($)
    try {
      const r = await next(e)
      const t1 = await $.clock.now()
      const skipped = 'skip' in r && r.skip !== undefined
      await set($, h => ({
        ...h, compactStart: null, now: t1,
        compactions: skipped ? h.compactions : h.compactions + 1,
        compactLastMs: skipped ? null : t1 - t0,
      }))
      // hold the final duration a few seconds, then settle to the plain count
      $.clock.after(5000, () => {
        void set($, h => ({ ...h, compactLastMs: null }))
      })
      return r
    } finally {
      stopTick()
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const h = { ...EMPTY, ...(await read($, hud)) }
    const open = await read($, isExpanded)
    const { Box, Text, Button } = $.ui.resolve(e)

    const anyActive = h.active !== null || h.compactStart !== null
    const chips = FAMILIES.filter(([k]) => k === 'thinking' || (h.counts[k] ?? 0) > 0)

    const chip = ([k, label, color]: [string, string, string]) => {
      const isOn = h.active === k
      const c = isOn ? ACTIVE : anyActive ? 'gray' : color
      return (
        <Text key={k} color={c} bold={isOn}>
          ● {label} ×{h.counts[k] ?? 0}{'  '}
        </Text>
      )
    }

    const compactChip = (() => {
      if (h.compactStart !== null) {
        return <Text key="cmp" color={COMPACT} bold>⟳ ×{h.compactions + 1} + {fmtTime(h.now - h.compactStart)}{'  '}</Text>
      }
      if (h.compactLastMs !== null) {
        return <Text key="cmp" color={COMPACT}>⟳ ×{h.compactions} · {fmtTime(h.compactLastMs)}{'  '}</Text>
      }
      return <Text key="cmp" color={anyActive ? 'gray' : COMPACT}>⟳ ×{h.compactions}{'  '}</Text>
    })()

    const strip = (
      <Box key="strip" flexDirection="row" flexWrap="wrap">
        {chips.map(chip)}
        {compactChip}
        <Button
          key="toggle"
          label={open ? 'hide' : 'details'}
          onPress={() => update($, isExpanded, v => !v)}
        />
      </Box>
    )

    if (!open || e.props.isCollapsed) return <Box flexDirection="column">{strip}</Box>

    const usage = await $.session.usage().catch(() => null)
    const ctx = usage?.context
    const ctxText = ctx
      ? `${ctx.tokens !== undefined ? fmtK(ctx.tokens) : '?'} / ${fmtK(ctx.window)}${ctx.percent !== undefined ? ` (${Math.round(ctx.percent)}%)` : ''}`
      : '—'
    const turnMs = h.turnStart !== null ? h.now - h.turnStart : h.lastTurnMs
    const cost = usage?.cost ? ` · $${usage.cost.usd.toFixed(2)}` : ''

    const cols = Math.max(20, e.props.bodyColumns - 4)
    const room = Math.max(0, e.props.maxRows - 4)
    const tools = FAMILIES.filter(([k]) => (h.counts[k] ?? 0) > 0).slice(0, room)
    const max = Math.max(1, ...tools.map(([k]) => h.counts[k] ?? 0))
    const barW = 10

    return (
      <Box flexDirection="column">
        {strip}
        <Text key="think" dimColor wrap="truncate-start">
          {h.active === 'thinking' ? '◆ ' : '◇ '}{(h.thinking || 'no reasoning yet').replace(/\s+/g, ' ').slice(-cols)}
        </Text>
        <Text key="metrics">
          <Text color="#7dcfff">{h.model || 'model —'}</Text>
          <Text dimColor>
            {' · '}{h.tokPerSec !== null ? `${h.tokPerSec} tok/s` : '— tok/s'}
            {' · ctx '}{ctxText}
            {' · turn '}{turnMs !== null ? fmtTime(turnMs) : '—'}
            {' · subagents '}{h.subagents}{cost}
          </Text>
        </Text>
        {tools.map(([k, label, color]) => {
          const n = h.counts[k] ?? 0
          const w = Math.max(1, Math.round((n / max) * barW))
          return (
            <Text key={`t-${k}`} wrap="truncate-end">
              <Text color={h.active === k ? ACTIVE : color}>{label.padEnd(6)} {'█'.repeat(w)}{' '.repeat(barW - w)}</Text>
              <Text dimColor> ×{n} · {Math.round((h.ms[k] ?? 0) / 1000)} s · {h.last[k] ?? ''}</Text>
            </Text>
          )
        })}
      </Box>
    )
  })
}
