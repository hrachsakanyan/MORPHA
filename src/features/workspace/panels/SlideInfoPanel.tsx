import { absoluteDate, analysisLabel, pct, qcLabel } from '@/lib/format'
import { KV, Notice } from '@/components/ui'
import type { Workspace } from '../useWorkspace'

export function SlideInfoPanel({ ws }: { ws: Workspace }) {
  const slide = ws.slide
  if (!slide) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section>
        <div className="typehead"><span style={{ color: 'var(--text)' }}>SLIDE</span></div>
        <KV k="Slide" v={slide.label} />
        <KV k="Block" v={slide.block} />
        <KV k="Stain" v={slide.stain} />
        <KV k="Level" v={slide.level} />
        <KV k="Format" v={<span className={slide.formatSupported ? '' : 'status__warn'}>{slide.format}</span>} />
        <KV k="Dimensions" v={<span className="mono">{slide.width.toLocaleString('en-US')} × {slide.height.toLocaleString('en-US')} px</span>} />
        <KV
          k="MPP"
          v={slide.mpp
            ? <span className="mono">{slide.mpp.toFixed(3)} µm/px</span>
            : <span className="mono" style={{ color: 'var(--advisory)' }}>invalid</span>}
        />
        <KV k="Scanner objective" v={<span className="mono">40× equivalent</span>} />
      </section>

      <section>
        <div className="typehead"><span style={{ color: 'var(--text)' }}>ANALYSIS</span></div>
        <KV k="State" v={analysisLabel(slide.analysis)} />
        {slide.analysisFailReason && <KV k="Reason" v={slide.analysisFailReason} />}
        <KV k="Model" v={slide.model ? `${slide.model.id}` : 'none'} />
        <KV k="Version" v={slide.model ? slide.model.version : '—'} />
        <KV k="Run" v={slide.model ? absoluteDate(slide.model.runAt) : '—'} />
        <KV k="Proposed" v={<span className="mono">{ws.ledger.proposed}</span>} />
        <KV k="Reviewed" v={<span className="mono">{ws.ledger.proposed - ws.ledger.unreviewed} / {ws.ledger.proposed}</span>} />
      </section>

      <section>
        <div className="typehead"><span style={{ color: 'var(--text)' }}>COVERAGE</span></div>
        <KV k="Orientation" v={<span className="mono">{pct(ws.coverage.orientation)}</span>} />
        <KV k="Diagnostic" v={<span className="mono">{pct(ws.coverage.diagnostic)}</span>} />
        <KV k="Unassessable" v={<span className="mono">{pct(ws.unassessableFraction, 1)}</span>} />
        <div className="empty" style={{ marginTop: 6 }}>
          Coverage is a union, per slide, per pathologist. Revisiting adds nothing.
          Dwell duration, view counts and reading speed are not recorded.
        </div>
      </section>

      <section>
        <div className="typehead"><span style={{ color: 'var(--text)' }}>SCAN QC</span></div>
        {ws.model.qcRegions.length === 0 ? (
          <div className="empty">No regions detected.</div>
        ) : (
          ws.model.qcRegions.map((r) => (
            <KV
              key={r.id}
              k={qcLabel(r.type)}
              v={ws.slideSession?.dismissedQcIds.includes(r.id)
                ? <span style={{ color: 'var(--text-faint)' }}>dismissed</span>
                : <span style={{ color: 'var(--advisory)' }}>active</span>}
            />
          ))
        )}
      </section>

      <Notice>
        This demo renders a real breast H&amp;E whole-slide image. Candidate objects,
        clusters and QC regions are synthetic, deterministic per slide, and anchored
        to the actual tissue mask. No inference is performed.
      </Notice>
    </div>
  )
}
