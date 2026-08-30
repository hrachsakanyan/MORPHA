import { decodeGrid, encodeGrid, seedGrid } from '@/domain/coverage'
import type { TissueData } from '@/domain/tissue'
import type { SlideSessionState } from '@/domain/types'

/**
 * Live coverage grids.
 *
 * The trace is touched on every viewport settle, so it lives in a plain registry
 * of typed arrays rather than in the reactive store — re-encoding 21k cells to
 * base64 on every pan would be absurd. The store holds the encoded snapshot and
 * is written on a debounce and on teardown.
 */

const grids = new Map<string, Uint8Array>()
let version = 0
const listeners = new Set<() => void>()

function key(caseId: string, slideId: string) {
  return caseId + '::' + slideId
}

export function getGrid(caseId: string, slideId: string): Uint8Array | null {
  return grids.get(key(caseId, slideId)) ?? null
}

/**
 * Materialise the grid for a slide: restore the persisted trace, or lay down the
 * seeded read if this session has one waiting.
 */
export function hydrateGrid(
  caseId: string, slideId: string, slideSession: SlideSessionState, tissue: TissueData,
): { grid: Uint8Array; seeded: boolean } {
  const k = key(caseId, slideId)
  const existing = grids.get(k)
  if (existing && existing.length === tissue.gridW * tissue.gridH) {
    return { grid: existing, seeded: false }
  }
  if (slideSession.coverage) {
    const grid = decodeGrid(slideSession.coverage, tissue)
    grids.set(k, grid)
    return { grid, seeded: false }
  }
  if (slideSession.pendingSeed) {
    const grid = seedGrid(
      tissue, slideSession.pendingSeed.orientation, slideSession.pendingSeed.diagnostic,
    )
    grids.set(k, grid)
    return { grid, seeded: true }
  }
  const grid = new Uint8Array(tissue.gridW * tissue.gridH)
  grids.set(k, grid)
  return { grid, seeded: true }
}

export function encode(caseId: string, slideId: string): string | null {
  const g = grids.get(key(caseId, slideId))
  return g ? encodeGrid(g) : null
}

export function bump(): void {
  version++
  for (const l of listeners) l()
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function getVersion(): number {
  return version
}

export function clearCase(caseId: string): void {
  for (const k of [...grids.keys()]) {
    if (k.startsWith(caseId + '::')) grids.delete(k)
  }
  bump()
}

export function clearAll(): void {
  grids.clear()
  bump()
}
