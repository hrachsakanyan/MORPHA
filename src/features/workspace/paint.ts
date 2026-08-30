import { OPACITY_BUDGET } from '@/domain/constants'
import type { LayerConfig } from '@/domain/types'

/**
 * Rendering constants for evidence geometry.
 *
 * Prominence is not decorative: pathologist-authored geometry carries the
 * heaviest stroke and the only vertex handles in the system, because what the
 * human drew outranks what the machine proposed — visually as well as structurally.
 */
export const INK = {
  inferred: '#a46fc4',
  measured: '#4cc9b0',
  dismissed: '#6b6270',
  advisory: '#f2c14e',
  tissue: '#c86fa8',
  plate: 'rgba(14, 11, 16, 0.8)',
  text: '#ebe3ee',
}

export const STROKE = {
  candidate: 1.5,
  focused: 2,
  finding: 1.5,
  rejected: 1,
  authored: 2,
  qc: 1,
}

/** Layers that paint a fill, with the alpha they would contribute. */
const FILL_ALPHAS: Partial<Record<keyof LayerConfig, number>> = {
  tissueMask: 0.05,
  coverage: 0.07,
  qc: 0.08,
  clusters: 0.06,
  findings: 0.05,
  marked: 0.05,
}

/**
 * Rule 3 — the morphology opacity budget. Cumulative overlay alpha over any
 * tissue pixel may not exceed 20%. When the active combination would exceed it,
 * fills drop out and layers degrade to stroke-only. A rendering constraint, not
 * a guideline.
 */
export function fillBudget(layers: LayerConfig): { fills: boolean; total: number } {
  let total = 0
  for (const [k, a] of Object.entries(FILL_ALPHAS)) {
    if (layers[k as keyof LayerConfig]) total += a ?? 0
  }
  return { fills: total <= OPACITY_BUDGET, total }
}

let hatchAmber: CanvasPattern | null = null
let hatchTeal: CanvasPattern | null = null
let hatchDark: CanvasPattern | null = null

function makeHatch(colour: string, alpha: number, background?: string): CanvasPattern {
  const size = 8
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const g = c.getContext('2d')!
  if (background) {
    g.fillStyle = background
    g.fillRect(0, 0, size, size)
  }
  g.strokeStyle = colour
  g.globalAlpha = alpha
  g.lineWidth = 1
  g.beginPath()
  g.moveTo(-2, size + 2)
  g.lineTo(size + 2, -2)
  g.moveTo(-2, 2)
  g.lineTo(2, -2)
  g.moveTo(size - 2, size + 2)
  g.lineTo(size + 2, size - 2)
  g.stroke()
  return g.createPattern(c, 'repeat')!
}

/** Hatch density is constant in screen space, so it reads identically at every magnification. */
export function amberHatch(): CanvasPattern {
  if (!hatchAmber) hatchAmber = makeHatch(INK.advisory, 0.7)
  return hatchAmber
}
export function tealHatch(): CanvasPattern {
  if (!hatchTeal) hatchTeal = makeHatch(INK.measured, 0.7)
  return hatchTeal
}
/** Tile failure. Never white — white is indistinguishable from background glass. */
export function darkHatch(): CanvasPattern {
  if (!hatchDark) hatchDark = makeHatch('#4a4152', 0.9, '#171220')
  return hatchDark
}

export function setDash(ctx: CanvasRenderingContext2D, kind: 'solid' | 'dashed' | 'dotted') {
  if (kind === 'dashed') ctx.setLineDash([5, 4])
  else if (kind === 'dotted') ctx.setLineDash([1.5, 3])
  else ctx.setLineDash([])
}

/** Screen-space label on a hairline plate — legible over pink tissue without occluding it. */
export function label(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number,
  colour = INK.measured, align: CanvasTextAlign = 'left',
) {
  ctx.save()
  ctx.font = '500 11px "IBM Plex Mono", ui-monospace, monospace'
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  const w = ctx.measureText(text).width
  const px = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x
  ctx.fillStyle = INK.plate
  ctx.fillRect(px - 4, y - 8, w + 8, 16)
  ctx.strokeStyle = 'rgba(42, 34, 48, 1)'
  ctx.lineWidth = 1
  ctx.setLineDash([])
  ctx.strokeRect(px - 4.5, y - 8.5, w + 9, 17)
  ctx.fillStyle = colour
  ctx.fillText(text, px, y)
  ctx.restore()
}

export function glyph(
  ctx: CanvasRenderingContext2D, mark: string, x: number, y: number, colour: string, size = 11,
) {
  ctx.save()
  ctx.font = `${size}px "Inter", system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = colour
  ctx.fillText(mark, x, y)
  ctx.restore()
}

export function vertexHandles(ctx: CanvasRenderingContext2D, pts: Array<{ x: number; y: number }>) {
  ctx.save()
  ctx.setLineDash([])
  for (const p of pts) {
    ctx.fillStyle = '#0e0b10'
    ctx.strokeStyle = INK.measured
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.rect(p.x - 3, p.y - 3, 6, 6)
    ctx.fill()
    ctx.stroke()
  }
  ctx.restore()
}
