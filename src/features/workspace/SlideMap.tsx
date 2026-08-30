import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  DESCENT_MAG, FINDING_AGGREGATION_THRESHOLD, VIEWPORT_RECT_MIN_PX,
} from '@/domain/constants'
import { DIAGNOSTIC, ORIENTATION } from '@/domain/coverage'
import { frameRect } from '@/domain/density'
import { magLabel } from '@/lib/format'
import * as registry from '@/state/coverageRegistry'
import { useSessions } from '@/state/store'
import { useUi } from '@/state/ui'
import { useView } from '@/state/view'
import { amberHatch, INK, setDash, tealHatch } from './paint'
import type { Workspace } from './useWorkspace'
import type { TissueData } from '@/domain/tissue'
import type { LayerConfig, Pt } from '@/domain/types'
import './slidemap.css'

interface Fit {
  scale: number
  ox: number
  oy: number
  sx: (x: number) => number
  sy: (y: number) => number
  ix: (px: number) => number
  iy: (py: number) => number
}

/**
 * The Slide Map. One component rendered at two sizes: it is the canvas in
 * orientation and 288 × 240 in the rail during inspection. There is no separate
 * minimap object — two spatial widgets would mean two spatial models the reader
 * has to reconcile.
 *
 * The substrate, coverage veil, tissue outline and QC hatch are painted once
 * into a cached layer; only the viewport rectangle and the evidence redraw per
 * frame, so the rectangle can track pan and zoom with no lag and no debounce.
 */
export function SlideMap({
  ws, caseId, variant, hidden = false,
}: {
  ws: Workspace
  caseId: string
  variant: 'canvas' | 'rail'
  /** Demoted out of the canvas. It stays mounted — nothing unmounts (§C.5). */
  hidden?: boolean
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const staticRef = useRef<{ key: string; canvas: HTMLCanvasElement } | null>(null)
  const [reticle, setReticle] = useState<Pt | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  const ui = useUi()
  const setSpatial = useSessions((s) => s.setSpatial)
  const bounds = useView((s) => s.bounds)
  const coverageVersion = useSyncExternalStore(registry.subscribe, registry.getVersion)

  const slide = ws.slide
  const tissue = ws.tissue.state === 'ready' ? ws.tissue.data : null
  const layers = ws.session?.layers

  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  /* Placement of the slide inside the map box, preserving true aspect ratio. */
  const fit = useCallback((): Fit | null => {
    if (!slide || size.w === 0 || size.h === 0) return null
    const pad = variant === 'canvas' ? 24 : 8
    const aw = size.w - pad * 2
    const ah = size.h - pad * 2
    if (aw <= 0 || ah <= 0) return null
    const scale = Math.min(aw / slide.width, ah / slide.height)
    const ox = pad + (aw - slide.width * scale) / 2
    const oy = pad + (ah - slide.height * scale) / 2
    return {
      scale, ox, oy,
      sx: (x) => ox + x * scale,
      sy: (y) => oy + y * scale,
      ix: (px) => (px - ox) / scale,
      iy: (py) => (py - oy) / scale,
    }
  }, [slide, size, variant])

  useEffect(() => {
    const canvas = canvasRef.current
    const t = fit()
    if (!canvas || !t || !slide || hidden) return

    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== Math.round(size.w * dpr)) canvas.width = Math.round(size.w * dpr)
    if (canvas.height !== Math.round(size.h * dpr)) canvas.height = Math.round(size.h * dpr)
    canvas.style.width = `${size.w}px`
    canvas.style.height = `${size.h}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.w, size.h)

    const sw = slide.width * t.scale
    const sh = slide.height * t.scale

    if (!tissue || !layers) {
      // Skeleton at the slide's true aspect ratio, so nothing reflows when the
      // tissue arrives.
      ctx.fillStyle = '#171220'
      ctx.fillRect(t.ox, t.oy, sw, sh)
      drawFrameEdge(ctx, t.ox, t.oy, sw, sh)
      return
    }

    /* Cached static layers: substrate, veil, tissue outline, QC hatch. */
    const key = [
      size.w, size.h, dpr, variant, slide.id,
      ui.holdClear ? 'clear' : 'over',
      ui.holdClear ? '' : coverageVersion,
      ui.holdClear ? '' : `${layers.coverage ? 1 : 0}${layers.tissueMask ? 1 : 0}${layers.qc ? 1 : 0}`,
      ui.holdClear ? '' : ws.qcRegions.map((q) => q.id).join(','),
    ].join('|')

    if (staticRef.current?.key !== key) {
      staticRef.current = {
        key,
        canvas: buildStaticLayer(size, dpr, t, slide.width, slide.height, tissue, ws, layers, ui.holdClear),
      }
    }
    ctx.drawImage(staticRef.current.canvas, 0, 0, size.w, size.h)

    if (ui.holdClear) {
      drawFrameEdge(ctx, t.ox, t.oy, sw, sh)
      return
    }

    /* Rule 1 — the map never renders individual candidates. Only clusters. */
    if (layers.clusters && ws.slideSession?.revealed) {
      for (const c of ws.clusters) {
        const x = t.sx(c.bounds.x), y = t.sy(c.bounds.y)
        const w = Math.max(10, c.bounds.w * t.scale)
        const h = Math.max(10, c.bounds.h * t.scale)
        ctx.save()
        ctx.strokeStyle = INK.inferred
        ctx.lineWidth = c.id === ui.activeClusterId ? 2 : 1.5
        setDash(ctx, 'dashed')
        ctx.strokeRect(x, y, w, h)
        ctx.restore()
        if (variant === 'canvas' || w > 26) {
          const remaining = c.candidateIds.length - c.reviewed
          drawPlate(ctx, remaining > 0 ? String(remaining) : '✓', x + w / 2, y - 8, INK.inferred)
        }
      }
    }

    /* Rule 2 — confirmed findings aggregate above the threshold. The map
       answers *where*, not *how many of each*; that is the Record's job. */
    if (layers.findings && ws.findings.length > 0) {
      if (ws.findings.length > FINDING_AGGREGATION_THRESHOLD) {
        ctx.save()
        ctx.globalAlpha = 0.16
        ctx.fillStyle = INK.measured
        for (const f of ws.findings) {
          ctx.beginPath()
          ctx.arc(t.sx(f.x), t.sy(f.y), 7, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
        drawPlate(ctx, `${ws.findings.length} findings`, t.ox + sw / 2, t.oy + sh + 10, INK.measured)
      } else {
        ctx.save()
        ctx.fillStyle = INK.measured
        for (const f of ws.findings) {
          ctx.beginPath()
          ctx.arc(t.sx(f.x), t.sy(f.y), variant === 'canvas' ? 3 : 2, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
      }
    }

    /* Rejected — lowest prominence tier, retained permanently. */
    if (layers.rejected && ws.session) {
      ctx.save()
      ctx.globalAlpha = 0.4
      ctx.strokeStyle = INK.dismissed
      ctx.lineWidth = 1
      setDash(ctx, 'dotted')
      for (const v of ws.session.verdicts) {
        if (v.kind !== 'rejected' || v.slideId !== slide.id) continue
        const c = ws.model.byId.get(v.candidateId)
        if (!c) continue
        ctx.beginPath()
        ctx.arc(t.sx(c.x), t.sy(c.y), 2.5, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.restore()
    }

    /* Authored geometry — heaviest stroke in the system. */
    for (const a of ws.annotations) {
      if (a.kind === 'point') continue
      const isFrame = a.kind === 'frame'
      const isMeasure = a.kind === 'distance' || a.kind === 'area'
      if (isFrame && !layers.frames) continue
      if (isMeasure && !layers.measurements) continue
      if (!isFrame && !isMeasure && !layers.marked) continue

      ctx.save()
      ctx.strokeStyle = INK.measured
      ctx.lineWidth = 2
      setDash(ctx, 'solid')
      if (isFrame) {
        const r = frameRect(a)
        const x = t.sx(r.x), y = t.sy(r.y)
        const w = Math.max(4, r.w * t.scale), h = Math.max(4, r.h * t.scale)
        ctx.strokeRect(x, y, w, h)
        ctx.restore()
        if (variant === 'canvas') drawPlate(ctx, a.label, x + w / 2, y - 8, INK.measured)
        continue
      }
      ctx.beginPath()
      a.points.forEach((p, i) => (i ? ctx.lineTo(t.sx(p.x), t.sy(p.y)) : ctx.moveTo(t.sx(p.x), t.sy(p.y))))
      if (a.kind !== 'distance') ctx.closePath()
      if (a.kind === 'unassessable') {
        ctx.fillStyle = tealHatch()
        ctx.globalAlpha = 0.7
        ctx.fill()
        ctx.globalAlpha = 1
      }
      ctx.stroke()
      ctx.restore()
    }

    /* Return marker at the departed viewport. */
    const marker = ws.slideSession?.returnMarker
    if (marker && ws.slideSession?.spatial === 'orientation') {
      ctx.save()
      ctx.strokeStyle = INK.measured
      ctx.globalAlpha = 0.7
      ctx.lineWidth = 1
      setDash(ctx, 'dotted')
      const mx = t.sx(marker.x), my = t.sy(marker.y)
      ctx.beginPath()
      ctx.moveTo(mx - 7, my); ctx.lineTo(mx + 7, my)
      ctx.moveTo(mx, my - 7); ctx.lineTo(mx, my + 7)
      ctx.stroke()
      ctx.restore()
      drawPlate(ctx, 'return ⏎', mx, my + 16, INK.measured)
    }

    /* Reticle — aim before committing. */
    if (reticle) {
      ctx.save()
      ctx.strokeStyle = INK.text
      ctx.globalAlpha = 0.8
      ctx.lineWidth = 1
      setDash(ctx, 'solid')
      const rx = t.sx(reticle.x), ry = t.sy(reticle.y)
      ctx.beginPath()
      ctx.arc(rx, ry, 9, 0, Math.PI * 2)
      ctx.moveTo(rx - 14, ry); ctx.lineTo(rx - 4, ry)
      ctx.moveTo(rx + 4, ry); ctx.lineTo(rx + 14, ry)
      ctx.moveTo(rx, ry - 14); ctx.lineTo(rx, ry - 4)
      ctx.moveTo(rx, ry + 4); ctx.lineTo(rx, ry + 14)
      ctx.stroke()
      ctx.restore()
    }

    /* Viewport rectangle — clamped to a crosshair when the true rectangle falls
       below legibility, which it does at 40× on a 100k-pixel slide. */
    if (bounds && ws.slideSession?.spatial === 'inspection') {
      const w = bounds.w * t.scale
      const h = bounds.h * t.scale
      const cx = t.sx(bounds.x + bounds.w / 2)
      const cy = t.sy(bounds.y + bounds.h / 2)
      ctx.save()
      ctx.strokeStyle = INK.text
      ctx.lineWidth = 1
      setDash(ctx, 'solid')
      if (w < VIEWPORT_RECT_MIN_PX || h < VIEWPORT_RECT_MIN_PX) {
        const s = VIEWPORT_RECT_MIN_PX
        ctx.beginPath()
        ctx.rect(cx - s / 2, cy - s / 2, s, s)
        ctx.moveTo(cx - 12, cy); ctx.lineTo(cx - 6, cy)
        ctx.moveTo(cx + 6, cy); ctx.lineTo(cx + 12, cy)
        ctx.moveTo(cx, cy - 12); ctx.lineTo(cx, cy - 6)
        ctx.moveTo(cx, cy + 6); ctx.lineTo(cx, cy + 12)
        ctx.stroke()
        ctx.restore()
        drawPlate(ctx, magLabel(useView.getState().mag), cx, cy + 20, INK.text)
      } else {
        ctx.strokeRect(t.sx(bounds.x), t.sy(bounds.y), w, h)
        ctx.restore()
      }
    }

    drawFrameEdge(ctx, t.ox, t.oy, sw, sh)
  })

  /* ── Interaction ─────────────────────────────────────────────────── */
  function toImage(e: React.MouseEvent): Pt | null {
    const t = fit()
    const host = hostRef.current
    if (!t || !host || !slide) return null
    const r = host.getBoundingClientRect()
    const p = { x: t.ix(e.clientX - r.left), y: t.iy(e.clientY - r.top) }
    if (p.x < 0 || p.y < 0 || p.x > slide.width || p.y > slide.height) return null
    return p
  }

  function clusterAt(p: Pt) {
    return ws.clusters.find(
      (c) => p.x >= c.bounds.x && p.x <= c.bounds.x + c.bounds.w &&
             p.y >= c.bounds.y && p.y <= c.bounds.y + c.bounds.h,
    )
  }

  function descend(target: Pt | { rect: { x: number; y: number; w: number; h: number } }) {
    if (!slide) return
    setSpatial(caseId, slide.id, 'inspection')
    if ('rect' in target) {
      ui.flyTo({ slideId: slide.id, target: { kind: 'rect', rect: target.rect }, animate: true })
    } else {
      ui.flyTo({
        slideId: slide.id,
        target: { kind: 'point', x: target.x, y: target.y, mag: DESCENT_MAG },
        animate: true,
      })
    }
  }

  function onClick(e: React.MouseEvent) {
    const p = toImage(e)
    if (!p || !slide) return
    const inspection = ws.slideSession?.spatial === 'inspection'

    const cluster = ws.slideSession?.revealed ? clusterAt(p) : undefined
    if (cluster) {
      // Descends and expands the cluster, but never auto-enters REVIEW: a click
      // must not risk an accidental verdict.
      ui.setExpandedCluster(cluster.id)
      ui.setActiveCluster(cluster.id)
      useSessions.getState().setPanel(caseId, 'candidates')
      descend({ rect: cluster.bounds })
      return
    }

    if (inspection) {
      // The rail map is a navigation device, not just a readout.
      ui.flyTo({
        slideId: slide.id,
        target: { kind: 'point', x: p.x, y: p.y, mag: useView.getState().mag || DESCENT_MAG },
        animate: true,
      })
      return
    }
    setReticle(p)
  }

  function onDoubleClick(e: React.MouseEvent) {
    const p = toImage(e)
    if (!p) return
    setReticle(p)
    descend(p)
  }

  return (
    <div
      ref={hostRef}
      className={`map map--${variant}${hidden ? ' map--hidden' : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && reticle) { e.preventDefault(); descend(reticle) }
      }}
      tabIndex={variant === 'canvas' && !hidden ? 0 : -1}
      aria-hidden={hidden}
      role="application"
      aria-label="Slide map"
    >
      <canvas ref={canvasRef} className="map__canvas" />
      {variant === 'canvas' && (
        <div className="map__legend">
          <span><i className="map__sw" style={{ background: INK.measured }} /> Measured</span>
          <span><i className="map__sw" style={{ background: INK.inferred }} /> Inferred</span>
          <span><i className="map__sw" style={{ background: INK.dismissed }} /> Dismissed</span>
          <span><i className="map__sw" style={{ background: INK.advisory }} /> Scan QC</span>
          <span className="map__hint">
            {reticle ? 'Enter or double-click to descend' : 'Click to aim · double-click to descend'}
          </span>
        </div>
      )}
      {ws.tissue.state === 'loading' && <div className="map__status">Reading slide…</div>}
      {(ws.tissue.state === 'error' || ws.tissue.state === 'unavailable') && (
        <div className="map__status map__status--error">{ws.tissue.message}</div>
      )}
    </div>
  )
}

/**
 * Substrate, coverage veil, tissue outline and QC hatch. Twenty-one thousand
 * veil cells cannot be repainted on every frame of a pan, so they are painted
 * once and blitted until the trace or the layer set changes.
 */
function buildStaticLayer(
  size: { w: number; h: number },
  dpr: number,
  t: Fit,
  slideW: number,
  slideH: number,
  tissue: TissueData,
  ws: Workspace,
  layers: LayerConfig,
  holdClear: boolean,
): HTMLCanvasElement {
  const off = document.createElement('canvas')
  off.width = Math.round(size.w * dpr)
  off.height = Math.round(size.h * dpr)
  const ctx = off.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const sw = slideW * t.scale
  const sh = slideH * t.scale

  ctx.fillStyle = '#171220'
  ctx.fillRect(t.ox, t.oy, sw, sh)

  // The actual section, read from the pyramid.
  ctx.save()
  ctx.globalAlpha = 0.92
  ctx.drawImage(tissue.image, t.ox, t.oy, sw, sh)
  ctx.restore()

  // Hold-to-clear: the trust contract. One key, and the reader sees tissue.
  if (holdClear) return off

  /* Coverage veil. Unviewed tissue sits under a veil and viewed tissue is
     clear: the system does not paint where you have been, it lifts the veil
     from where you have looked. */
  if (layers.coverage && ws.grid) {
    const cw = tissue.cellW * t.scale + 0.7
    const ch = tissue.cellH * t.scale + 0.7
    for (let gy = 0; gy < tissue.gridH; gy++) {
      for (let gx = 0; gx < tissue.gridW; gx++) {
        const i = gy * tissue.gridW + gx
        const level = ws.grid[i]
        if (level >= DIAGNOSTIC) continue
        if (!tissue.mask[i]) ctx.fillStyle = 'rgba(14, 11, 16, 0.55)'
        else if (level >= ORIENTATION) ctx.fillStyle = 'rgba(14, 11, 16, 0.34)'
        else ctx.fillStyle = 'rgba(14, 11, 16, 0.72)'
        ctx.fillRect(t.sx(gx * tissue.cellW), t.sy(gy * tissue.cellH), cw, ch)
      }
    }
  }

  /* Tissue mask outline — structural tier, thin. */
  if (layers.tissueMask) {
    ctx.save()
    ctx.strokeStyle = INK.tissue
    ctx.globalAlpha = 0.5
    ctx.lineWidth = 1
    ctx.beginPath()
    const cw = tissue.cellW * t.scale
    const ch = tissue.cellH * t.scale
    for (let gy = 0; gy < tissue.gridH; gy++) {
      for (let gx = 0; gx < tissue.gridW; gx++) {
        if (!tissue.mask[gy * tissue.gridW + gx]) continue
        const x = t.sx(gx * tissue.cellW)
        const y = t.sy(gy * tissue.cellH)
        if (gy === 0 || !tissue.mask[(gy - 1) * tissue.gridW + gx]) { ctx.moveTo(x, y); ctx.lineTo(x + cw, y) }
        if (gy === tissue.gridH - 1 || !tissue.mask[(gy + 1) * tissue.gridW + gx]) { ctx.moveTo(x, y + ch); ctx.lineTo(x + cw, y + ch) }
        if (gx === 0 || !tissue.mask[gy * tissue.gridW + gx - 1]) { ctx.moveTo(x, y); ctx.lineTo(x, y + ch) }
        if (gx === tissue.gridW - 1 || !tissue.mask[gy * tissue.gridW + gx + 1]) { ctx.moveTo(x + cw, y); ctx.lineTo(x + cw, y + ch) }
      }
    }
    ctx.stroke()
    ctx.restore()
  }

  /* QC renders from the moment the slide loads, before the reader has done
     anything. It is a property of the image, not an event. */
  if (layers.qc) {
    for (const q of ws.qcRegions) {
      ctx.save()
      ctx.beginPath()
      q.polygon.forEach((p, i) => (i ? ctx.lineTo(t.sx(p.x), t.sy(p.y)) : ctx.moveTo(t.sx(p.x), t.sy(p.y))))
      ctx.closePath()
      ctx.fillStyle = amberHatch()
      ctx.globalAlpha = 0.75
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.strokeStyle = INK.advisory
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.restore()
    }
  }

  return off
}

function drawFrameEdge(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save()
  ctx.strokeStyle = 'rgba(58, 47, 67, 1)'
  ctx.lineWidth = 1
  ctx.setLineDash([])
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
  ctx.restore()
}

function drawPlate(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number, colour: string,
) {
  ctx.save()
  ctx.font = '500 10px "IBM Plex Mono", ui-monospace, monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const w = ctx.measureText(text).width
  ctx.fillStyle = 'rgba(14, 11, 16, 0.82)'
  ctx.fillRect(x - w / 2 - 4, y - 7, w + 8, 14)
  ctx.fillStyle = colour
  ctx.fillText(text, x, y)
  ctx.restore()
}
