import type { Rect } from './types'
import type { TissueData } from './tissue'
import { DIAGNOSTIC_TIER, ORIENTATION_TIER } from './constants'

/**
 * Coverage trace (§F).
 *
 * Coverage is a union over tissue cells, per slide, per pathologist. It is not a
 * counter: revisiting adds nothing and removes nothing, and dwell duration, view
 * counts and reading speed are deliberately not recorded anywhere.
 *
 * Cell values: 0 unseen · 1 seen at orientation power · 2 seen at diagnostic power.
 */

export const UNSEEN = 0
export const ORIENTATION = 1
export const DIAGNOSTIC = 2

export function emptyGrid(tissue: TissueData): Uint8Array {
  return new Uint8Array(tissue.gridW * tissue.gridH)
}

export function encodeGrid(grid: Uint8Array): string {
  let s = ''
  const chunk = 0x8000
  for (let i = 0; i < grid.length; i += chunk) {
    s += String.fromCharCode.apply(null, Array.from(grid.subarray(i, i + chunk)) as number[])
  }
  return btoa(s)
}

export function decodeGrid(b64: string | null, tissue: TissueData): Uint8Array {
  const size = tissue.gridW * tissue.gridH
  if (!b64) return new Uint8Array(size)
  try {
    const bin = atob(b64)
    if (bin.length !== size) return new Uint8Array(size)
    const out = new Uint8Array(size)
    for (let i = 0; i < size; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    // A corrupt trace is not worth failing a slide load over; it restarts empty.
    return new Uint8Array(size)
  }
}

/** The tier a magnification qualifies for, or null when it is below orientation power. */
export function tierFor(mag: number): 1 | 2 | null {
  if (mag >= DIAGNOSTIC_TIER) return DIAGNOSTIC
  if (mag >= ORIENTATION_TIER) return ORIENTATION
  return null
}

/**
 * Add a viewport footprint to the trace, intersected with the tissue mask.
 * Returns true when anything actually changed, so callers can skip a write.
 */
export function markViewport(
  grid: Uint8Array, tissue: TissueData, view: Rect, mag: number,
): boolean {
  const tier = tierFor(mag)
  if (!tier) return false

  const gx0 = Math.max(0, Math.floor(view.x / tissue.cellW))
  const gy0 = Math.max(0, Math.floor(view.y / tissue.cellH))
  const gx1 = Math.min(tissue.gridW - 1, Math.floor((view.x + view.w) / tissue.cellW))
  const gy1 = Math.min(tissue.gridH - 1, Math.floor((view.y + view.h) / tissue.cellH))

  let changed = false
  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      const i = gy * tissue.gridW + gx
      if (!tissue.mask[i]) continue
      if (grid[i] < tier) {
        grid[i] = tier
        changed = true
      }
    }
  }
  return changed
}

export interface CoverageStats {
  /** Fraction of effective tissue seen at >= orientation power. */
  orientation: number
  /** Fraction of effective tissue seen at >= diagnostic power. */
  diagnostic: number
  /** Fraction of tissue excluded by scan QC — reported separately, never folded in. */
  unassessable: number
  effectiveCells: number
}

export function coverageStats(
  grid: Uint8Array, tissue: TissueData, unassessableFraction: number,
): CoverageStats {
  // Effective tissue area = total tissue area − QC-excluded area (§F.3).
  const effectiveCells = Math.max(1, Math.round(tissue.tissueCells * (1 - unassessableFraction)))
  let seen = 0, diag = 0
  for (let i = 0; i < grid.length; i++) {
    if (!tissue.mask[i]) continue
    if (grid[i] >= ORIENTATION) seen++
    if (grid[i] >= DIAGNOSTIC) diag++
  }
  return {
    orientation: Math.min(1, seen / effectiveCells),
    diagnostic: Math.min(1, diag / effectiveCells),
    unassessable: unassessableFraction,
    effectiveCells,
  }
}

/**
 * Materialise a seeded read so `Resume` has something real to restore.
 * The sweep is row-major, which is how a reader actually works a slide, so the
 * veil lifts in a plausible shape rather than as random speckle.
 */
export function seedGrid(
  tissue: TissueData, orientationTarget: number, diagnosticTarget: number,
): Uint8Array {
  const grid = emptyGrid(tissue)
  const order: number[] = []
  for (let gy = 0; gy < tissue.gridH; gy++) {
    const leftToRight = gy % 2 === 0
    for (let k = 0; k < tissue.gridW; k++) {
      const gx = leftToRight ? k : tissue.gridW - 1 - k
      const i = gy * tissue.gridW + gx
      if (tissue.mask[i]) order.push(i)
    }
  }
  const nOrientation = Math.round(order.length * orientationTarget)
  const nDiagnostic = Math.round(order.length * diagnosticTarget)
  for (let k = 0; k < nOrientation; k++) grid[order[k]] = ORIENTATION
  for (let k = 0; k < nDiagnostic; k++) grid[order[k]] = DIAGNOSTIC
  return grid
}

/**
 * The largest contiguous block of unviewed tissue, in slide coordinates.
 * Backs the one-click `View` on every open item (§F.8).
 */
export function largestUnviewedRegion(
  grid: Uint8Array, tissue: TissueData, tier: 1 | 2 = DIAGNOSTIC,
): Rect | null {
  const { gridW, gridH } = tissue
  const seen = new Uint8Array(gridW * gridH)
  let best: { cells: number; x0: number; y0: number; x1: number; y1: number } | null = null
  const stack: number[] = []

  for (let start = 0; start < grid.length; start++) {
    if (seen[start] || !tissue.mask[start] || grid[start] >= tier) continue
    stack.length = 0
    stack.push(start)
    seen[start] = 1
    let cells = 0
    let x0 = gridW, y0 = gridH, x1 = 0, y1 = 0
    while (stack.length) {
      const i = stack.pop()!
      const gx = i % gridW
      const gy = (i / gridW) | 0
      cells++
      if (gx < x0) x0 = gx
      if (gy < y0) y0 = gy
      if (gx > x1) x1 = gx
      if (gy > y1) y1 = gy
      const neighbours = [
        gx > 0 ? i - 1 : -1,
        gx < gridW - 1 ? i + 1 : -1,
        gy > 0 ? i - gridW : -1,
        gy < gridH - 1 ? i + gridW : -1,
      ]
      for (const n of neighbours) {
        if (n < 0 || seen[n] || !tissue.mask[n] || grid[n] >= tier) continue
        seen[n] = 1
        stack.push(n)
      }
    }
    if (!best || cells > best.cells) best = { cells, x0, y0, x1, y1 }
  }

  if (!best) return null
  return {
    x: best.x0 * tissue.cellW,
    y: best.y0 * tissue.cellH,
    w: (best.x1 - best.x0 + 1) * tissue.cellW,
    h: (best.y1 - best.y0 + 1) * tissue.cellH,
  }
}
