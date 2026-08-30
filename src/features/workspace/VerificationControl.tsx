import { useEffect, useRef, useState } from 'react'
import { RECLASSIFY_TARGETS } from '@/domain/constants'
import { verdictHistory } from '@/domain/derive'
import { absoluteDate, typeLabel } from '@/lib/format'
import { useSessions } from '@/state/store'
import { useUi } from '@/state/ui'
import { Kbd } from '@/components/ui'
import type { Workspace } from './useWorkspace'
import type { FindingType } from '@/domain/types'
import './verification.css'

/**
 * The membrane crossing, and the only element permitted to float over tissue.
 * Anchored below the focused candidate, offset so it never covers the object
 * being judged, and repositioned when the candidate is near a canvas edge.
 */
export function VerificationControl({
  ws, caseId, anchor,
}: {
  ws: Workspace
  caseId: string
  anchor: { x: number; y: number }
}) {
  const ui = useUi()
  const recordVerdict = useSessions((s) => s.recordVerdict)
  const ref = useRef<HTMLDivElement>(null)
  const [flip, setFlip] = useState(false)
  const [width, setWidth] = useState(0)

  const candidate = ui.focusedCandidateId ? ws.model.byId.get(ui.focusedCandidateId) : null
  const showDetail = ui.detailPopoverCandidateId === candidate?.id
  const reclassifying = ui.chipStrip?.kind === 'reclassify'

  useEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.offsetWidth)
    const parent = el.parentElement
    if (!parent) return
    setFlip(anchor.y + el.offsetHeight + 16 > parent.clientHeight)
  }, [anchor.y, reclassifying, candidate?.id])

  if (!candidate || !ws.slide || ws.readOnly) return null

  const cluster = ws.clusters.find((c) => c.id === candidate.clusterId)
  const position = cluster ? cluster.candidateIds.indexOf(candidate.id) + 1 : 0
  const total = cluster?.candidateIds.length ?? 0
  const history = ws.session ? verdictHistory(ws.session.verdicts, candidate.id) : []
  const current = history[history.length - 1]

  function verdict(kind: 'confirmed' | 'rejected') {
    if (!ws.slide || !candidate) return
    recordVerdict(caseId, ws.slide.id, candidate.id, kind)
    ui.setChipStrip(null)
    ui.announce(`${kind === 'confirmed' ? 'Confirmed' : 'Rejected'} ${typeLabel(candidate.type)}`)
  }

  function reclassify(to: FindingType) {
    if (!ws.slide || !candidate) return
    recordVerdict(caseId, ws.slide.id, candidate.id, 'reclassified', to)
    ui.setChipStrip(null)
    ui.announce(`Reclassified as ${typeLabel(to)}`)
  }

  const left = Math.max(12, Math.min(anchor.x - width / 2, (ref.current?.parentElement?.clientWidth ?? 1200) - width - 12))

  return (
    <div
      ref={ref}
      className="vc"
      style={{
        left,
        top: flip ? undefined : anchor.y,
        bottom: flip ? 24 : undefined,
      }}
      role="group"
      aria-label="Candidate verification"
    >
      <div className="vc__head">
        <span className="vc__type">
          <span style={{ color: 'var(--inferred)' }}>◇</span> {typeLabel(candidate.type)}
          <span className="vc__band"> · {candidate.band}</span>
          {candidate.qcAffected && <span className="vc__qc"> · ⚠ in QC region</span>}
        </span>
        <span className="mono vc__pos">{position} / {total}</span>
      </div>

      {current && (
        <div className="vc__prior">
          Currently {current.kind}
          {current.reclassifiedTo ? ` as ${typeLabel(current.reclassifiedTo)}` : ''} · editable
        </div>
      )}

      {reclassifying ? (
        <div className="vc__chips">
          <span className="vc__chipsLabel">Reclassify as:</span>
          {RECLASSIFY_TARGETS.map((t, i) => (
            <button key={t} type="button" className="vc__chip" onClick={() => reclassify(t)}>
              <Kbd>{i + 1}</Kbd> {typeLabel(t)}
            </button>
          ))}
          <span className="vc__cancel">Esc to cancel</span>
        </div>
      ) : (
        <div className="vc__actions">
          <button type="button" className="vc__btn vc__btn--confirm" onClick={() => verdict('confirmed')}>
            Confirm <Kbd>C</Kbd>
          </button>
          <button type="button" className="vc__btn vc__btn--reject" onClick={() => verdict('rejected')}>
            Reject <Kbd>X</Kbd>
          </button>
          <button
            type="button"
            className="vc__btn"
            onClick={() => ui.setChipStrip({ kind: 'reclassify' })}
          >
            Reclassify <Kbd>R</Kbd>
          </button>
          <button
            type="button"
            className="vc__info"
            aria-label="Technical detail"
            aria-expanded={showDetail}
            onClick={() => ui.setDetailPopover(showDetail ? null : candidate.id)}
          >
            ⓘ
          </button>
        </div>
      )}

      {showDetail && (
        <div className="vc__detail">
          {/* The raw score lives here and nowhere else. */}
          <Row k="Raw score" v={candidate.score.toFixed(4)} />
          <Row k="Score band" v={candidate.band} />
          <Row k="Model" v={ws.slide.model ? `${ws.slide.model.id} · ${ws.slide.model.version}` : 'unknown'} />
          <Row k="Run" v={ws.slide.model ? absoluteDate(ws.slide.model.runAt) : '—'} />
          <Row k="Geometry" v={`circle r=${Math.round(candidate.r)} px`} />
          <Row k="Centroid" v={`${Math.round(candidate.x)}, ${Math.round(candidate.y)}`} />
          <Row k="QC" v={candidate.qcAffected ? 'inside QC region' : 'clear'} />
          {history.length > 0 && (
            <div className="vc__history">
              {history.map((h) => (
                <div key={h.id}>
                  {h.kind}
                  {h.reclassifiedTo ? ` → ${typeLabel(h.reclassifiedTo)}` : ''} · {h.by} · {absoluteDate(h.at)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="vc__row">
      <span>{k}</span>
      <span className="mono">{v}</span>
    </div>
  )
}
