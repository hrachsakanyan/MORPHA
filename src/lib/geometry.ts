import type { Pt, Rect } from '@/domain/types'

export function boundsOf(points: Pt[]): Rect {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function rectFromCorners(a: Pt, b: Pt): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  }
}

export function rectContains(r: Rect, p: Pt): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y)
}

export function intersectionArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

/** Shoelace. Points in image pixels; result in px². */
export function polygonArea(points: Pt[]): number {
  let s = 0
  for (let i = 0, n = points.length; i < n; i++) {
    const a = points[i], b = points[(i + 1) % n]
    s += a.x * b.y - b.x * a.y
  }
  return Math.abs(s) / 2
}

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

export function polygonCentroid(poly: Pt[]): Pt {
  let cx = 0, cy = 0, a = 0
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n]
    const f = p.x * q.y - q.x * p.y
    a += f
    cx += (p.x + q.x) * f
    cy += (p.y + q.y) * f
  }
  a *= 0.5
  if (a === 0) return poly[0] ?? { x: 0, y: 0 }
  return { x: cx / (6 * a), y: cy / (6 * a) }
}

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

export function rectPolygon(r: Rect): Pt[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ]
}

/**
 * Area of the overlap between a rectangle and a polygon, by supersampling.
 * Exact clipping is not worth the complexity for a QC subtraction that is
 * itself an approximation of a hand-drawn boundary.
 */
export function rectPolygonOverlapArea(r: Rect, poly: Pt[], samples = 96): number {
  const bounds = boundsOf(poly)
  if (!rectsIntersect(r, bounds)) return 0
  const x0 = Math.max(r.x, bounds.x)
  const y0 = Math.max(r.y, bounds.y)
  const x1 = Math.min(r.x + r.w, bounds.x + bounds.w)
  const y1 = Math.min(r.y + r.h, bounds.y + bounds.h)
  if (x1 <= x0 || y1 <= y0) return 0
  const dx = (x1 - x0) / samples
  const dy = (y1 - y0) / samples
  let hits = 0
  for (let i = 0; i < samples; i++) {
    for (let j = 0; j < samples; j++) {
      if (pointInPolygon({ x: x0 + (i + 0.5) * dx, y: y0 + (j + 0.5) * dy }, poly)) hits++
    }
  }
  return (hits / (samples * samples)) * (x1 - x0) * (y1 - y0)
}

/* ── Counting-frame handles (§I.4) ──────────────────────────────────── */

/** The eight grab points on a counting frame: four edges, four corners. */
export type FrameHandle = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'se' | 'sw'

/**
 * Which handle, if any, sits under `p`. `tol` is in the same units as the rect,
 * so callers working in screen space pass a screen tolerance and the grab zone
 * stays a constant size on the display at every magnification.
 *
 * Corners win over edges: at a corner both edges are within tolerance, and the
 * corner is the more specific intent.
 */
export function frameHandleAt(r: Rect, p: Pt, tol: number): FrameHandle | null {
  const x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h
  if (p.x < x0 - tol || p.x > x1 + tol || p.y < y0 - tol || p.y > y1 + tol) return null

  const l = Math.abs(p.x - x0) <= tol
  const rt = Math.abs(p.x - x1) <= tol
  const t = Math.abs(p.y - y0) <= tol
  const b = Math.abs(p.y - y1) <= tol

  if (t && l) return 'nw'
  if (t && rt) return 'ne'
  if (b && l) return 'sw'
  if (b && rt) return 'se'
  if (t) return 'n'
  if (b) return 's'
  if (l) return 'w'
  if (rt) return 'e'
  return null
}

/**
 * The rect that results from dragging `handle` to `p`. Only the edges named by
 * the handle move; the opposite edges are fixed, so a drag never translates the
 * frame. `min` keeps the frame from collapsing through itself, which would make
 * the denominator meaningless.
 */
export function resizeRect(r: Rect, handle: FrameHandle, p: Pt, min = 1): Rect {
  let x0 = r.x, y0 = r.y
  let x1 = r.x + r.w, y1 = r.y + r.h
  if (handle.includes('w')) x0 = Math.min(p.x, x1 - min)
  if (handle.includes('e')) x1 = Math.max(p.x, x0 + min)
  if (handle.includes('n')) y0 = Math.min(p.y, y1 - min)
  if (handle.includes('s')) y1 = Math.max(p.y, y0 + min)
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/** A rect as the two-corner point pair an Annotation stores. */
export function rectCorners(r: Rect): [Pt, Pt] {
  return [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y + r.h }]
}

/* ── Polygon vertex editing ─────────────────────────────────────────── */

/**
 * Index of the vertex under `p`, or null. `tol` is in the same units as the
 * points, so callers working in screen space get a grab zone that stays a
 * constant size on the display at every magnification.
 *
 * Ties go to the nearest vertex, which matters where a polygon doubles back on
 * itself and two handles sit within a few pixels of each other.
 */
export function vertexAt(points: Pt[], p: Pt, tol: number): number | null {
  let best: { i: number; d: number } | null = null
  for (let i = 0; i < points.length; i++) {
    const d = Math.hypot(points[i].x - p.x, points[i].y - p.y)
    if (d <= tol && (!best || d < best.d)) best = { i, d }
  }
  return best ? best.i : null
}

/**
 * A copy of `points` with one vertex moved. Every other vertex is carried
 * across by identity, so a drag can never perturb a neighbour, and the vertex
 * count — and therefore the polygon's validity — is preserved by construction.
 */
export function movePoint(points: Pt[], index: number, p: Pt): Pt[] {
  if (index < 0 || index >= points.length) return points
  const next = points.slice()
  next[index] = { x: p.x, y: p.y }
  return next
}
