import { rectFromCorners, rectContains, rectPolygonOverlapArea } from '@/lib/geometry'
import type { Annotation, Finding, QcRegion, Rect } from './types'

/**
 * Mitotic density (§I).
 *
 * The numerator is pathologist-confirmed mitoses. The denominator is a
 * pathologist-drawn counting frame, measured from MPP and reduced by any scan-QC
 * area inside it. Both halves are human. With no frame there is no density —
 * not a zero, not a dash, not a provisional value.
 */

export interface DensityResult {
  frame: Annotation
  rect: Rect
  /** Frame area in mm², before QC subtraction. */
  areaMm2: number
  /** Frame area minus QC-excluded area, in mm². This is the denominator. */
  effectiveAreaMm2: number
  excludedMm2: number
  confirmed: Finding[]
  rejectedInFrameIds: string[]
  /** Mitoses per mm². null when the effective area collapses to nothing. */
  density: number | null
}

export function frameRect(frame: Annotation): Rect {
  return rectFromCorners(frame.points[0], frame.points[1])
}

export function computeDensity(
  frame: Annotation,
  mpp: number,
  findings: Finding[],
  qcRegions: QcRegion[],
  rejectedPoints: Array<{ id: string; x: number; y: number }>,
): DensityResult {
  const rect = frameRect(frame)
  const px2ToMm2 = (mpp * mpp) / 1e6
  const areaMm2 = rect.w * rect.h * px2ToMm2

  let excludedPx = 0
  for (const q of qcRegions) excludedPx += rectPolygonOverlapArea(rect, q.polygon)
  const excludedMm2 = Math.min(areaMm2, excludedPx * px2ToMm2)
  const effectiveAreaMm2 = Math.max(0, areaMm2 - excludedMm2)

  // Only mitotic figures feed a mitotic density. A finding reclassified out of
  // the type leaves the count, and the number drops visibly.
  const confirmed = findings.filter(
    (f) => f.type === 'mitotic_figure' && rectContains(rect, { x: f.x, y: f.y }),
  )
  const rejectedInFrameIds = rejectedPoints
    .filter((p) => rectContains(rect, p))
    .map((p) => p.id)

  return {
    frame,
    rect,
    areaMm2,
    effectiveAreaMm2,
    excludedMm2,
    confirmed,
    rejectedInFrameIds,
    density: effectiveAreaMm2 > 0 ? confirmed.length / effectiveAreaMm2 : null,
  }
}

/** Frame area for the live readout during a drag, before anything is committed. */
export function areaOf(rect: Rect, mpp: number): number {
  return (rect.w * rect.h * mpp * mpp) / 1e6
}

export function distanceUm(px: number, mpp: number): number {
  return px * mpp
}

export function formatDistance(px: number, mpp: number): string {
  const um = distanceUm(px, mpp)
  return um >= 1000 ? `${(um / 1000).toFixed(2)} mm` : `${um.toFixed(1)} µm`
}

export function formatArea(px2: number, mpp: number): string {
  const mm2 = (px2 * mpp * mpp) / 1e6
  if (mm2 >= 0.01) return `${mm2.toFixed(3)} mm²`
  return `${(mm2 * 1e6).toFixed(0)} µm²`
}
