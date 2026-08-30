import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { CURRENT_USER } from '@/domain/constants'
import { uid } from '@/lib/id'
import * as registry from './coverageRegistry'
import type {
  Annotation, CaseDef, CaseSession, CaseStatus, DismissReason, FindingType,
  LayerConfig, PanelContext, Pt, SlideSessionState, SpatialState, ToolId, ToolState,
  Verdict, VerdictKind, Viewport,
} from '@/domain/types'

export const DEFAULT_LAYERS: LayerConfig = {
  tissueMask: true,
  qc: true,
  coverage: true,
  findings: true,
  marked: true,
  // Read-First: the model's proposals are suppressed until the reader reveals them.
  clusters: false,
  candidates: false,
  rejected: true,
  frames: true,
  measurements: true,
}

function newSlideSession(seed?: { orientation: number; diagnostic: number }): SlideSessionState {
  return {
    viewport: null,
    spatial: 'orientation',
    revealed: false,
    coverage: null,
    pendingSeed: seed ?? null,
    stats: seed ? { orientation: seed.orientation, diagnostic: seed.diagnostic, unassessable: 0 } : null,
    lastCandidateId: null,
    dismissedQcIds: [],
    returnMarker: null,
  }
}

function newSession(def: CaseDef): CaseSession {
  const perSlide: Record<string, SlideSessionState> = {}
  for (const s of def.slides) {
    const seeded = def.seededSession?.coverage[s.id]
    perSlide[s.id] = newSlideSession(seeded)
    if (def.seededSession?.revealed[s.id]) perSlide[s.id].revealed = true
  }
  const now = new Date().toISOString()
  return {
    caseId: def.id,
    // `New` becomes `In Review` on first open; every other state is already real.
    status: def.status === 'new' ? 'in_review' : def.status,
    pauseReason: def.pauseReason,
    createdAt: now,
    updatedAt: now,
    by: CURRENT_USER,
    activeSlideId: def.seededSession?.activeSlideId ?? def.slides[0]?.id ?? '',
    perSlide,
    verdicts: [],
    annotations: [],
    layers: { ...DEFAULT_LAYERS },
    panel: 'candidates',
    tool: 'navigate',
    activeToolId: null,
    openItemsAcknowledged: false,
    unsynced: 0,
  }
}

interface SessionState {
  sessions: Record<string, CaseSession>
  hydrated: boolean

  openCase: (def: CaseDef) => void
  hasSession: (caseId: string) => boolean
  session: (caseId: string) => CaseSession | undefined

  setActiveSlide: (caseId: string, slideId: string) => void
  patchSlide: (caseId: string, slideId: string, patch: Partial<SlideSessionState>) => void
  setViewport: (caseId: string, slideId: string, viewport: Viewport) => void
  setSpatial: (caseId: string, slideId: string, spatial: SpatialState) => void
  setPanel: (caseId: string, panel: PanelContext) => void
  setTool: (caseId: string, tool: ToolState, toolId?: ToolId | null) => void
  toggleLayer: (caseId: string, key: keyof LayerConfig) => void
  forceLayers: (caseId: string, patch: Partial<LayerConfig>) => void
  reveal: (caseId: string, slideId: string) => void

  recordVerdict: (
    caseId: string, slideId: string, candidateId: string,
    kind: VerdictKind, reclassifiedTo?: FindingType,
  ) => void
  dismissCluster: (
    caseId: string, slideId: string, candidateIds: string[], reason: DismissReason,
  ) => void
  undoVerdict: (caseId: string) => Verdict | null

  addAnnotation: (caseId: string, a: Omit<Annotation, 'id' | 'createdAt' | 'by'>) => Annotation
  removeAnnotation: (caseId: string, id: string) => void
  reshapeAnnotation: (caseId: string, id: string, points: Pt[]) => void
  undoAnnotation: (caseId: string) => Annotation | null
  relabelAnnotation: (caseId: string, id: string, label: string) => void

  dismissQcRegion: (caseId: string, slideId: string, qcId: string) => void
  restoreQcRegion: (caseId: string, slideId: string, qcId: string) => void

  setStatus: (caseId: string, status: CaseStatus, reason?: string) => void
  acknowledgeOpenItems: (caseId: string) => void

  flushCoverage: (
    caseId: string, slideId: string,
    stats: { orientation: number; diagnostic: number; unassessable: number },
  ) => void
  markSynced: (caseId: string) => void
  resetCase: (caseId: string) => void
  resetAll: () => void
}

function touch(s: CaseSession): CaseSession {
  s.updatedAt = new Date().toISOString()
  return s
}

/** Mutate one session immutably at the top level; the session object is replaced. */
function withSession(
  state: SessionState, caseId: string, fn: (s: CaseSession) => void,
): Partial<SessionState> | null {
  const current = state.sessions[caseId]
  if (!current) return null
  const next: CaseSession = {
    ...current,
    perSlide: { ...current.perSlide },
    layers: { ...current.layers },
    verdicts: [...current.verdicts],
    annotations: [...current.annotations],
  }
  fn(next)
  touch(next)
  return { sessions: { ...state.sessions, [caseId]: next } }
}

export const useSessions = create<SessionState>()(
  persist(
    (set, get) => ({
      sessions: {},
      hydrated: false,

      openCase: (def) => {
        if (get().sessions[def.id]) return
        set((state) => ({ sessions: { ...state.sessions, [def.id]: newSession(def) } }))
      },

      hasSession: (caseId) => Boolean(get().sessions[caseId]),
      session: (caseId) => get().sessions[caseId],

      setActiveSlide: (caseId, slideId) =>
        set((s) => withSession(s, caseId, (x) => { x.activeSlideId = slideId }) ?? {}),

      patchSlide: (caseId, slideId, patch) =>
        set((s) => withSession(s, caseId, (x) => {
          const prev = x.perSlide[slideId] ?? newSlideSession()
          x.perSlide[slideId] = { ...prev, ...patch }
        }) ?? {}),

      setViewport: (caseId, slideId, viewport) =>
        set((s) => withSession(s, caseId, (x) => {
          const prev = x.perSlide[slideId] ?? newSlideSession()
          x.perSlide[slideId] = { ...prev, viewport }
        }) ?? {}),

      setSpatial: (caseId, slideId, spatial) =>
        set((s) => withSession(s, caseId, (x) => {
          const prev = x.perSlide[slideId] ?? newSlideSession()
          x.perSlide[slideId] = { ...prev, spatial }
        }) ?? {}),

      setPanel: (caseId, panel) =>
        set((s) => withSession(s, caseId, (x) => { x.panel = panel }) ?? {}),

      setTool: (caseId, tool, toolId) =>
        set((s) => withSession(s, caseId, (x) => {
          x.tool = tool
          x.activeToolId = toolId === undefined ? x.activeToolId : toolId
        }) ?? {}),

      toggleLayer: (caseId, key) =>
        set((s) => withSession(s, caseId, (x) => { x.layers[key] = !x.layers[key] }) ?? {}),

      forceLayers: (caseId, patch) =>
        set((s) => withSession(s, caseId, (x) => { x.layers = { ...x.layers, ...patch } }) ?? {}),

      reveal: (caseId, slideId) =>
        set((s) => withSession(s, caseId, (x) => {
          const prev = x.perSlide[slideId] ?? newSlideSession()
          x.perSlide[slideId] = { ...prev, revealed: true }
          x.layers = { ...x.layers, clusters: true, candidates: true }
        }) ?? {}),

      recordVerdict: (caseId, slideId, candidateId, kind, reclassifiedTo) =>
        set((s) => withSession(s, caseId, (x) => {
          x.verdicts.push({
            id: uid('v'), candidateId, slideId, kind,
            at: new Date().toISOString(), by: CURRENT_USER, reclassifiedTo,
          })
          x.unsynced += 1
        }) ?? {}),

      dismissCluster: (caseId, slideId, candidateIds, reason) =>
        set((s) => withSession(s, caseId, (x) => {
          const at = new Date().toISOString()
          for (const candidateId of candidateIds) {
            x.verdicts.push({
              id: uid('v'), candidateId, slideId, kind: 'rejected',
              at, by: CURRENT_USER, bulkReason: reason,
            })
          }
          x.unsynced += candidateIds.length
        }) ?? {}),

      undoVerdict: (caseId) => {
        const session = get().sessions[caseId]
        const last = session?.verdicts[session.verdicts.length - 1] ?? null
        if (!last) return null
        set((s) => withSession(s, caseId, (x) => { x.verdicts.pop() }) ?? {})
        return last
      },

      addAnnotation: (caseId, a) => {
        const annotation: Annotation = {
          ...a, id: uid('ANN'), createdAt: new Date().toISOString(), by: CURRENT_USER,
        }
        set((s) => withSession(s, caseId, (x) => {
          x.annotations.push(annotation)
          x.unsynced += 1
        }) ?? {})
        return annotation
      },

      removeAnnotation: (caseId, id) =>
        set((s) => withSession(s, caseId, (x) => {
          x.annotations = x.annotations.filter((n) => n.id !== id)
        }) ?? {}),

      undoAnnotation: (caseId) => {
        const session = get().sessions[caseId]
        const last = session?.annotations[session.annotations.length - 1] ?? null
        if (!last) return null
        set((s) => withSession(s, caseId, (x) => { x.annotations.pop() }) ?? {})
        return last
      },

      /**
       * Commit a resized counting frame (§I.4). Called once on pointer up —
       * the live geometry during a drag is transient UI state, so a resize
       * costs one write, not one per pointer move.
       */
      reshapeAnnotation: (caseId, id, points) =>
        set((s) => withSession(s, caseId, (x) => {
          x.annotations = x.annotations.map((n) => (n.id === id ? { ...n, points } : n))
        }) ?? {}),

      relabelAnnotation: (caseId, id, label) =>
        set((s) => withSession(s, caseId, (x) => {
          x.annotations = x.annotations.map((n) => (n.id === id ? { ...n, label } : n))
        }) ?? {}),

      dismissQcRegion: (caseId, slideId, qcId) =>
        set((s) => withSession(s, caseId, (x) => {
          const prev = x.perSlide[slideId] ?? newSlideSession()
          x.perSlide[slideId] = {
            ...prev, dismissedQcIds: [...new Set([...prev.dismissedQcIds, qcId])],
          }
        }) ?? {}),

      restoreQcRegion: (caseId, slideId, qcId) =>
        set((s) => withSession(s, caseId, (x) => {
          const prev = x.perSlide[slideId] ?? newSlideSession()
          x.perSlide[slideId] = {
            ...prev, dismissedQcIds: prev.dismissedQcIds.filter((i) => i !== qcId),
          }
        }) ?? {}),

      setStatus: (caseId, status, reason) =>
        set((s) => withSession(s, caseId, (x) => {
          x.status = status
          x.pauseReason = status === 'paused' ? reason : undefined
        }) ?? {}),

      acknowledgeOpenItems: (caseId) =>
        set((s) => withSession(s, caseId, (x) => { x.openItemsAcknowledged = true }) ?? {}),

      flushCoverage: (caseId, slideId, stats) => {
        const encoded = registry.encode(caseId, slideId)
        if (encoded === null) return
        set((s) => withSession(s, caseId, (x) => {
          const prev = x.perSlide[slideId] ?? newSlideSession()
          if (prev.coverage === encoded && prev.stats?.diagnostic === stats.diagnostic) return
          x.perSlide[slideId] = { ...prev, coverage: encoded, pendingSeed: null, stats }
        }) ?? {})
      },

      markSynced: (caseId) =>
        set((s) => withSession(s, caseId, (x) => { x.unsynced = 0 }) ?? {}),

      resetCase: (caseId) => {
        registry.clearCase(caseId)
        set((s) => {
          const next = { ...s.sessions }
          delete next[caseId]
          return { sessions: next }
        })
      },

      resetAll: () => {
        registry.clearAll()
        set({ sessions: {} })
      },
    }),
    {
      name: 'morpha.sessions.v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ sessions: s.sessions }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true
      },
    },
  ),
)

/** Marks the store hydrated even when localStorage held nothing at all. */
export function markHydrated() {
  if (!useSessions.getState().hydrated) useSessions.setState({ hydrated: true })
}
