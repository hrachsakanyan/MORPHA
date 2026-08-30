import { CANDIDATE_MAG_THRESHOLD, REVEAL_THRESHOLD } from '@/domain/constants'
import { analysisLabel, pct, qcLabel } from '@/lib/format'
import { useSessions } from '@/state/store'
import { useUi } from '@/state/ui'
import { Button, Chip, Eyebrow, ToggleRow } from '@/components/ui'
import { SlideMap } from './SlideMap'
import { INK } from './paint'
import type { Workspace } from './useWorkspace'
import type { LayerConfig, ToolId } from '@/domain/types'

const TOOLS: Array<{ id: ToolId; glyph: string; label: string; key: string; measures: boolean }> = [
  { id: 'point', glyph: '⊹', label: 'Point', key: 'P', measures: false },
  { id: 'polygon', glyph: '▱', label: 'Polygon', key: 'G', measures: false },
  { id: 'frame', glyph: '▭', label: 'Counting frame', key: 'F', measures: true },
  { id: 'distance', glyph: '↔', label: 'Distance', key: 'D', measures: true },
  { id: 'area', glyph: '⬡', label: 'Area', key: 'A', measures: true },
  { id: 'text', glyph: 'T', label: 'Text label', key: 'T', measures: false },
]

export function LeftRail({
  ws, caseId, collapsed,
}: {
  ws: Workspace
  caseId: string
  collapsed: boolean
}) {
  const toggleLayer = useSessions((s) => s.toggleLayer)
  const setTool = useSessions((s) => s.setTool)
  const reveal = useSessions((s) => s.reveal)
  const dismissQc = useSessions((s) => s.dismissQcRegion)
  const restoreQc = useSessions((s) => s.restoreQcRegion)
  const ui = useUi()

  const session = ws.session
  const slide = ws.slide
  const railClass = `rail scroll${collapsed ? ' rail--collapsed' : ''}`
  if (!session || !slide) return <aside className={railClass} />

  const layers = session.layers
  const inspection = ws.slideSession?.spatial === 'inspection'
  const revealed = ws.slideSession?.revealed ?? false
  const canReveal = ws.coverage.orientation >= REVEAL_THRESHOLD
  const analysed = slide.analysis === 'complete' || slide.analysis === 'partially_analyzed'

  const toggle = (k: keyof LayerConfig) => () => toggleLayer(caseId, k)

  const dismissedRegions = ws.model.qcRegions.filter(
    (r) => ws.slideSession?.dismissedQcIds.includes(r.id),
  )

  return (
    <aside className={railClass}>
      {/* The map is contextual here: it occupies the canvas in orientation and
          demotes to this slot in inspection. Same component, same layers. */}
      {inspection && (
        <div className="rail__section">
          <SlideMap ws={ws} caseId={caseId} variant="rail" />
        </div>
      )}

      <div className="rail__section">
        <Eyebrow>Layers</Eyebrow>

        <div className="layers__group">
          <div className="layers__groupHead" style={{ color: INK.measured }}>
            Measured
            <span className="layers__rule" style={{ background: 'rgba(76,201,176,0.35)' }} />
          </div>
          <ToggleRow on={layers.tissueMask} label="Tissue mask" colour={INK.tissue}
            onToggle={toggle('tissueMask')} />
          <ToggleRow
            on={layers.qc}
            label="Scan QC"
            colour={INK.advisory}
            count={ws.qcRegions.length > 0 ? `⚠ ${ws.qcRegions.length}` : undefined}
            disabled={ws.model.qcRegions.length === 0}
            title={ws.model.qcRegions.length === 0 ? 'Scan QC · no regions detected' : undefined}
            onToggle={toggle('qc')}
          />
          <ToggleRow on={layers.coverage} label="Coverage" colour={INK.measured}
            count={pct(ws.coverage.diagnostic)} onToggle={toggle('coverage')} />
          <ToggleRow on={layers.findings} label="Confirmed findings" colour={INK.measured}
            count={ws.findings.length} onToggle={toggle('findings')} />
          <ToggleRow on={layers.marked} label="Marked regions" colour={INK.measured}
            count={ws.annotations.filter((a) => a.kind === 'polygon' || a.kind === 'unassessable').length}
            onToggle={toggle('marked')} />
          <ToggleRow on={layers.frames} label="Counting frames" colour={INK.measured}
            count={ws.frames.length} onToggle={toggle('frames')} />
          <ToggleRow on={layers.measurements} label="Measurements" colour={INK.measured}
            count={ws.annotations.filter((a) => a.kind === 'distance' || a.kind === 'area').length}
            onToggle={toggle('measurements')} />
        </div>

        <div className="layers__group">
          <div className="layers__groupHead" style={{ color: INK.inferred }}>
            Inferred
            <span className="layers__rule" style={{ background: 'rgba(164,111,196,0.35)' }} />
          </div>

          {!analysed ? (
            <AnalysisAbsence ws={ws} />
          ) : ws.model.candidates.length === 0 ? (
            // A legitimate clinical result, stated in the completed-analysis
            // register. Not styled as failure.
            <div className="empty" style={{ padding: '4px 4px 8px' }}>
              Analysis complete · 0 candidates
            </div>
          ) : (
            <>
              <ToggleRow
                on={layers.clusters}
                label="Candidate clusters"
                colour={INK.inferred}
                count={revealed ? ws.clusters.length : ws.model.candidates.length}
                disabled={!revealed}
                onToggle={toggle('clusters')}
                action={
                  revealed ? undefined : (
                    <Button
                      size="sm"
                      disabled={!canReveal}
                      title={
                        canReveal
                          ? 'Reveal model candidates'
                          : `Read-First: available at ${pct(REVEAL_THRESHOLD)} orientation coverage · now ${pct(ws.coverage.orientation)}`
                      }
                      onClick={() => {
                        reveal(caseId, slide.id)
                        ui.announce('Candidates revealed')
                      }}
                    >
                      Reveal
                    </Button>
                  )
                }
              />
              <ToggleRow
                on={layers.candidates}
                label="Individual candidates"
                colour={INK.inferred}
                count={`≥${CANDIDATE_MAG_THRESHOLD}×`}
                disabled={!revealed}
                title={`Microscope only, at or above ${CANDIDATE_MAG_THRESHOLD}×`}
                onToggle={toggle('candidates')}
              />
              {revealed && ws.superseded.length > 0 && slide.previousModel && (
                <div className="empty" style={{ padding: '2px 4px 6px' }}>
                  <span style={{ color: INK.inferred, opacity: 0.5 }}>◇↻</span>{' '}
                  {ws.superseded.length} superseded by {slide.model?.id ?? 'the current run'} ·
                  retained for audit, counted in nothing
                </div>
              )}
              {!revealed && (
                <div className="empty" style={{ padding: '2px 4px 6px' }}>
                  {ws.model.candidates.length} candidates detected · suppressed until reveal.
                  Orientation coverage {pct(ws.coverage.orientation)} of {pct(REVEAL_THRESHOLD)}.
                </div>
              )}
            </>
          )}
        </div>

        <div className="layers__group">
          <div className="layers__groupHead" style={{ color: 'var(--text-faint)' }}>
            Dismissed
            <span className="layers__rule" style={{ background: 'var(--hairline-strong)' }} />
          </div>
          <ToggleRow on={layers.rejected} label="Rejected candidates" colour={INK.dismissed}
            count={ws.ledger.rejected} onToggle={toggle('rejected')} />
        </div>
      </div>

      <div className="rail__section">
        <Eyebrow>Tools</Eyebrow>
        <div className="tools">
          {TOOLS.map((t) => {
            const on = session.activeToolId === t.id
            const disabled = t.measures && !ws.measurementEnabled
            return (
              <button
                key={t.id}
                type="button"
                className={`tool${on ? ' tool--on' : ''}`}
                disabled={disabled || ws.readOnly}
                aria-pressed={on}
                title={
                  disabled
                    ? 'Measurement disabled — slide scale unavailable'
                    : `${t.label} · ${t.key}`
                }
                onClick={() => {
                  if (on) setTool(caseId, 'navigate', null)
                  else {
                    setTool(
                      caseId,
                      t.id === 'frame' ? 'frame'
                        : t.id === 'distance' || t.id === 'area' ? 'measure' : 'annotate',
                      t.id,
                    )
                    ui.setFocusedCandidate(null)
                  }
                }}
              >
                {t.glyph}
              </button>
            )
          })}
        </div>
        {!ws.measurementEnabled && (
          <div className="empty">
            Scale unavailable — measurement, counting frame and density are disabled.
            MPP is never estimated.
          </div>
        )}
      </div>

      {/* QC is a persistent property of the image, not an event. It appears
          without being requested and never interrupts. */}
      {(ws.qcRegions.length > 0 || dismissedRegions.length > 0) && (
        <div className="rail__section">
          <Eyebrow>Scan QC</Eyebrow>
          <div style={{ fontSize: 12, color: 'var(--advisory)' }}>
            {ws.qcRegions.length} region{ws.qcRegions.length === 1 ? '' : 's'} ·{' '}
            {pct(ws.unassessableFraction, 1)} unassessable
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
            {ws.qcRegions.map((r) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Chip tone="advisory">{qcLabel(r.type)}</Chip>
                <Button
                  size="sm" variant="ghost"
                  title="QC is advisory input, not authority. Dismissing returns this area to the coverage denominator."
                  onClick={() => dismissQc(caseId, slide.id, r.id)}
                >
                  Dismiss
                </Button>
              </div>
            ))}
            {dismissedRegions.map((r) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.6 }}>
                <Chip tone="neutral">{qcLabel(r.type)} dismissed</Chip>
                <Button size="sm" variant="ghost" onClick={() => restoreQc(caseId, slide.id, r.id)}>
                  Restore
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  )
}

/** Every AI-absence state leaves the instrument fully functional. */
function AnalysisAbsence({ ws }: { ws: Workspace }) {
  const s = ws.slide!
  if (s.analysis === 'failed') {
    return (
      <div className="empty" style={{ color: 'var(--advisory)', padding: '4px 4px 8px' }}>
        Analysis failed · {s.analysisFailReason ?? 'unknown reason'}
        <div style={{ marginTop: 6 }}>
          <Button size="sm" title="Re-request analysis for this slide">Retry</Button>
        </div>
      </div>
    )
  }
  if (s.analysis === 'out_of_scope') {
    return <div className="empty" style={{ padding: '4px 4px 8px' }}>No model applies to this specimen.</div>
  }
  if (s.analysis === 'queued' || s.analysis === 'analyzing') {
    return (
      <div className="empty" style={{ padding: '4px 4px 8px' }}>
        {analysisLabel(s.analysis)} · candidates will appear when the run completes.
      </div>
    )
  }
  return <div className="empty" style={{ padding: '4px 4px 8px' }}>Candidates · not available</div>
}
