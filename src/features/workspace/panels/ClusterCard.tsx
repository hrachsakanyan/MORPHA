import { DISMISS_REASONS, REVIEW_MAG } from '@/domain/constants'
import { latestVerdicts } from '@/domain/derive'
import { mm2, typeLabel } from '@/lib/format'
import { Button, StackedBar } from '@/components/ui'
import { INK } from '../paint'
import { useSessions } from '@/state/store'
import { useUi } from '@/state/ui'
import type { ClusterView, Workspace } from '../useWorkspace'

export function ClusterCard({
  cluster, ws, caseId, index,
}: {
  cluster: ClusterView
  ws: Workspace
  caseId: string
  index: number
}) {
  const ui = useUi()
  const setSpatial = useSessions((s) => s.setSpatial)
  const dismissCluster = useSessions((s) => s.dismissCluster)
  const active = ui.activeClusterId === cluster.id
  const dismissing = ui.chipStrip?.kind === 'dismiss-cluster' && ui.chipStrip.clusterId === cluster.id

  const total = cluster.candidateIds.length
  const heads = ws.session ? latestVerdicts(ws.session.verdicts) : new Map()

  function go() {
    if (!ws.slide) return
    ui.setActiveCluster(cluster.id)
    ui.setExpandedCluster(cluster.id)
    // Descends and fits, but does not auto-enter REVIEW.
    setSpatial(caseId, ws.slide.id, 'inspection')
    ui.flyTo({ slideId: ws.slide.id, target: { kind: 'rect', rect: cluster.bounds }, animate: true })
  }

  function startReview() {
    if (!ws.slide) return
    const next = cluster.candidateIds.find((id) => !heads.has(id))
    if (!next) return
    const cand = ws.model.byId.get(next)
    if (!cand) return
    ui.setActiveCluster(cluster.id)
    ui.setFocusedCandidate(next)
    useSessions.getState().setTool(caseId, 'review', null)
    setSpatial(caseId, ws.slide.id, 'inspection')
    ui.flyTo({
      slideId: ws.slide.id,
      target: { kind: 'point', x: cand.x, y: cand.y, mag: REVIEW_MAG },
      animate: true,
    })
  }

  function dismiss(reason: (typeof DISMISS_REASONS)[number]) {
    if (!ws.slide) return
    // QC-affected candidates are excluded from bulk dismissal and must be
    // dispositioned individually — the reader handles the ambiguous ones.
    const targets = cluster.candidateIds.filter((id) => {
      if (heads.has(id)) return false
      return !ws.model.byId.get(id)?.qcAffected
    })
    dismissCluster(caseId, ws.slide.id, targets, reason)
    ui.setChipStrip(null)
    ui.announce(`${targets.length} candidates dismissed as ${reason}`)
  }

  const unreviewedQc = cluster.candidateIds.filter(
    (id) => !heads.has(id) && ws.model.byId.get(id)?.qcAffected,
  ).length

  return (
    <div
      className={[
        'cluster',
        active ? 'cluster--active' : '',
        cluster.complete ? 'cluster--complete' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="cluster__head">
        <span className="cluster__title">
          <span style={{ color: INK.inferred }}>◇</span>
          {cluster.type === 'mitotic_figure' ? 'Mitotic hotspot' : typeLabel(cluster.type)}
        </span>
        <span className="cluster__rank">Rank {index}</span>
      </div>

      <div className="cluster__meta">{total} candidates · {mm2(cluster.areaMm2)}</div>

      <div className="cluster__row">
        <span>Score</span>
        <StackedBar
          segments={[
            { value: cluster.bandCounts.high, colour: INK.inferred, title: `High ${cluster.bandCounts.high}` },
            { value: cluster.bandCounts.moderate, colour: 'rgba(164,111,196,0.6)', title: `Moderate ${cluster.bandCounts.moderate}` },
            { value: cluster.bandCounts.low, colour: 'rgba(164,111,196,0.3)', title: `Low ${cluster.bandCounts.low}` },
          ]}
        />
        <span className="mono">
          H {cluster.bandCounts.high} M {cluster.bandCounts.moderate} L {cluster.bandCounts.low}
        </span>
      </div>

      <div className="cluster__row">
        <span>Review</span>
        <StackedBar
          segments={[
            { value: cluster.confirmed, colour: INK.measured, title: `Confirmed ${cluster.confirmed}` },
            { value: cluster.reclassified, colour: 'rgba(76,201,176,0.55)', title: `Reclassified ${cluster.reclassified}` },
            { value: cluster.rejected, colour: INK.dismissed, title: `Rejected ${cluster.rejected}` },
            { value: total - cluster.reviewed, colour: 'var(--bg-3)', title: `Unreviewed ${total - cluster.reviewed}` },
          ]}
        />
        <span className="mono">{cluster.reviewed} / {total}</span>
      </div>

      {cluster.qcAffectedCount > 0 && (
        <div className="cluster__qc">⚠ {cluster.qcAffectedCount} candidates in QC region</div>
      )}

      {dismissing ? (
        <div className="cluster__actions" style={{ flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--text-faint)', width: '100%' }}>
            Reason for dismissal
            {unreviewedQc > 0 && ` · ${unreviewedQc} QC-affected candidates are excluded`}
          </span>
          {DISMISS_REASONS.map((r) => (
            <Button key={r} size="sm" onClick={() => dismiss(r)}>{r}</Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => ui.setChipStrip(null)}>Cancel</Button>
        </div>
      ) : (
        <div className="cluster__actions">
          <Button size="sm" onClick={go}>Go</Button>
          <Button
            size="sm"
            variant="primary"
            disabled={cluster.complete || ws.readOnly}
            onClick={startReview}
            title="Space"
          >
            Review
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={cluster.complete || ws.readOnly}
            onClick={() => ui.setChipStrip({ kind: 'dismiss-cluster', clusterId: cluster.id })}
          >
            Dismiss
          </Button>
        </div>
      )}
    </div>
  )
}
