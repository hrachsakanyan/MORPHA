import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import OpenSeadragon from 'openseadragon'
import {
  BASE_OBJECTIVE, CANDIDATE_MAG_THRESHOLD, REVIEW_MAG, T_RECENTRE_MS,
} from '@/domain/constants'
import { markViewport } from '@/domain/coverage'
import { formatArea, formatDistance, frameRect } from '@/domain/density'
import { latestVerdicts } from '@/domain/derive'
import {
  dist, frameHandleAt, polygonArea, polygonCentroid, rectCorners, rectFromCorners, resizeRect,
  type FrameHandle,
} from '@/lib/geometry'
import { useSessions } from '@/state/store'
import { useUi } from '@/state/ui'
import { useView } from '@/state/view'
import {
  amberHatch, darkHatch, fillBudget, glyph, INK, label, setDash, STROKE, tealHatch, vertexHandles,
} from './paint'
import { VerificationControl } from './VerificationControl'
import type { Workspace } from './useWorkspace'
import type { Pt } from '@/domain/types'

interface FailedTile { level: number; x: number; y: number }

/** Grab zone for a frame edge, in screen px — constant at every magnification. */
const HANDLE_TOL = 7
/** A frame may not be dragged below this on screen; the denominator must stay real. */
const MIN_FRAME_PX = 14

const HANDLE_CURSOR: Record<FrameHandle, string> = {
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
  nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
}

export function Microscope({ ws, caseId }: { ws: Workspace; caseId: string }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const viewerRef = useRef<OpenSeadragon.Viewer | null>(null)
  const [ready, setReady] = useState(false)
  const failedTiles = useRef<FailedTile[]>([])
  /** Screen position of the focused candidate, for anchoring the verification control. */
  const [anchor, setAnchorState] = useState<{ x: number; y: number } | null>(null)
  const anchorRef = useRef<{ x: number; y: number } | null>(null)

  /**
   * The overlay redraws on every render, so the anchor must only produce a state
   * change when it has actually moved — otherwise draw → setState → draw loops.
   */
  const setAnchor = useCallback((next: { x: number; y: number } | null) => {
    const prev = anchorRef.current
    if (!next) {
      if (prev === null) return
      anchorRef.current = null
      setAnchorState(null)
      return
    }
    if (prev && Math.abs(prev.x - next.x) < 0.5 && Math.abs(prev.y - next.y) < 0.5) return
    anchorRef.current = next
    setAnchorState(next)
  }, [])

  /** Which frame handle the pointer is over, in screen space (§I.4). */
  const [hoverHandle, setHoverHandle] = useState<FrameHandle | null>(null)
  const dragRef = useRef<{ id: string; handle: FrameHandle; from: ReturnType<typeof frameRect> } | null>(null)

  const slide = ws.slide
  const dzi = slide?.dzi ?? null

  const setViewport = useSessions((s) => s.setViewport)
  const addAnnotation = useSessions((s) => s.addAnnotation)
  const reshapeAnnotation = useSessions((s) => s.reshapeAnnotation)

  const ui = useUi()
  const wsRef = useRef(ws)
  wsRef.current = ws
  const uiRef = useRef(ui)
  uiRef.current = ui

  /* ── Viewer lifecycle ───────────────────────────────────────────── */
  useEffect(() => {
    if (!hostRef.current || !dzi) return
    failedTiles.current = []
    setReady(false)
    useView.getState().reset()

    const viewer = OpenSeadragon({
      element: hostRef.current,
      prefixUrl: '',
      tileSources: dzi,
      showNavigator: false,
      showNavigationControl: false,
      showSequenceControl: false,
      immediateRender: false,
      // Lower-resolution tiles hold position until higher-resolution tiles
      // arrive, and an un-drawn region is dark, never white: a blank region on a
      // pathology canvas is indistinguishable from background glass.
      placeholderFillStyle: '#171220',
      blendTime: 0.12,
      animationTime: 0.45,
      springStiffness: 7.5,
      maxZoomPixelRatio: 1.2,
      minZoomImageRatio: 0.85,
      visibilityRatio: 1,
      constrainDuringPan: true,
      preserveImageSizeOnResize: true,
      gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: false },
      crossOriginPolicy: false,
      ajaxWithCredentials: false,
    })
    viewerRef.current = viewer

    viewer.addHandler('tile-load-failed', (e: { tile?: { level: number; x: number; y: number } }) => {
      if (!e.tile) return
      failedTiles.current.push({ level: e.tile.level, x: e.tile.x, y: e.tile.y })
      useView.getState().set({ tileFailures: failedTiles.current.length })
    })

    viewer.addHandler('open', () => {
      setReady(true)
      useView.getState().set({ ready: true })
    })

    return () => {
      viewerRef.current = null
      viewer.destroy()
    }
  }, [dzi])

  /* ── Live readout, coverage accrual, viewport persistence ───────── */
  const publish = useCallback(() => {
    const viewer = viewerRef.current
    const s = wsRef.current.slide
    if (!viewer || !viewer.world.getItemCount() || !s) return
    const vp = viewer.viewport
    const imageZoom = vp.viewportToImageZoom(vp.getZoom(true))
    const centre = vp.viewportToImageCoordinates(vp.getCenter(true))
    const b = vp.viewportToImageRectangle(vp.getBounds(true))
    useView.getState().set({
      mag: BASE_OBJECTIVE * imageZoom,
      imageZoom,
      centreX: centre.x,
      centreY: centre.y,
      bounds: { x: b.x, y: b.y, w: b.width, h: b.height },
    })
  }, [])

  const accrue = useCallback(() => {
    const viewer = viewerRef.current
    const w = wsRef.current
    if (!viewer || !viewer.world.getItemCount() || !w.slide || !w.grid) return
    if (w.tissue.state !== 'ready') return
    const vp = viewer.viewport
    const bounds = vp.viewportToImageRectangle(vp.getBounds(true))
    const mag = BASE_OBJECTIVE * vp.viewportToImageZoom(vp.getZoom(true))
    const changed = markViewport(
      w.grid, w.tissue.data,
      { x: bounds.x, y: bounds.y, w: bounds.width, h: bounds.height },
      mag,
    )
    if (changed) w.refreshCoverage()
  }, [])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !ready) return

    let rafPending = false
    let accrueTimer = 0
    let persistTimer = 0

    const onChange = () => {
      if (!rafPending) {
        rafPending = true
        requestAnimationFrame(() => {
          rafPending = false
          publish()
          draw()
        })
      }
      window.clearTimeout(accrueTimer)
      accrueTimer = window.setTimeout(accrue, 120)

      window.clearTimeout(persistTimer)
      persistTimer = window.setTimeout(() => {
        const v = viewerRef.current
        const s = wsRef.current.slide
        if (!v || !v.world.getItemCount() || !s) return
        const vp = v.viewport
        const c = vp.viewportToImageCoordinates(vp.getCenter(true))
        setViewport(caseId, s.id, {
          x: c.x, y: c.y, imageZoom: vp.viewportToImageZoom(vp.getZoom(true)),
        })
      }, 500)
    }

    viewer.addHandler('viewport-change', onChange)
    viewer.addHandler('animation-finish', onChange)
    viewer.addHandler('resize', onChange)
    onChange()

    return () => {
      viewer.removeHandler('viewport-change', onChange)
      viewer.removeHandler('animation-finish', onChange)
      viewer.removeHandler('resize', onChange)
      window.clearTimeout(accrueTimer)
      window.clearTimeout(persistTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, caseId, publish, accrue])

  /* ── Restore the viewport this slide was left at ─────────────────── */
  const restoredFor = useRef<string | null>(null)
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !ready || !slide) return
    if (restoredFor.current === slide.id) return
    restoredFor.current = slide.id
    const saved = ws.slideSession?.viewport
    const vp = viewer.viewport
    if (saved) {
      vp.zoomTo(vp.imageToViewportZoom(saved.imageZoom), undefined, true)
      vp.panTo(vp.imageToViewportCoordinates(new OpenSeadragon.Point(saved.x, saved.y)), true)
    } else {
      vp.goHome(true)
    }
    vp.applyConstraints(true)
    publish()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, slide?.id])

  /* ── Fly-to commands (candidate stepping, cluster descent, fly-back) ── */
  const flyToken = useRef(0)
  useEffect(() => {
    const viewer = viewerRef.current
    const cmd = ui.fly
    if (!viewer || !ready || !cmd || cmd.token === flyToken.current) return
    if (slide && cmd.slideId !== slide.id) return
    flyToken.current = cmd.token
    const vp = viewer.viewport
    const immediately = !cmd.animate

    if (cmd.target.kind === 'rect') {
      const r = cmd.target.rect
      vp.fitBounds(vp.imageToViewportRectangle(new OpenSeadragon.Rect(r.x, r.y, r.w, r.h)), immediately)
    } else {
      const { x, y, mag } = cmd.target
      vp.zoomTo(vp.imageToViewportZoom(mag / BASE_OBJECTIVE), undefined, immediately)
      vp.panTo(vp.imageToViewportCoordinates(new OpenSeadragon.Point(x, y)), immediately)
    }
    vp.applyConstraints(immediately)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.fly, ready, slide?.id])

  /* ── Overlay ─────────────────────────────────────────────────────── */
  const transform = useCallback(() => {
    const viewer = viewerRef.current
    if (!viewer || !viewer.world.getItemCount()) return null
    const vp = viewer.viewport
    const o = vp.imageToViewerElementCoordinates(new OpenSeadragon.Point(0, 0))
    const u = vp.imageToViewerElementCoordinates(new OpenSeadragon.Point(1000, 0))
    const scale = (u.x - o.x) / 1000
    return {
      ox: o.x, oy: o.y, scale,
      sx: (x: number) => o.x + x * scale,
      sy: (y: number) => o.y + y * scale,
      mag: BASE_OBJECTIVE * vp.viewportToImageZoom(vp.getZoom(true)),
    }
  }, [])

  const draw = useCallback(() => {
    const canvas = overlayRef.current
    const host = hostRef.current
    const t = transform()
    if (!canvas || !host || !t) return

    const dpr = window.devicePixelRatio || 1
    const w = host.clientWidth
    const h = host.clientHeight
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
    }
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const W = wsRef.current
    const U = uiRef.current
    const slideNow = W.slide
    if (!slideNow) return

    // Failed tiles always render, hold-to-clear or not: they are the absence of
    // image data, not an overlay of opinion.
    drawFailedTiles(ctx, t, slideNow.width, slideNow.height)

    // Hold-to-clear: the trust contract. One key, and the reader sees tissue.
    if (U.holdClear) {
      drawScaleBar(ctx, w, h, t.scale, slideNow.mpp)
      setAnchor(null)
      return
    }

    const layers = W.session?.layers
    if (!layers) return
    const { fills } = fillBudget(layers)
    const mpp = slideNow.mpp
    const heads = W.session ? latestVerdicts(W.session.verdicts.filter((v) => v.slideId === slideNow.id)) : new Map()

    /* QC — advisory tier, amber hatch, constant density in screen space. */
    if (layers.qc) {
      for (const q of W.qcRegions) {
        ctx.save()
        ctx.beginPath()
        q.polygon.forEach((p, i) => (i ? ctx.lineTo(t.sx(p.x), t.sy(p.y)) : ctx.moveTo(t.sx(p.x), t.sy(p.y))))
        ctx.closePath()
        if (fills) { ctx.fillStyle = amberHatch(); ctx.globalAlpha = 0.7; ctx.fill(); ctx.globalAlpha = 1 }
        ctx.strokeStyle = INK.advisory
        ctx.lineWidth = STROKE.qc
        setDash(ctx, 'solid')
        ctx.stroke()
        ctx.restore()
        if (t.mag >= 4) {
          const c = polygonCentroid(q.polygon)
          label(ctx, qcTypeLabel(q.type), t.sx(c.x), t.sy(c.y), INK.advisory, 'center')
        }
      }
    }

    /* Candidate clusters — visible below the individual-candidate threshold. */
    if (layers.clusters && W.slideSession?.revealed && t.mag < CANDIDATE_MAG_THRESHOLD) {
      for (const c of W.clusters) {
        const x = t.sx(c.bounds.x), y = t.sy(c.bounds.y)
        const cw = c.bounds.w * t.scale, chh = c.bounds.h * t.scale
        ctx.save()
        ctx.strokeStyle = INK.inferred
        ctx.lineWidth = STROKE.candidate
        setDash(ctx, 'dashed')
        ctx.strokeRect(x, y, cw, chh)
        ctx.restore()
        label(ctx, `${c.candidateIds.length - c.reviewed} unreviewed`, x + 6, y - 10, INK.inferred)
      }
    }

    /* Individual candidates — microscope only, at or above 10×. Hard threshold. */
    if (layers.candidates && W.slideSession?.revealed && t.mag >= CANDIDATE_MAG_THRESHOLD) {
      for (const c of W.model.candidates) {
        const v = heads.get(c.id)
        if (v && v.kind !== 'rejected') continue
        const rejected = Boolean(v)
        if (rejected && !layers.rejected) continue
        const x = t.sx(c.x), y = t.sy(c.y)
        const r = Math.max(7, c.r * t.scale)
        if (x < -r || y < -r || x > w + r || y > h + r) continue
        const focused = U.focusedCandidateId === c.id

        ctx.save()
        if (rejected) {
          ctx.globalAlpha = 0.4
          ctx.strokeStyle = INK.dismissed
          ctx.lineWidth = STROKE.rejected
          setDash(ctx, 'dotted')
        } else {
          ctx.strokeStyle = INK.inferred
          ctx.lineWidth = focused ? STROKE.focused : STROKE.candidate
          setDash(ctx, 'dashed')
        }
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()

        if (c.qcAffected && !rejected) {
          ctx.save()
          ctx.strokeStyle = INK.advisory
          ctx.lineWidth = 1
          setDash(ctx, 'dotted')
          ctx.beginPath()
          ctx.arc(x, y, r + 3.5, 0, Math.PI * 2)
          ctx.stroke()
          ctx.restore()
        }

        glyph(ctx, rejected ? '✕' : '◇', x, y - r - 8,
          rejected ? INK.dismissed : INK.inferred, focused ? 13 : 11)

        if (focused) {
          ctx.save()
          ctx.strokeStyle = INK.inferred
          ctx.globalAlpha = 0.5
          ctx.lineWidth = 1
          setDash(ctx, 'solid')
          ctx.beginPath()
          ctx.arc(x, y, r + 9, 0, Math.PI * 2)
          ctx.stroke()
          ctx.restore()
        }
      }
    }

    /* Confirmed and reclassified findings — measured register. */
    if (layers.findings) {
      for (const f of W.findings) {
        const x = t.sx(f.x), y = t.sy(f.y)
        const r = Math.max(7, f.r * t.scale)
        if (x < -r || y < -r || x > w + r || y > h + r) continue
        const highlighted = U.focusedFindingIds.includes(f.id)
        ctx.save()
        ctx.strokeStyle = INK.measured
        ctx.lineWidth = highlighted ? STROKE.authored : STROKE.finding
        setDash(ctx, 'solid')
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.stroke()
        if (fills) { ctx.globalAlpha = 0.05; ctx.fillStyle = INK.measured; ctx.fill() }
        ctx.restore()
        glyph(ctx, f.origin === 'reclassified_candidate' ? '✎' : '✓', x, y - r - 8, INK.measured)
        if (f.qcAffected) glyph(ctx, '⚠', x + r + 7, y - r - 8, INK.advisory, 9)
      }
    }

    /* Authored geometry — heaviest stroke, the only vertex handles in the system. */
    for (const a of W.annotations) {
      if (a.kind === 'point') continue
      const isFrame = a.kind === 'frame'
      const isMeasure = a.kind === 'distance' || a.kind === 'area'
      if (isFrame && !layers.frames) continue
      if (isMeasure && !layers.measurements) continue
      if (!isFrame && !isMeasure && !layers.marked) continue

      const pts = a.points.map((p) => ({ x: t.sx(p.x), y: t.sy(p.y) }))
      const selected = U.selectedFrameId === a.id || U.focusedFindingIds.includes(a.id)
      const colour = INK.measured

      ctx.save()
      ctx.strokeStyle = colour
      ctx.lineWidth = STROKE.authored
      setDash(ctx, 'solid')

      if (a.kind === 'frame') {
        const r = rectFromCorners(pts[0], pts[1])
        ctx.strokeRect(r.x, r.y, r.w, r.h)
        drawCornerTicks(ctx, r, colour)
        // The edge under the pointer thickens. No new handle is introduced —
        // the affordance is the frame's own stroke, plus the resize cursor.
        const hov = a.id === resizableRef.current?.id
          ? (dragRef.current?.handle ?? hoverRef.current)
          : null
        if (hov) drawHandleEmphasis(ctx, r, hov, colour)
        ctx.restore()
        if (mpp) {
          const ir = frameRect(a)
          label(ctx, formatArea(ir.w * ir.h, mpp), r.x, r.y - 12, colour)
        }
        if (selected) vertexHandles(ctx, [pts[0], { x: pts[1].x, y: pts[0].y }, pts[1], { x: pts[0].x, y: pts[1].y }])
      } else if (a.kind === 'distance') {
        ctx.beginPath()
        ctx.moveTo(pts[0].x, pts[0].y)
        ctx.lineTo(pts[1].x, pts[1].y)
        ctx.stroke()
        ctx.restore()
        if (mpp) {
          const d = dist(a.points[0], a.points[1])
          label(ctx, formatDistance(d, mpp), (pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2 - 12, colour, 'center')
        }
        vertexHandles(ctx, pts)
      } else if (a.kind === 'text') {
        ctx.restore()
        glyph(ctx, '●', pts[0].x, pts[0].y, colour, 8)
        label(ctx, a.label, pts[0].x + 10, pts[0].y, colour)
      } else {
        const hatched = a.kind === 'unassessable'
        ctx.beginPath()
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
        ctx.closePath()
        if (fills) {
          if (hatched) { ctx.fillStyle = tealHatch(); ctx.globalAlpha = 0.7 }
          else { ctx.fillStyle = colour; ctx.globalAlpha = 0.05 }
          ctx.fill()
          ctx.globalAlpha = 1
        }
        ctx.stroke()
        ctx.restore()
        if (t.mag >= 4 || a.kind === 'area') {
          const c = polygonCentroid(a.points)
          const text = a.kind === 'area' && mpp
            ? formatArea(polygonArea(a.points), mpp)
            : a.label
          label(ctx, text, t.sx(c.x), t.sy(c.y), colour, 'center')
        }
        if (selected) vertexHandles(ctx, pts)
      }
    }

    /* In-progress geometry — the number exists before the shape is committed. */
    const d = U.draft
    if (d) {
      const pts = d.points.map((p) => ({ x: t.sx(p.x), y: t.sy(p.y) }))
      const cur = d.cursor ? { x: t.sx(d.cursor.x), y: t.sy(d.cursor.y) } : null
      ctx.save()
      ctx.strokeStyle = INK.measured
      ctx.lineWidth = STROKE.authored
      setDash(ctx, 'dashed')
      if (d.tool === 'frame' && pts[0] && cur) {
        const r = rectFromCorners(pts[0], cur)
        ctx.strokeRect(r.x, r.y, r.w, r.h)
      } else if (d.tool === 'distance' && pts[0] && cur) {
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(cur.x, cur.y); ctx.stroke()
      } else if (pts.length) {
        ctx.beginPath()
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
        if (cur) ctx.lineTo(cur.x, cur.y)
        ctx.stroke()
      }
      ctx.restore()
      vertexHandles(ctx, pts)

      if (mpp && d.cursor) {
        const readout = liveReadout(d, d.cursor, mpp)
        if (readout) label(ctx, readout, t.sx(d.cursor.x) + 14, t.sy(d.cursor.y) - 14, INK.measured)
      }
    }

    drawScaleBar(ctx, w, h, t.scale, mpp)

    /* Anchor for the verification control — the only element over tissue. */
    const focusedId = U.focusedCandidateId
    const focused = focusedId ? W.model.byId.get(focusedId) : null
    if (focused && t.mag >= CANDIDATE_MAG_THRESHOLD && W.slideSession?.revealed) {
      const r = Math.max(7, focused.r * t.scale)
      setAnchor({ x: t.sx(focused.x), y: t.sy(focused.y) + r + 24 })
    } else {
      setAnchor(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transform])

  function drawFailedTiles(
    ctx: CanvasRenderingContext2D,
    t: NonNullable<ReturnType<typeof transform>>,
    slideW: number, slideH: number,
  ) {
    if (failedTiles.current.length === 0) return
    const maxLevel = Math.ceil(Math.log2(Math.max(slideW, slideH)))
    ctx.save()
    ctx.fillStyle = darkHatch()
    for (const f of failedTiles.current) {
      const d = 2 ** (maxLevel - f.level)
      const size = 254 * d
      ctx.fillRect(t.sx(f.x * size), t.sy(f.y * size), size * t.scale, size * t.scale)
    }
    ctx.restore()
  }

  useEffect(() => { draw() })

  /* ── Pointer: candidate selection and drawing tools ──────────────── */
  const toolId = ws.session?.activeToolId ?? null
  const drawing = ws.session?.tool === 'annotate' || ws.session?.tool === 'measure' || ws.session?.tool === 'frame'

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !ready) return
    viewer.setMouseNavEnabled(!drawing)
  }, [drawing, ready])

  /**
   * Only the selected frame is resizable, and only when the scale is real.
   * Drawing a new frame takes precedence over reshaping an existing one, and a
   * finalized case is read-only.
   */
  const resizableFrame = useMemo(() => {
    if (drawing || !ws.measurementEnabled || ws.readOnly) return null
    return ws.frames.find((f) => f.id === ui.selectedFrameId) ?? null
  }, [drawing, ws.measurementEnabled, ws.readOnly, ws.frames, ui.selectedFrameId])

  const resizableRef = useRef(resizableFrame)
  resizableRef.current = resizableFrame
  const hoverRef = useRef<FrameHandle | null>(hoverHandle)
  hoverRef.current = hoverHandle

  /**
   * Hover is tracked on the container rather than the overlay, because the
   * overlay only accepts pointer events once a handle is under the cursor —
   * otherwise it would swallow every pan and zoom OpenSeadragon needs.
   */
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const onMove = (e: PointerEvent) => {
      if (dragRef.current) return
      const f = resizableRef.current
      const t = transform()
      if (!f || !t) { setHoverHandle(null); return }
      const box = root.getBoundingClientRect()
      const r = frameRect(f)
      const screen = {
        x: t.sx(r.x), y: t.sy(r.y), w: r.w * t.scale, h: r.h * t.scale,
      }
      setHoverHandle(
        frameHandleAt(screen, { x: e.clientX - box.left, y: e.clientY - box.top }, HANDLE_TOL),
      )
    }
    const onLeave = () => { if (!dragRef.current) setHoverHandle(null) }
    root.addEventListener('pointermove', onMove)
    root.addEventListener('pointerleave', onLeave)
    return () => {
      root.removeEventListener('pointermove', onMove)
      root.removeEventListener('pointerleave', onLeave)
    }
  }, [transform])

  // A frame that stops being resizable must not leave a stale resize cursor.
  useEffect(() => {
    if (!resizableFrame && hoverHandle) setHoverHandle(null)
  }, [resizableFrame, hoverHandle])

  const toImage = useCallback((clientX: number, clientY: number): Pt | null => {
    const viewer = viewerRef.current
    const host = hostRef.current
    if (!viewer || !host || !viewer.world.getItemCount()) return null
    const rect = host.getBoundingClientRect()
    const p = viewer.viewport.viewerElementToImageCoordinates(
      new OpenSeadragon.Point(clientX - rect.left, clientY - rect.top),
    )
    return { x: p.x, y: p.y }
  }, [])

  const currentMag = () => {
    const viewer = viewerRef.current
    if (!viewer || !viewer.world.getItemCount()) return REVIEW_MAG
    return BASE_OBJECTIVE * viewer.viewport.viewportToImageZoom(viewer.viewport.getZoom(true))
  }

  const commit = useCallback((points: Pt[], kind: 'polygon' | 'frame' | 'distance' | 'area' | 'text') => {
    const s = wsRef.current.slide
    if (!s) return
    if (kind === 'polygon') {
      uiRef.current.setChipStrip({ kind: 'polygon-type', points })
      uiRef.current.setDraft(null)
      return
    }
    const n = wsRef.current.annotations.filter((a) => a.kind === kind).length + 1
    const labels: Record<string, string> = {
      frame: `Counting frame ${n}`,
      distance: `Distance ${n}`,
      area: `Area ${n}`,
      text: `Label ${n}`,
    }
    const created = addAnnotation(caseId, {
      slideId: s.id, kind, points, label: labels[kind], mag: currentMag(),
    })
    uiRef.current.setDraft(null)
    if (kind === 'frame') {
      uiRef.current.setSelectedFrame(created.id)
      useSessions.getState().setPanel(caseId, 'density')
      // Disarm on commit, so the frame the reader just drew is immediately
      // adjustable. Drawing takes precedence over reshaping, so leaving the
      // tool armed would put an Escape between drawing a denominator and
      // correcting it — the two halves of one act.
      useSessions.getState().setTool(caseId, 'navigate', null)
    }
    uiRef.current.announce(`${labels[kind]} created`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, addAnnotation])

  const onPointerDown = (e: React.PointerEvent) => {
    /* Reshaping an existing frame (§I.4). */
    const f = resizableFrame
    if (f && hoverHandle) {
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      dragRef.current = { id: f.id, handle: hoverHandle, from: frameRect(f) }
      viewerRef.current?.setMouseNavEnabled(false)
      ui.setFrameDrag({ annotationId: f.id, points: rectCorners(frameRect(f)) })
      return
    }

    if (!drawing || !toolId) return
    const p = toImage(e.clientX, e.clientY)
    if (!p) return
    e.currentTarget.setPointerCapture(e.pointerId)

    if (toolId === 'point') {
      ui.setChipStrip({ kind: 'point-type', at: p })
      return
    }
    if (toolId === 'text') {
      commit([p], 'text')
      return
    }
    if (toolId === 'frame' || toolId === 'distance') {
      ui.setDraft({ tool: toolId, points: [p], cursor: p })
      return
    }
    // polygon / area accumulate vertices
    const d = ui.draft
    const tool = toolId === 'area' ? 'area' : 'polygon'
    if (!d || d.tool !== tool) ui.setDraft({ tool, points: [p], cursor: p })
    else ui.setDraft({ ...d, points: [...d.points, p], cursor: p })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const resize = dragRef.current
    if (resize) {
      const p = toImage(e.clientX, e.clientY)
      const t = transform()
      if (!p) return
      // The floor is a constant on screen, so the frame stays grabbable at 40x
      // without becoming unusably coarse at 2x.
      const min = t ? MIN_FRAME_PX / t.scale : 1
      ui.setFrameDrag({
        annotationId: resize.id,
        points: rectCorners(resizeRect(resize.from, resize.handle, p, min)),
      })
      return
    }

    if (!drawing) return
    const d = uiRef.current.draft
    if (!d) return
    const p = toImage(e.clientX, e.clientY)
    if (p) ui.setDraft({ ...d, cursor: p })
  }

  const endResize = (commit: boolean) => {
    const d = dragRef.current
    if (!d) return
    const live = uiRef.current.frameDrag
    dragRef.current = null
    viewerRef.current?.setMouseNavEnabled(!drawing)
    if (commit && live && live.annotationId === d.id) {
      reshapeAnnotation(caseId, d.id, live.points)
      const s = wsRef.current.slide
      if (s?.mpp) {
        const r = rectFromCorners(live.points[0], live.points[1])
        uiRef.current.announce(`Counting frame resized to ${formatArea(r.w * r.h, s.mpp)}`)
      }
    }
    ui.setFrameDrag(null)
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragRef.current) {
      e.currentTarget.releasePointerCapture?.(e.pointerId)
      endResize(true)
      return
    }
    if (!drawing) return
    const d = uiRef.current.draft
    if (!d) return
    if (d.tool === 'frame' || d.tool === 'distance') {
      const p = toImage(e.clientX, e.clientY)
      if (!p) return
      const a = d.points[0]
      if (dist(a, p) < 4) { ui.setDraft(null); return }
      commit([a, p], d.tool)
    }
  }

  const onDoubleClick = (e: React.MouseEvent) => {
    if (!drawing) return
    const d = uiRef.current.draft
    if (d && (d.tool === 'polygon' || d.tool === 'area') && d.points.length >= 3) {
      e.preventDefault()
      commit(d.points, d.tool)
    }
  }

  /* Candidate / object selection while navigating. */
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !ready) return
    const handler = (e: { position: OpenSeadragon.Point; quick: boolean }) => {
      if (!e.quick) return
      const W = wsRef.current
      const U = uiRef.current
      if (!W.slide || W.session?.tool === 'annotate' || W.session?.tool === 'measure' || W.session?.tool === 'frame') return
      const p = viewer.viewport.viewerElementToImageCoordinates(e.position)
      const t = transform()
      if (!t) return

      // Frames and marked regions take precedence over model output when clicked.
      const frame = W.frames.find((f) => {
        const r = frameRect(f)
        return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
      })

      if (W.slideSession?.revealed && t.mag >= CANDIDATE_MAG_THRESHOLD) {
        let best: { id: string; d: number } | null = null
        for (const c of W.model.candidates) {
          const d = Math.hypot(c.x - p.x, c.y - p.y)
          const hit = Math.max(c.r, 12 / t.scale)
          if (d <= hit && (!best || d < best.d)) best = { id: c.id, d }
        }
        if (best) {
          U.setFocusedCandidate(best.id)
          const cand = W.model.byId.get(best.id)
          if (cand) U.setActiveCluster(cand.clusterId)
          useSessions.getState().setPanel(caseId, 'candidates')
          return
        }
      }
      if (frame) {
        U.setSelectedFrame(frame.id)
        useSessions.getState().setPanel(caseId, 'density')
        return
      }
      U.setFocusedCandidate(null)
    }
    viewer.addHandler('canvas-click', handler)
    return () => { viewer.removeHandler('canvas-click', handler) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, caseId, transform])

  const cursor = useMemo(() => {
    const active = dragRef.current?.handle ?? hoverHandle
    if (active) return HANDLE_CURSOR[active]
    if (!drawing) return 'default'
    if (toolId === 'text') return 'text'
    return 'crosshair'
  }, [drawing, toolId, hoverHandle])

  if (!dzi) {
    return (
      <div style={emptyStyle}>
        <div>
          <div style={{ color: 'var(--advisory)', marginBottom: 6 }}>Slide image unavailable</div>
          <div style={{ color: 'var(--text-dim)' }}>
            {slide?.formatSupported === false
              ? `${slide.format} is not a supported slide format. Other slides in this case are unaffected.`
              : 'No image is associated with this slide.'}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div ref={rootRef} style={{ position: 'absolute', inset: 0 }}>
      <div ref={hostRef} style={{ position: 'absolute', inset: 0, background: '#0e0b10' }} />
      <canvas
        ref={overlayRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => endResize(false)}
        onDoubleClick={onDoubleClick}
        style={{
          position: 'absolute', inset: 0,
          pointerEvents: drawing || hoverHandle || dragRef.current ? 'auto' : 'none',
          cursor,
        }}
      />
      {ws.session?.tool !== 'annotate' && anchor && (
        <VerificationControl ws={ws} caseId={caseId} anchor={anchor} />
      )}
      {!ready && <div style={loadingStyle}>Reading pyramid…</div>}
    </div>
  )
}

/* ── helpers ──────────────────────────────────────────────────────── */

/** Thickens the edges named by the hovered handle, so the grab target is legible. */
function drawHandleEmphasis(
  ctx: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number },
  handle: FrameHandle, colour: string,
) {
  ctx.save()
  ctx.setLineDash([])
  ctx.strokeStyle = colour
  ctx.lineWidth = STROKE.authored + 2
  ctx.lineCap = 'round'
  ctx.beginPath()
  if (handle.includes('n')) { ctx.moveTo(r.x, r.y); ctx.lineTo(r.x + r.w, r.y) }
  if (handle.includes('s')) { ctx.moveTo(r.x, r.y + r.h); ctx.lineTo(r.x + r.w, r.y + r.h) }
  if (handle.includes('w')) { ctx.moveTo(r.x, r.y); ctx.lineTo(r.x, r.y + r.h) }
  if (handle.includes('e')) { ctx.moveTo(r.x + r.w, r.y); ctx.lineTo(r.x + r.w, r.y + r.h) }
  ctx.stroke()
  ctx.restore()
}

function liveReadout(
  d: { tool: string; points: Pt[] }, cursor: Pt, mpp: number,
): string | null {
  if (d.tool === 'frame' && d.points[0]) {
    const r = rectFromCorners(d.points[0], cursor)
    return `${formatArea(r.w * r.h, mpp)}  ${formatDistance(r.w, mpp)} × ${formatDistance(r.h, mpp)}`
  }
  if (d.tool === 'distance' && d.points[0]) return formatDistance(dist(d.points[0], cursor), mpp)
  if ((d.tool === 'area' || d.tool === 'polygon') && d.points.length >= 2) {
    return formatArea(polygonArea([...d.points, cursor]), mpp)
  }
  return null
}

/** Scale never leaves the screen: a measurement culture depends on it. */
function drawScaleBar(
  ctx: CanvasRenderingContext2D, _w: number, h: number, scale: number, mpp: number | null,
) {
  const x = 24
  const y = h - 24
  ctx.save()
  ctx.font = '500 11px "IBM Plex Mono", ui-monospace, monospace'
  ctx.textBaseline = 'alphabetic'

  if (!mpp) {
    ctx.fillStyle = INK.advisory
    ctx.fillText('SCALE UNAVAILABLE', x, y)
    ctx.restore()
    return
  }

  const targetPx = 140
  const targetUm = (targetPx / scale) * mpp
  const nice = niceNumber(targetUm)
  const barPx = (nice / mpp) * scale

  ctx.strokeStyle = INK.text
  ctx.fillStyle = INK.text
  ctx.globalAlpha = 0.85
  ctx.lineWidth = 1
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.moveTo(x, y); ctx.lineTo(x + barPx, y)
  ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4)
  ctx.moveTo(x + barPx, y - 4); ctx.lineTo(x + barPx, y + 4)
  ctx.stroke()
  ctx.fillText(nice >= 1000 ? `${nice / 1000} mm` : `${nice} µm`, x, y - 8)
  ctx.restore()
}

function niceNumber(v: number): number {
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000]
  for (let i = steps.length - 1; i >= 0; i--) if (steps[i] <= v) return steps[i]
  return steps[0]
}

function drawCornerTicks(
  ctx: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }, colour: string,
) {
  const t = 8
  ctx.save()
  ctx.strokeStyle = colour
  ctx.lineWidth = 2
  ctx.setLineDash([])
  const corners: Array<[number, number, number, number]> = [
    [r.x, r.y, 1, 1], [r.x + r.w, r.y, -1, 1],
    [r.x, r.y + r.h, 1, -1], [r.x + r.w, r.y + r.h, -1, -1],
  ]
  for (const [cx, cy, dx, dy] of corners) {
    ctx.beginPath()
    ctx.moveTo(cx + dx * t, cy)
    ctx.lineTo(cx, cy)
    ctx.lineTo(cx, cy + dy * t)
    ctx.stroke()
  }
  ctx.restore()
}

function qcTypeLabel(t: string): string {
  return ({
    focus: 'Focus issue', fold: 'Tissue fold', bubble: 'Air bubble',
    pen: 'Pen mark', incomplete: 'Incomplete scan', edge: 'Section edge',
  } as Record<string, string>)[t] ?? t
}

const emptyStyle: React.CSSProperties = {
  position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
  padding: 48, textAlign: 'center', fontSize: 13,
}
const loadingStyle: React.CSSProperties = {
  position: 'absolute', left: 24, top: 24, fontSize: 11,
  letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-faint)',
}

export { T_RECENTRE_MS }
