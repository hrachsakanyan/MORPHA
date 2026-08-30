import { latestVerdicts } from '@/domain/derive'
import type { CaseSession, Verdict } from '@/domain/types'
import type { ClusterView } from './useWorkspace'

/**
 * Candidate stepping. Individual candidates are reachable only by stepping —
 * never from a list — because a pathologist working a hotspot is counting, not
 * browsing a catalogue.
 */

export interface StepContext {
  clusters: ClusterView[]
  verdicts: Verdict[]
  slideId: string
  activeClusterId: string | null
  focusedId: string | null
}

function heads(ctx: StepContext) {
  return latestVerdicts(ctx.verdicts.filter((v) => v.slideId === ctx.slideId))
}

export function clusterOf(ctx: StepContext, candidateId: string): ClusterView | undefined {
  return ctx.clusters.find((c) => c.candidateIds.includes(candidateId))
}

function activeCluster(ctx: StepContext): ClusterView | undefined {
  if (ctx.focusedId) {
    const c = clusterOf(ctx, ctx.focusedId)
    if (c) return c
  }
  if (ctx.activeClusterId) {
    const c = ctx.clusters.find((x) => x.id === ctx.activeClusterId)
    if (c) return c
  }
  // Fall back to the first cluster that still has work in it, in clinical order.
  return ctx.clusters.find((c) => c.reviewed < c.candidateIds.length) ?? ctx.clusters[0]
}

/** Next unreviewed candidate in the active cluster; wraps, then spills to the next cluster. */
export function nextUnreviewed(ctx: StepContext): string | null {
  const done = heads(ctx)
  const cluster = activeCluster(ctx)
  if (!cluster) return null

  const startIndex = ctx.focusedId ? cluster.candidateIds.indexOf(ctx.focusedId) : -1
  const ids = cluster.candidateIds
  for (let k = 1; k <= ids.length; k++) {
    const id = ids[(startIndex + k + ids.length) % ids.length]
    if (!done.has(id)) return id
  }

  // This cluster is finished; move to the next one that is not.
  const order = ctx.clusters
  const from = order.findIndex((c) => c.id === cluster.id)
  for (let k = 1; k <= order.length; k++) {
    const c = order[(from + k) % order.length]
    const id = c.candidateIds.find((x) => !done.has(x))
    if (id) return id
  }
  return null
}

/** Previous in sequence, reviewed or not. */
export function previousCandidate(ctx: StepContext): string | null {
  const cluster = activeCluster(ctx)
  if (!cluster || cluster.candidateIds.length === 0) return null
  const i = ctx.focusedId ? cluster.candidateIds.indexOf(ctx.focusedId) : 0
  const n = cluster.candidateIds.length
  return cluster.candidateIds[(i - 1 + n) % n]
}

/** Next in sequence including already-reviewed objects — for re-checking work. */
export function nextIncludingReviewed(ctx: StepContext): string | null {
  const cluster = activeCluster(ctx)
  if (!cluster || cluster.candidateIds.length === 0) return null
  const i = ctx.focusedId ? cluster.candidateIds.indexOf(ctx.focusedId) : -1
  return cluster.candidateIds[(i + 1) % cluster.candidateIds.length]
}

export function nextCluster(ctx: StepContext): ClusterView | null {
  if (ctx.clusters.length === 0) return null
  const current = activeCluster(ctx)
  const i = current ? ctx.clusters.findIndex((c) => c.id === current.id) : -1
  return ctx.clusters[(i + 1) % ctx.clusters.length]
}

export function makeContext(
  session: CaseSession | undefined,
  clusters: ClusterView[],
  slideId: string | undefined,
  activeClusterId: string | null,
  focusedId: string | null,
): StepContext {
  return {
    clusters,
    verdicts: session?.verdicts ?? [],
    slideId: slideId ?? '',
    activeClusterId,
    focusedId,
  }
}
