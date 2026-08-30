import { Fragment } from 'react'
import { AnalysisDot, PriorityChip, QcMark, ReadinessMark, StatusChip } from '@/components/glyphs'
import { Button, MicroBar } from '@/components/ui'
import { analysisLabel, absoluteDate, pct, relativeAge } from '@/lib/format'
import { latestVerdicts, readinessGlyph, slideQcState, caseQcState } from '@/domain/derive'
import type { CaseDef, CaseSession, CaseStatus } from '@/domain/types'

/**
 * One worklist row. Everything visible here serves triage; everything else waits
 * for the expansion, which is inline and pushes rows down — not a drawer, not a
 * modal, not a preview pane.
 */
export function LibraryRow({
  def, status, session, expanded, onToggle, onOpen,
}: {
  def: CaseDef
  status: CaseStatus
  session: CaseSession | undefined
  expanded: boolean
  onToggle: () => void
  onOpen: () => void
}) {
  const readiness = readinessGlyph(def.slides)
  const qc = caseQcState(def.slides)
  const hasSession = Boolean(session) || Boolean(def.seededSession)
  const showProgress = status === 'in_review' || status === 'paused'

  const confirmed = session
    ? [...latestVerdicts(session.verdicts).values()].filter((v) => v.kind === 'confirmed').length
    : 0

  return (
    <Fragment>
      <tr
        className={[
          'lib__row',
          expanded ? 'lib__row--expanded' : '',
          status === 'finalized' ? 'lib__row--finalized' : '',
        ].filter(Boolean).join(' ')}
      >
        <td>
          <button
            type="button"
            className={`lib__chevron${expanded ? ' lib__chevron--open' : ''}`}
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={expanded ? `Collapse ${def.accession}` : `Expand ${def.accession}`}
          >
            ›
          </button>
        </td>

        <td className="lib__accession">{def.accession}</td>

        <td>
          <div className="lib__specimen">
            <div>{def.specimen}</div>
            {/* Laterality is displayed in the worklist, the case bar and the
                Record — three times, unmissable. */}
            <div className="lib__laterality">{def.laterality}</div>
          </div>
        </td>

        <td>{def.procedure}</td>
        <td><PriorityChip priority={def.priority} /></td>
        <td><StatusChip status={status} reason={session?.pauseReason ?? def.pauseReason} /></td>

        <td>
          <div className="lib__slides">
            <span className="mono">{def.slides.length}</span>
            <ReadinessMark glyph={readiness} />
            <QcMark state={qc} />
          </div>
        </td>

        <td>
          {showProgress ? (
            <div className="lib__progress">
              <div className="lib__bars">
                {def.slides.map((s) => {
                  const st = session?.perSlide[s.id]?.stats
                  return (
                    <MicroBar
                      key={s.id}
                      value={st?.diagnostic ?? 0}
                      width={26}
                      title={
                        st
                          ? `${s.label} · diagnostic ${pct(st.diagnostic)} · orientation ${pct(st.orientation)}`
                          : `${s.label} · not opened`
                      }
                    />
                  )
                })}
              </div>
              <span className="mono" style={{ color: 'var(--text-faint)', fontSize: 11 }}>
                {confirmed} confirmed
              </span>
            </div>
          ) : (
            <span style={{ color: 'var(--text-faint)' }}>—</span>
          )}
        </td>

        <td>
          <span className="mono" title={absoluteDate(def.receivedAt)}>
            {relativeAge(def.receivedAt)}
          </span>
        </td>

        <td>{def.assignedTo}</td>

        <td>
          <Button variant={hasSession ? 'primary' : 'default'} onClick={onOpen}>
            {hasSession ? 'Resume' : 'Open'}
          </Button>
        </td>
      </tr>

      {expanded && (
        <tr className="lib__exp">
          <td colSpan={11}>
            <div className="lib__expInner">
              <div>
                <table className="lib__slideTable">
                  <thead>
                    <tr>
                      <th>Slide</th><th>Block</th><th>Stain</th><th>Level</th>
                      <th>Analysis</th><th>QC</th><th>Coverage</th><th>Candidates</th>
                    </tr>
                  </thead>
                  <tbody>
                    {def.slides.map((s) => {
                      const st = session?.perSlide[s.id]?.stats
                      const slideQc = slideQcState(s)
                      const candidateCount = s.synth?.clusters.reduce((n, c) => n + c.members, 0) ?? 0
                      const analysed = s.analysis === 'complete' || s.analysis === 'partially_analyzed'
                      return (
                        <tr key={s.id}>
                          <td style={{ color: 'var(--text)' }}>{s.label}</td>
                          <td>{s.block}</td>
                          <td>{s.stain}</td>
                          <td>{s.level}</td>
                          <td>
                            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                              <AnalysisDot state={s.analysis} />
                              {analysisLabel(s.analysis)}
                              {s.analysisFailReason && (
                                <span style={{ color: 'var(--advisory)' }}>· {s.analysisFailReason}</span>
                              )}
                              {!s.formatSupported && (
                                <span style={{ color: 'var(--advisory)' }}>· {s.format} not supported</span>
                              )}
                            </span>
                          </td>
                          <td>
                            {slideQc === 'clean' ? (
                              <span style={{ color: 'var(--text-faint)' }}>—</span>
                            ) : (
                              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                                <QcMark state={slideQc} />
                                {(s.synth?.qc.length ?? 0)} region{(s.synth?.qc.length ?? 0) === 1 ? '' : 's'}
                              </span>
                            )}
                          </td>
                          <td className="mono">
                            {st ? `${pct(st.orientation)} / ${pct(st.diagnostic)}` : '— / —'}
                          </td>
                          <td className="mono">{analysed ? candidateCount : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Clinical context</div>
                <p className="lib__note" style={{ margin: '0 0 16px' }}>{def.clinicalNote}</p>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Last activity</div>
                <div className="lib__note">
                  {def.lastActivity
                    ? `${def.lastActivity.what} · ${def.lastActivity.by} · ${absoluteDate(def.lastActivity.at)}`
                    : session
                      ? `Session updated ${absoluteDate(session.updatedAt)}`
                      : 'No activity recorded'}
                </div>
                <div className="lib__note" style={{ marginTop: 12, color: 'var(--text-faint)' }}>
                  Readiness · {analysisLabel(def.slides[0]?.analysis ?? 'not_available')} across{' '}
                  {def.slides.length} slide{def.slides.length === 1 ? '' : 's'}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  )
}
