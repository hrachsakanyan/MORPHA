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
