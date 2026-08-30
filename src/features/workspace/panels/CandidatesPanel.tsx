import { REVEAL_THRESHOLD } from '@/domain/constants'
import { CANDIDATE_TYPES } from '@/domain/derive'
import { analysisLabel, pct, typeLabel } from '@/lib/format'
import { Button, Kbd, Notice } from '@/components/ui'
import { useSessions } from '@/state/store'
import { useUi } from '@/state/ui'
import { ClusterCard } from './ClusterCard'
import type { Workspace } from '../useWorkspace'

/**
 * Type → Cluster → Candidate. The list stops at the cluster: individual
 * candidates are never enumerated, because a pathologist counting mitoses is
 * looking for the hotspot, not browsing a catalogue.
 */
export function CandidatesPanel({ ws, caseId }: { ws: Workspace; caseId: string }) {
  const reveal = useSessions((s) => s.reveal)
  const setPanel = useSessions((s) => s.setPanel)
  const ui = useUi()

  const slide = ws.slide
  if (!slide) return null

  const analysed = slide.analysis === 'complete' || slide.analysis === 'partially_analyzed'

  if (!analysed) {
    return (
      <Notice tone={slide.analysis === 'failed' ? 'advisory' : 'neutral'} title={analysisLabel(slide.analysis)}>
        {slide.analysis === 'failed'
          ? <>{slide.analysisFailReason}. The workspace is fully functional; read this slide manually.</>
          : slide.analysis === 'out_of_scope'
            ? 'No model applies to this specimen. This is an ordinary slide.'
            : 'Candidates will appear here when the run completes.'}
      </Notice>
    )
  }

  if (ws.model.candidates.length === 0) {
    return <Notice title="Analysis complete · 0 candidates">
      No candidates were detected on this slide. This is a result, not a failure.
    </Notice>
  }

  if (!ws.slideSession?.revealed) {
    const canReveal = ws.coverage.orientation >= REVEAL_THRESHOLD
    return (
      <Notice tone="inferred" title="Candidates suppressed">
        Read-First: the model&rsquo;s proposals stay hidden until you have oriented
        yourself on this slide, so your first impression of the tissue is your own.
        <div className="mono" style={{ margin: '10px 0', color: 'var(--text-dim)' }}>
          {ws.model.candidates.length} detected · orientation coverage {pct(ws.coverage.orientation)} of {pct(REVEAL_THRESHOLD)}
        </div>
        <Button
          disabled={!canReveal}
          onClick={() => { reveal(caseId, slide.id); ui.announce('Candidates revealed') }}
        >
          Reveal candidates
        </Button>
      </Notice>
    )
  }

  const allReviewed = ws.ledger.unreviewed === 0

  return (
    <div>
      {allReviewed && (
        <Notice tone="measured" title="All candidates reviewed">
          <div className="mono" style={{ color: 'var(--text-dim)' }}>
            {ws.ledger.confirmed} confirmed · {ws.ledger.rejected} rejected · {ws.ledger.reclassified} reclassified
          </div>
          <Button size="sm" style={{ marginTop: 8 }} onClick={() => setPanel(caseId, 'findings')}>
            Review confirmed findings
          </Button>
        </Notice>
      )}

      {CANDIDATE_TYPES.map((type) => {
        const clusters = ws.clusters.filter((c) => c.type === type)
        if (clusters.length === 0) return null
        const total = clusters.reduce((n, c) => n + c.candidateIds.length, 0)
        const reviewed = clusters.reduce((n, c) => n + c.reviewed, 0)
        return (
          <section key={type}>
            <div className="typehead">
              <span style={{ color: 'var(--text)' }}>
                <span style={{ color: 'var(--inferred)' }}>◇</span> {typeLabel(type).toUpperCase()}
              </span>
              <span className="typehead__counts">
                {total} in {clusters.length} cluster{clusters.length === 1 ? '' : 's'} · {reviewed} / {total}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {clusters.map((c) => (
                <ClusterCard
                  key={c.id}
                  cluster={c}
                  ws={ws}
                  caseId={caseId}
                  index={ws.clusters.findIndex((x) => x.id === c.id) + 1}
                />
              ))}
            </div>
          </section>
        )
      })}

      {ws.superseded.length > 0 && slide.previousModel && (
        <section style={{ marginTop: 18 }}>
          <div className="typehead">
            {/* Violet at half strength: still inferred, no longer current. Not
                neutral, because neutral is the dismissed register and nobody
                dismissed these — the analysis was replaced underneath them. */}
            <span style={{ color: 'var(--text)' }}>
              <span style={{ color: 'var(--inferred)', opacity: 0.5 }}>◇↻</span> SUPERSEDED
            </span>
            <span className="typehead__counts">{ws.superseded.length}</span>
          </div>
          <div className="empty" style={{ padding: '2px 0 8px' }}>
            Proposed by {slide.previousModel.id} · {slide.previousModel.version}, replaced by{' '}
            {slide.model?.id ?? 'the current run'}. Retained for audit. No verdict was
            ever recorded against them and they count toward nothing.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {ws.superseded.map((c, i) => (
              <span
                key={c.id}
                className="mono superseded"
                title={`${typeLabel(c.type)} · ${slide.previousModel!.id} ${slide.previousModel!.version} · superseded`}
              >
                #{i + 1}
              </span>
            ))}
          </div>
        </section>
      )}

      <div style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 11, color: 'var(--text-faint)' }}>
        <span><Kbd>Space</Kbd> next unreviewed</span>
        <span><Kbd>C</Kbd> confirm</span>
        <span><Kbd>X</Kbd> reject</span>
        <span><Kbd>R</Kbd> reclassify</span>
        <span><Kbd>Z</Kbd> undo verdict</span>
        <span><Kbd>Tab</Kbd> next cluster</span>
        <span><Kbd>\</Kbd> hold to clear</span>
      </div>
    </div>
  )
}
