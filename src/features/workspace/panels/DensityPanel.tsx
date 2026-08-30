import { useEffect, useRef, useState } from 'react'
import { computeDensity } from '@/domain/density'
import { latestVerdicts } from '@/domain/derive'
import { absoluteDate, mm2, timeHM, typeLabel } from '@/lib/format'
import { Button, Notice } from '@/components/ui'
import { useSessions } from '@/state/store'
import { useUi } from '@/state/ui'
import type { Workspace } from '../useWorkspace'

/**
 * The equation, made literal.
 *
 * Rendered as a visible fraction — numerator over rule over denominator over
 * result — rather than as a number with metadata beneath it. The product's core
 * claim is carried by the denominator, and a denominator listed as a footnote
 * reads as provenance rather than as the substance of the measurement.
 */
export function DensityPanel({ ws, caseId }: { ws: Workspace; caseId: string }) {
  const ui = useUi()
  const setTool = useSessions((s) => s.setTool)
  const setSpatial = useSessions((s) => s.setSpatial)

  const slide = ws.slide
  if (!slide) return null

  if (!ws.measurementEnabled || !slide.mpp) {
    return (
      <Notice tone="advisory" title="Scale unavailable">
        This slide has no valid microns-per-pixel value. Measurement, the counting
        frame and mitotic density are disabled. MORPHA does not estimate MPP: a
        wrong denominator produces a wrong density that looks exactly like a right one.
      </Notice>
    )
  }

  const mpp = slide.mpp
  const frame =
    ws.frames.find((f) => f.id === ui.selectedFrameId) ?? ws.frames[ws.frames.length - 1]

  const heads = ws.session ? latestVerdicts(ws.session.verdicts.filter((v) => v.slideId === slide.id)) : new Map()
  const rejectedPoints = ws.model.candidates
    .filter((c) => heads.get(c.id)?.kind === 'rejected')
    .map((c) => ({ id: c.id, x: c.x, y: c.y }))

  const cluster = ws.clusters.find((c) => c.id === ui.activeClusterId)

  if (!frame) {
    // With no frame the panel shows the confirmed count and states plainly that
    // density is unavailable. Never a zero, a dash or a provisional value.
    const confirmedMitoses = ws.findings.filter((f) => f.type === 'mitotic_figure').length
    return (
      <div className="density">
        <Notice tone="advisory" title="No counting frame">
          <div className="mono" style={{ color: 'var(--text)', margin: '6px 0' }}>
            Confirmed mitoses on this slide: {confirmedMitoses}
          </div>
          Density unavailable — a count without a denominator is not a density.
          <div style={{ marginTop: 10 }}>
            <Button
              onClick={() => {
                setSpatial(caseId, slide.id, 'inspection')
                setTool(caseId, 'frame', 'frame')
              }}
            >
              Draw a counting frame · F
            </Button>
          </div>
        </Notice>

        {cluster && (
          <div className="trace">
            <div className="trace__row">
              <span className="trace__k">Cluster</span>
              <span>{cluster.type === 'mitotic_figure' ? 'Mitotic hotspot' : typeLabel(cluster.type)}</span>
              <span />
            </div>
            <div className="trace__row">
              <span className="trace__k">Reviewed</span>
              <span className="mono">{cluster.reviewed} / {cluster.candidateIds.length}</span>
              <span />
            </div>
            <div className="trace__row">
              <span className="trace__k">Verdicts</span>
              <span className="mono">
                {cluster.confirmed} confirmed · {cluster.rejected} rejected · {cluster.reclassified} reclassified
              </span>
              <span />
            </div>
          </div>
        )}
      </div>
    )
  }

  const result = computeDensity(frame, mpp, ws.findings, ws.qcRegions, rejectedPoints)

  return (
    <div className="density">
      {ws.frames.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {ws.frames.map((f) => (
            <Button
              key={f.id}
              size="sm"
              variant={f.id === frame.id ? 'primary' : 'default'}
              onClick={() => ui.setSelectedFrame(f.id)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      )}

      <div className="fraction">
        <EasedNumber className="fraction__num" value={result.confirmed.length} digits={0} />
        <span className="fraction__label">confirmed mitoses</span>
        <span className="fraction__rule" />
        <span className="fraction__den">{mm2(result.effectiveAreaMm2)}</span>
        <span className="fraction__label">measured counting area</span>
        <span className="fraction__eq">=</span>
        {result.density === null ? (
          <span className="fraction__den" style={{ color: 'var(--advisory)' }}>unavailable</span>
        ) : (
          <EasedNumber className="fraction__result" value={result.density} digits={1} />
        )}
        <span className="fraction__unit">mitoses / mm²</span>
        <div className="fraction__derived">Derived from pathologist-confirmed findings</div>
      </div>

      {/* Every element of the density is a spatial link, in both directions. */}
      <div className="trace">
        <TraceRow
          k="Frame"
          v={`${frame.label} · drawn ${timeHM(frame.createdAt)}`}
          onShow={() => {
            ui.setSelectedFrame(frame.id)
            setSpatial(caseId, slide.id, 'inspection')
            ui.flyTo({ slideId: slide.id, target: { kind: 'rect', rect: result.rect }, animate: true })
          }}
        />
        <TraceRow
          k="Within frame"
          v={`${result.confirmed.length} confirmed · ${result.rejectedInFrameIds.length} rejected`}
          onShow={() => {
            // A fly-back that lands on invisible evidence is a broken link.
            useSessions.getState().forceLayers(caseId, { findings: true, rejected: true })
            ui.setFocusedFindings(result.confirmed.map((f) => f.id))
            setSpatial(caseId, slide.id, 'inspection')
            ui.flyTo({ slideId: slide.id, target: { kind: 'rect', rect: result.rect }, animate: true })
          }}
        />
        <div className="trace__row">
          <span className="trace__k">Frame area</span>
          <span className="mono">{mm2(result.areaMm2)}</span>
          <span />
        </div>
        <div className="trace__row">
          <span className="trace__k">Excluded</span>
          <span className="mono">
            {mm2(result.excludedMm2)} for scan quality
          </span>
          <span />
        </div>
        <div className="trace__row">
          <span className="trace__k">Model</span>
          <span className="mono">
            {slide.model ? `${slide.model.id}` : 'no model'}
          </span>
          <span
            title={slide.model ? `${slide.model.version} · run ${absoluteDate(slide.model.runAt)}` : ''}
            style={{ color: 'var(--text-faint)' }}
          >
            ⓘ
          </span>
        </div>
        <div className="trace__row">
          <span className="trace__k">Author</span>
          <span>{frame.by}</span>
          <span />
        </div>
      </div>

      <div className="empty">
        The numerator is your confirmed mitoses; the denominator is the frame you
        drew, measured from a scanner-reported 0.248 µm/px. Both halves are human.
      </div>
    </div>
  )
}

function TraceRow({ k, v, onShow }: { k: string; v: string; onShow: () => void }) {
  return (
    <div className="trace__row">
      <span className="trace__k">{k}</span>
      <span className="mono">{v}</span>
      <button type="button" className="link" onClick={onShow}>Show</button>
    </div>
  )
}

/** The recompute is eased and visible: the reader watches their judgement change the number. */
function EasedNumber({
  value, digits, className,
}: {
  value: number
  digits: number
  className?: string
}) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  const raf = useRef(0)

  useEffect(() => {
    const start = performance.now()
    const a = from.current
    const b = value
    if (a === b) return
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 200)
      const eased = 1 - (1 - k) ** 3
      setShown(a + (b - a) * eased)
      if (k < 1) raf.current = requestAnimationFrame(tick)
      else from.current = b
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [value])

  return <span className={className}>{shown.toFixed(digits)}</span>
}
