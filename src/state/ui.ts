import { create } from 'zustand'
import type { Pt, Rect } from '@/domain/types'

/**
 * Transient workspace state. None of this is restored by Resume — hold-to-clear,
 * hover focus, in-progress drags and transient errors are explicitly excluded
 * from the restored set (§B.3).
 */

export type FlyTarget =
  | { kind: 'point'; x: number; y: number; mag: number }
  | { kind: 'rect'; rect: Rect }

export interface FlyCommand {
  token: number
  slideId: string
  target: FlyTarget
  animate: boolean
  /** Object to give focus styling on arrival. */
  focusCandidateId?: string
  focusFindingId?: string
  focusAnnotationId?: string
}

/** The verification control is either three buttons or, during reclassify, a chip strip. */
export type ChipStrip =
  | null
  | { kind: 'reclassify' }
  | { kind: 'point-type'; at: Pt }
  | { kind: 'polygon-type'; points: Pt[] }
  | { kind: 'dismiss-cluster'; clusterId: string }

export interface Draft {
  tool: 'polygon' | 'frame' | 'distance' | 'area' | 'text'
  points: Pt[]
  cursor: Pt | null
}

/**
 * Authored geometry being dragged — a counting frame edge (§I.4) or a polygon
 * vertex. The points live here, not in the session, so anything derived from
 * them can update on every pointer move without writing a hundred states to
 * storage or burying the geometry undo stack. Committed once, on pointer up.
 */
export interface GeometryDrag {
  annotationId: string
  points: Pt[]
}

interface UiState {
  railCollapsed: boolean
  panelCollapsed: boolean
  stripCollapsed: boolean
  setRailCollapsed: (v: boolean) => void
  setPanelCollapsed: (v: boolean) => void
  setStripCollapsed: (v: boolean) => void

  focusedCandidateId: string | null
  expandedClusterId: string | null
  activeClusterId: string | null
  setFocusedCandidate: (id: string | null) => void
  setExpandedCluster: (id: string | null) => void
  setActiveCluster: (id: string | null) => void

  chipStrip: ChipStrip
  setChipStrip: (c: ChipStrip) => void

  draft: Draft | null
  setDraft: (d: Draft | null) => void

  geometryDrag: GeometryDrag | null
  setGeometryDrag: (d: GeometryDrag | null) => void

  holdClear: boolean
  setHoldClear: (v: boolean) => void

  selectedFrameId: string | null
  setSelectedFrame: (id: string | null) => void

  focusedFindingIds: string[]
  setFocusedFindings: (ids: string[]) => void

  recordHighlightId: string | null
  setRecordHighlight: (id: string | null) => void

  fly: FlyCommand | null
  flyTo: (cmd: Omit<FlyCommand, 'token'>) => void

  /** Polite live-region text — the keyboard path must be legible to a screen reader. */
  announcement: string
  announce: (text: string) => void

  detailPopoverCandidateId: string | null
  setDetailPopover: (id: string | null) => void

  openItemsOpen: boolean
  setOpenItemsOpen: (v: boolean) => void

  resetWorkspaceUi: () => void
}

let flyToken = 0

export const useUi = create<UiState>((set) => ({
  railCollapsed: false,
  panelCollapsed: false,
  stripCollapsed: false,
  setRailCollapsed: (v) => set({ railCollapsed: v }),
  setPanelCollapsed: (v) => set({ panelCollapsed: v }),
  setStripCollapsed: (v) => set({ stripCollapsed: v }),

  focusedCandidateId: null,
  expandedClusterId: null,
  activeClusterId: null,
  setFocusedCandidate: (id) => set({ focusedCandidateId: id }),
  setExpandedCluster: (id) => set({ expandedClusterId: id }),
  setActiveCluster: (id) => set({ activeClusterId: id }),

  chipStrip: null,
  setChipStrip: (c) => set({ chipStrip: c }),

  draft: null,
  setDraft: (d) => set({ draft: d }),

  geometryDrag: null,
  setGeometryDrag: (d) => set({ geometryDrag: d }),

  holdClear: false,
  setHoldClear: (v) => set({ holdClear: v }),

  selectedFrameId: null,
  setSelectedFrame: (id) => set({ selectedFrameId: id }),

  focusedFindingIds: [],
  setFocusedFindings: (ids) => set({ focusedFindingIds: ids }),

  recordHighlightId: null,
  setRecordHighlight: (id) => set({ recordHighlightId: id }),

  fly: null,
  flyTo: (cmd) => set({ fly: { ...cmd, token: ++flyToken } }),

  announcement: '',
  announce: (text) => set({ announcement: text }),

  detailPopoverCandidateId: null,
  setDetailPopover: (id) => set({ detailPopoverCandidateId: id }),

  openItemsOpen: false,
  setOpenItemsOpen: (v) => set({ openItemsOpen: v }),

  resetWorkspaceUi: () =>
    set({
      focusedCandidateId: null,
      expandedClusterId: null,
      activeClusterId: null,
      chipStrip: null,
      draft: null,
      geometryDrag: null,
      holdClear: false,
      selectedFrameId: null,
      focusedFindingIds: [],
      detailPopoverCandidateId: null,
      openItemsOpen: false,
      fly: null,
    }),
}))
