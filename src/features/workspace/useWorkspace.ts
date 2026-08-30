import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { findCase } from '@/domain/cases'
import { modelOutput, qcStateOf, type SlideModelOutput } from '@/domain/synth'
import { coverageStats, type CoverageStats } from '@/domain/coverage'
import { findingsForSlide, latestVerdicts, ledgerFor, type Ledger } from '@/domain/derive'
import { polygonArea } from '@/lib/geometry'
import { useTissue, type TissueStatus } from '@/hooks/useTissue'
import { useSessions } from '@/state/store'
import { useUi } from '@/state/ui'
import * as registry from '@/state/coverageRegistry'
import type {
  Annotation, CaseDef, CaseSession, Cluster, Finding, QcRegion, QcState,
  SlideDef, SlideSessionState,
} from '@/domain/types'

export interface ClusterView extends Cluster {
  reviewed: number
  confirmed: number
  rejected: number
  reclassified: number
  bandCounts: { high: number; moderate: number; low: number }
  complete: boolean
}

export interface Workspace {
  def: CaseDef | undefined
  session: CaseSession | undefined
  slide: SlideDef | undefined
  slideSession: SlideSessionState | undefined
  tissue: TissueStatus
  model: SlideModelOutput
  qcRegions: QcRegion[]
  qcState: QcState
  unassessableFraction: number
  coverage: CoverageStats
  grid: Uint8Array | null
  findings: Finding[]
  ledger: Ledger
  clusters: ClusterView[]
  annotations: Annotation[]
  frames: Annotation[]
  /** MPP is present and plausible — every measurement affordance depends on this. */
  measurementEnabled: boolean
  readOnly: boolean
  refreshCoverage: () => void
}

const EMPTY_COVERAGE: CoverageStats = {
  orientation: 0, diagnostic: 0, unassessable: 0, effectiveCells: 1,
}

export function useWorkspace(caseId: string | undefined): Workspace {
  const def = findCase(caseId)
  const session = useSessions((s) => (caseId ? s.sessions[caseId] : undefined))
  const flushCoverage = useSessions((s) => s.flushCoverage)

  const slide = useMemo(
    () => def?.slides.find((s) => s.id === session?.activeSlideId) ?? def?.slides[0],
    [def, session?.activeSlideId],
  )
  const slideSession = slide && session ? session.perSlide[slide.id] : undefined
  const tissue = useTissue(slide)

  // Coverage grids live outside React; this subscribes to their mutation counter.
  const coverageVersion = useSyncExternalStore(registry.subscribe, registry.getVersion)

  const model = useMemo(
    () => (slide ? modelOutput(slide, tissue.state === 'ready' ? tissue.data : null) : {
      candidates: [], clusters: [], qcRegions: [], byId: new Map(), unassessableFraction: 0,
    } as SlideModelOutput),
    [slide, tissue],
  )

  const dismissedQcIds = slideSession?.dismissedQcIds ?? []
  const qcRegions = useMemo(
    () => model.qcRegions.filter((r) => !dismissedQcIds.includes(r.id)),
    [model.qcRegions, dismissedQcIds.join('|')], // eslint-disable-line react-hooks/exhaustive-deps
  )

  /**
   * A counting frame mid-resize reads from the transient drag rather than the
   * session (§I.4). Every consumer — the microscope overlay, the slide map and
   * the density fraction — draws from this one list, so the denominator and the
   * geometry cannot disagree while the pointer is down.
   */
  const frameDrag = useUi((s) => s.frameDrag)

  const annotations = useMemo(() => {
    if (!session || !slide) return []
    const own = session.annotations.filter((a) => a.slideId === slide.id)
    if (!frameDrag) return own
    return own.map(
      (a) => (a.id === frameDrag.annotationId ? { ...a, points: frameDrag.points } : a),
    )
  }, [session, slide, frameDrag])

  /**
   * The denominator loses automated QC that is still standing, plus any area the
   * pathologist marked unassessable by hand. A dismissed QC region rejoins it.
   */
  const unassessableFraction = useMemo(() => {
    if (tissue.state !== 'ready') return 0
    const tissueArea = tissue.data.tissueCells * tissue.data.cellW * tissue.data.cellH
    if (tissueArea <= 0) return 0
    let area = qcRegions.reduce((s, r) => s + r.areaPx, 0)
    for (const a of annotations) {
      if (a.kind === 'unassessable') area += polygonArea(a.points)
    }
    return Math.min(0.95, area / tissueArea)
  }, [tissue, qcRegions, annotations])

  const grid = useMemo(() => {
    if (tissue.state !== 'ready' || !slideSession || !caseId || !slide) return null
    return registry.hydrateGrid(caseId, slide.id, slideSession, tissue.data).grid
    // coverageVersion is a deliberate dependency: the grid is mutated in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tissue, slideSession, caseId, slide, coverageVersion])

  const coverage = useMemo(() => {
    if (!grid || tissue.state !== 'ready') return EMPTY_COVERAGE
    return coverageStats(grid, tissue.data, unassessableFraction)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, tissue, unassessableFraction, coverageVersion])

  const findings = useMemo(
    () => (session && slide ? findingsForSlide(slide.id, model, session.verdicts, session.annotations) : []),
    [session, slide, model],
  )

  const ledger = useMemo(
    () => (session && slide
      ? ledgerFor(model, session.verdicts, slide.id)
      : { proposed: 0, confirmed: 0, rejected: 0, reclassified: 0, unreviewed: 0 }),
    [session, slide, model],
  )

  const clusters = useMemo<ClusterView[]>(() => {
    if (!session || !slide) return []
    const heads = latestVerdicts(session.verdicts.filter((v) => v.slideId === slide.id))
    return model.clusters.map((c) => {
      let confirmed = 0, rejected = 0, reclassified = 0
      const bandCounts = { high: 0, moderate: 0, low: 0 }
      for (const id of c.candidateIds) {
        const cand = model.byId.get(id)
        if (cand) bandCounts[cand.band]++
        const v = heads.get(id)
        if (!v) continue
        if (v.kind === 'confirmed') confirmed++
        else if (v.kind === 'rejected') rejected++
        else reclassified++
      }
      const reviewed = confirmed + rejected + reclassified
      return {
        ...c, reviewed, confirmed, rejected, reclassified, bandCounts,
        complete: reviewed === c.candidateIds.length && c.candidateIds.length > 0,
      }
    })
  }, [session, slide, model])

  const frames = useMemo(() => annotations.filter((a) => a.kind === 'frame'), [annotations])

  const qcState = useMemo(
    () => qcStateOf({ ...model, unassessableFraction }, dismissedQcIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, unassessableFraction, dismissedQcIds.join('|')],
  )

  // Persist the trace on a debounce; the grid itself is written on every settle.
  const flushTimer = useRef<number | null>(null)
  const refreshCoverage = useCallback(() => {
    registry.bump()
    if (!caseId || !slide || tissue.state !== 'ready' || !grid) return
    if (flushTimer.current) window.clearTimeout(flushTimer.current)
    flushTimer.current = window.setTimeout(() => {
      const stats = coverageStats(grid, tissue.data, unassessableFraction)
      flushCoverage(caseId, slide.id, {
        orientation: stats.orientation,
        diagnostic: stats.diagnostic,
        unassessable: stats.unassessable,
      })
    }, 600)
  }, [caseId, slide, tissue, grid, unassessableFraction, flushCoverage])

  // Write the seeded read through on first materialisation, so a Resume that is
  // never panned still reports the coverage it restored.
  useEffect(() => {
    if (!caseId || !slide || tissue.state !== 'ready' || !grid) return
    if (slideSession?.coverage) return
    const stats = coverageStats(grid, tissue.data, unassessableFraction)
    flushCoverage(caseId, slide.id, {
      orientation: stats.orientation,
      diagnostic: stats.diagnostic,
      unassessable: stats.unassessable,
    })
  }, [caseId, slide, tissue, grid, slideSession?.coverage, unassessableFraction, flushCoverage])

  useEffect(() => () => {
    if (flushTimer.current) window.clearTimeout(flushTimer.current)
  }, [])

  const measurementEnabled = Boolean(
    slide?.mpp && Number.isFinite(slide.mpp) && slide.mpp > 0 && slide.mpp < 10,
  )

  return {
    def, session, slide, slideSession, tissue, model, qcRegions, qcState,
    unassessableFraction, coverage, grid, findings, ledger, clusters, annotations,
    frames, measurementEnabled,
    readOnly: session?.status === 'finalized',
    refreshCoverage,
  }
}
