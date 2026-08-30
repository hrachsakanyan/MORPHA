import { useEffect } from 'react'
import {
  MAG_PRESETS, RECLASSIFY_TARGETS, REVIEW_MAG,
} from '@/domain/constants'
import { CANDIDATE_TYPES } from '@/domain/derive'
import { typeLabel } from '@/lib/format'
import { useSessions } from '@/state/store'
import { useUi } from '@/state/ui'
import { useView } from '@/state/view'
import { makeContext, nextCluster, nextIncludingReviewed, nextUnreviewed, previousCandidate } from './review'
import type { Workspace } from './useWorkspace'
import type { FindingType, ToolId, ToolState } from '@/domain/types'

const TOOL_KEYS: Record<string, ToolId> = {
  p: 'point', g: 'polygon', f: 'frame', d: 'distance', a: 'area', t: 'text',
}
const TOOL_MODE: Record<ToolId, ToolState> = {
  point: 'annotate', polygon: 'annotate', text: 'annotate',
  frame: 'frame', distance: 'measure', area: 'measure',
}

/**
 * The keyboard path is primary, not a power-user affordance. A reader
 * dispositioning two hundred objects lives on Space, C and X.
 */
export function useHotkeys(ws: Workspace, caseId: string) {
  useEffect(() => {
    function editable(t: EventTarget | null) {
      const el = t as HTMLElement | null
      return Boolean(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable))
    }

    function onKeyDown(e: KeyboardEvent) {
      if (editable(e.target)) return
      const store = useSessions.getState()
      const ui = useUi.getState()
      const session = store.sessions[caseId]
      const slide = ws.slide
      if (!session || !slide) return

      const drawing = session.tool === 'annotate' || session.tool === 'measure' || session.tool === 'frame'
      const key = e.key
      const lower = key.toLowerCase()

      /* Hold-to-clear. No toggle, no state to remember. */
      if (key === '\\' && !e.repeat) {
        e.preventDefault()
        ui.setHoldClear(true)
        return
      }

      /* A chip strip owns the number keys while it is open. */
      if (ui.chipStrip && /^[1-9]$/.test(key)) {
        e.preventDefault()
        const i = Number(key) - 1
        if (ui.chipStrip.kind === 'reclassify') {
          const to = RECLASSIFY_TARGETS[i]
          if (to && ui.focusedCandidateId) {
            store.recordVerdict(caseId, slide.id, ui.focusedCandidateId, 'reclassified', to)
            ui.setChipStrip(null)
            ui.announce(`Reclassified as ${typeLabel(to)}`)
          }
        } else if (ui.chipStrip.kind === 'point-type') {
          const t = CANDIDATE_TYPES[i]
          if (t) commitPoint(t)
        } else if (ui.chipStrip.kind === 'polygon-type') {
          commitPolygon(i)
        }
        return
      }

      function commitPoint(t: FindingType) {
        const strip = useUi.getState().chipStrip
        if (strip?.kind !== 'point-type' || !slide) return
        store.addAnnotation(caseId, {
          slideId: slide.id, kind: 'point', points: [strip.at],
          label: typeLabel(t), findingType: t, mag: useView.getState().mag,
        })
        ui.setChipStrip(null)
        ui.announce(`${typeLabel(t)} recorded`)
      }

      function commitPolygon(i: number) {
        const strip = useUi.getState().chipStrip
        if (strip?.kind !== 'polygon-type' || !slide) return
        const kinds = ['polygon', 'polygon', 'unassessable'] as const
        const labels = ['Region of interest', 'Tumor region', 'Unassessable']
        const kind = kinds[i]
        if (!kind) return
        const n = ws.annotations.filter((a) => a.kind === kind).length + 1
        store.addAnnotation(caseId, {
          slideId: slide.id, kind, points: strip.points,
          label: `${labels[i]} ${n}`, mag: useView.getState().mag,
        })
        ui.setChipStrip(null)
        ui.announce(`${labels[i]} created`)
      }

      /* Escape unwinds one layer at a time. */
      if (key === 'Escape') {
        e.preventDefault()
        if (ui.chipStrip) { ui.setChipStrip(null); return }
        if (ui.draft) { ui.setDraft(null); return }
        if (drawing) { store.setTool(caseId, 'navigate', null); return }
        if (session.tool === 'review') {
          store.setTool(caseId, 'navigate', null)
          ui.setFocusedCandidate(null)
          return
        }
        if (ws.slideSession?.spatial === 'inspection') {
          // A return marker persists at the departed viewport.
          const v = useView.getState()
          store.patchSlide(caseId, slide.id, {
            spatial: 'orientation',
            returnMarker: { x: v.centreX, y: v.centreY, imageZoom: v.imageZoom },
          })
          ui.setFocusedCandidate(null)
        }
        return
      }

      /* Return marker: drop straight back in. */
      if (key === 'Enter' && ws.slideSession?.spatial === 'orientation' && ws.slideSession.returnMarker) {
        e.preventDefault()
        const m = ws.slideSession.returnMarker
        store.setSpatial(caseId, slide.id, 'inspection')
        ui.flyTo({
          slideId: slide.id,
          target: { kind: 'point', x: m.x, y: m.y, mag: m.imageZoom * 40 },
          animate: true,
        })
        return
      }

      /* Slide switching preserves layers, tool and panel context. */
      if (key === '[' || key === ']') {
        e.preventDefault()
        const slides = ws.def?.slides ?? []
        const i = slides.findIndex((s) => s.id === slide.id)
        const next = slides[(i + (key === ']' ? 1 : -1) + slides.length) % slides.length]
        if (next) {
          store.setActiveSlide(caseId, next.id)
          ui.setFocusedCandidate(null)
          ui.setExpandedCluster(null)
        }
        return
      }

      /* Magnification presets. */
      if (e.altKey && /^[1-5]$/.test(key)) {
        e.preventDefault()
        const mag = MAG_PRESETS[Number(key) - 1]
        const v = useView.getState()
        store.setSpatial(caseId, slide.id, 'inspection')
        ui.flyTo({ slideId: slide.id, target: { kind: 'point', x: v.centreX, y: v.centreY, mag }, animate: true })
        return
      }

      if (key === '+' || key === '=' || key === '-' || key === '_') {
        e.preventDefault()
        const v = useView.getState()
        const factor = key === '-' || key === '_' ? 0.5 : 2
        ui.flyTo({
          slideId: slide.id,
          target: { kind: 'point', x: v.centreX, y: v.centreY, mag: Math.min(40, Math.max(0.3, v.mag * factor)) },
          animate: true,
        })
        return
      }

      /* Undo. Verdicts and geometry have separate stacks, deliberately: a ⌘Z
         that unexpectedly un-confirms a mitotic figure would be a design error. */
      if (lower === 'z' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        const removed = store.undoAnnotation(caseId)
        if (removed) ui.announce(`${removed.label} removed`)
        return
      }
      if (lower === 'z' && !e.metaKey && !e.ctrlKey && !ws.readOnly) {
        e.preventDefault()
        const removed = store.undoVerdict(caseId)
        if (removed) {
          ui.setFocusedCandidate(removed.candidateId)
          ui.announce('Verdict undone')
        }
        return
      }

      /* Cluster jump. */
      if (/^[1-9]$/.test(key) && !e.altKey && !drawing) {
        const c = ws.clusters[Number(key) - 1]
        if (c) {
          e.preventDefault()
          ui.setActiveCluster(c.id)
          ui.setExpandedCluster(c.id)
          store.setPanel(caseId, 'candidates')
          store.setSpatial(caseId, slide.id, 'inspection')
          ui.flyTo({ slideId: slide.id, target: { kind: 'rect', rect: c.bounds }, animate: true })
        }
        return
      }

      if (key === 'Tab' && ws.clusters.length > 0) {
        e.preventDefault()
        const ctx = makeContext(session, ws.clusters, slide.id, ui.activeClusterId, ui.focusedCandidateId)
        const c = nextCluster(ctx)
        if (c) {
          // Moves to the next cluster; does not auto-enter REVIEW.
          ui.setActiveCluster(c.id)
          ui.setExpandedCluster(c.id)
          ui.setFocusedCandidate(null)
          store.setPanel(caseId, 'candidates')
        }
        return
      }

      /* Tools. Sticky, for repeated use. */
      if (TOOL_KEYS[lower] && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        const tool = TOOL_KEYS[lower]
        if (!ws.measurementEnabled && (tool === 'frame' || tool === 'distance' || tool === 'area')) {
          ui.announce('Measurement is disabled: slide scale is unavailable')
          return
        }
        if (session.activeToolId === tool) store.setTool(caseId, 'navigate', null)
        else {
          store.setTool(caseId, TOOL_MODE[tool], tool)
          ui.setFocusedCandidate(null)
        }
        return
      }

      if (ws.readOnly) return

      /* The membrane. REVIEW is suspended while a drawing tool is active, so a
         verdict can never fire mid-draw. */
      if (drawing) return

      if (key === ' ') {
        e.preventDefault()
        const ctx = makeContext(session, ws.clusters, slide.id, ui.activeClusterId, ui.focusedCandidateId)
        const id = e.shiftKey ? previousCandidate(ctx) : nextUnreviewed(ctx)
        focus(id)
        return
      }

      if (key === 'ArrowRight') {
        e.preventDefault()
        const ctx = makeContext(session, ws.clusters, slide.id, ui.activeClusterId, ui.focusedCandidateId)
        focus(nextIncludingReviewed(ctx))
        return
      }

      if (!ui.focusedCandidateId) return

      if (lower === 'c') {
        e.preventDefault()
        store.recordVerdict(caseId, slide.id, ui.focusedCandidateId, 'confirmed')
        ui.setChipStrip(null)
        ui.announce('Confirmed')
        return
      }
      if (lower === 'x') {
        e.preventDefault()
        store.recordVerdict(caseId, slide.id, ui.focusedCandidateId, 'rejected')
        ui.setChipStrip(null)
        ui.announce('Rejected')
        return
      }
      if (lower === 'r') {
        e.preventDefault()
        ui.setChipStrip({ kind: 'reclassify' })
        return
      }

      function focus(id: string | null) {
        if (!id || !slide) return
        const cand = ws.model.byId.get(id)
        if (!cand) return
        ui.setFocusedCandidate(id)
        ui.setActiveCluster(cand.clusterId)
        ui.setExpandedCluster(cand.clusterId)
        store.setTool(caseId, 'review', null)
        store.setSpatial(caseId, slide.id, 'inspection')
        store.patchSlide(caseId, slide.id, { lastCandidateId: id })
        store.setPanel(caseId, 'candidates')
        ui.flyTo({
          slideId: slide.id,
          target: { kind: 'point', x: cand.x, y: cand.y, mag: REVIEW_MAG },
          animate: true,
        })
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key === '\\') useUi.getState().setHoldClear(false)
    }
    function onBlur() {
      useUi.getState().setHoldClear(false)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [ws, caseId])
}
