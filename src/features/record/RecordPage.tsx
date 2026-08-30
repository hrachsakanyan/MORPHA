import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { findCase } from '@/domain/cases'
import { analysisLabel, mm2, pct, timeHM, typeLabel } from '@/lib/format'
import { groupFindings, originCounts } from '@/domain/derive'
import { frameRect } from '@/domain/density'
import { Button, Chip, Eyebrow, MicroBar, Notice } from '@/components/ui'
import { CaseBar } from '@/features/workspace/CaseBar'
import { useSessions } from '@/state/store'
import { useUi } from '@/state/ui'
import { useCaseEvidence } from './useCaseEvidence'
import { FLYBACK_LAYERS } from './flyback'
import { OpenItemsSheet } from './OpenItemsSheet'
import type { Finding, Rect } from '@/domain/types'
import './record.css'

/**
 * The Record is an evidence document, not a summary dashboard. Order is by
 * evidential weight, and every value in both columns is a link back to tissue.
 */
export function RecordPage() {
  const { caseId = '' } = useParams()
  const navigate = useNavigate()
  const def = findCase(caseId)
  const session = useSessions((s) => s.sessions[caseId])
  const setStatus = useSessions((s) => s.setStatus)
  const setActiveSlide = useSessions((s) => s.setActiveSlide)
  const setSpatial = useSessions((s) => s.setSpatial)
  const forceLayers = useSessions((s) => s.forceLayers)
  const setPanel = useSessions((s) => s.setPanel)
  const ui = useUi()

  const ev = useCaseEvidence(def, caseId)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ findings: true })
  const [sheet, setSheet] = useState(false)

  /**
   * Tissue → Record (§J.4). An object arriving from the workspace opens its
   * section, scrolls itself into view and takes focus styling. The highlight is
   * cleared on the way out, not on the way in — clearing it on mount is what
   * would throw away the thing we were sent here to show.
   */
  const highlightId = ui.recordHighlightId
  useEffect(() => () => { useUi.getState().setRecordHighlight(null) }, [])

  useEffect(() => {
    if (!highlightId) return
    const section = ev.findings.some((f) => f.id === highlightId) ? 'findings'
      : ev.rejected.some((r) => r.candidateId === highlightId) ? 'rejected'
      : 'geometry'
    setExpanded((x) => (x[section] ? x : { ...x, [section]: true }))
  }, [highlightId, ev.findings, ev.rejected])

  useEffect(() => {
    if (!highlightId) return
    // One frame after the section opens, so the node exists to scroll to.
    const t = window.setTimeout(() => {
      document.querySelector(`[data-rec-id="${CSS.escape(highlightId)}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 60)
    return () => window.clearTimeout(t)
  }, [highlightId, expanded])

  if (!def) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
        <Button onClick={() => navigate('/library')}>Case Library</Button>
      </div>
    )
  }
  if (!session) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--text-dim)' }}>This case has not been opened yet.</p>
          <Button onClick={() => navigate(`/case/${caseId}`)}>Open the workspace</Button>
        </div>
      </div>
    )
  }

  const readOnly = session.status === 'finalized'

  /**
   * Fly-back. The Workspace returns at the correct slide, viewport and zoom, and
   * the layers the evidence needs are forced visible — a fly-back that lands on
   * invisible evidence is a broken link.
   */
  function flyBack(opts: {
    slideId: string
    target: { kind: 'point'; x: number; y: number; mag: number } | { kind: 'rect'; rect: Rect }
    layers?: Parameters<typeof forceLayers>[1]
    findingIds?: string[]
    spatial?: 'orientation' | 'inspection'
  }) {
    setActiveSlide(caseId, opts.slideId)
    if (opts.layers) forceLayers(caseId, opts.layers)
    setSpatial(caseId, opts.slideId, opts.spatial ?? 'inspection')
    ui.setFocusedFindings(opts.findingIds ?? [])
    ui.flyTo({ slideId: opts.slideId, target: opts.target, animate: false })
    navigate(`/case/${caseId}`)
  }

  function flyToFinding(f: Finding) {
    flyBack({
      slideId: f.slideId,
      target: { kind: 'point', x: f.x, y: f.y, mag: f.mag },
      layers: FLYBACK_LAYERS.finding,
      findingIds: [f.id],
    })
  }

  const toggle = (k: string) => () => setExpanded((e) => ({ ...e, [k]: !e[k] }))
  const groups = groupFindings(ev.findings)
  const geometry = session.annotations.filter((a) => a.kind !== 'point')

  return (
    <div className="rec">
      <CaseBar
        def={def}
        session={session}
        backTo={{ href: `/case/${caseId}`, label: '← Workspace' }}
      />

      <div className="rec__main">
        <main className="rec__stream scroll">
          <div className="rec__inner">
            {/* 1 · Derived quantities — the assertions with the most riding on them. */}
            <section className="rec__block">
              <Eyebrow>Mitotic density</Eyebrow>
              {ev.density ? (
                <div className="rec__hero">
                  <div className="rec__fraction">
                    <span className="rec__num">{ev.density.result.confirmed.length}</span>
                    <span className="rec__rule" />
                    <span className="rec__den">{mm2(ev.density.result.effectiveAreaMm2)}</span>
                  </div>
                  <div className="rec__eq">=</div>
                  <div>
                    <div className="rec__result">
                      {ev.density.result.density === null ? '—' : ev.density.result.density.toFixed(1)}
                    </div>
                    <div className="rec__unit">mitoses / mm² · slide {ev.density.slide.label}</div>
                  </div>
                  <div className="rec__heroLinks">
                    <button
                      className="link"
                      onClick={() => ev.density && flyBack({
                        slideId: ev.density.slide.id,
                        target: { kind: 'rect', rect: frameRect(ev.density.result.frame) },
                        layers: FLYBACK_LAYERS.density,
                        findingIds: ev.density.result.confirmed.map((f) => f.id),
                      })}
                    >
                      → counting frame
                    </button>
                    <button
                      className="link"
                      onClick={() => ev.density && flyBack({
                        slideId: ev.density.slide.id,
                        target: { kind: 'rect', rect: frameRect(ev.density.result.frame) },
                        layers: FLYBACK_LAYERS.rejectedInFrame,
                        findingIds: ev.density.result.confirmed.map((f) => f.id),
                      })}
                    >
                      → contributing findings
                    </button>
                  </div>
                </div>
              ) : (
                <Notice tone="advisory" title="Density unavailable">
                  No counting frame has been drawn in this case. A count without a
                  denominator is not a density, so no value is shown.
                </Notice>
              )}
            </section>

            {/* 2 · Confirmed findings, by type, with origin. */}
            <GroupRow
              label="Findings"
              count={ev.findings.length}
              open={expanded.findings}
              onToggle={toggle('findings')}
            >
              {groups.length === 0 ? (
                <div className="empty">No findings recorded.</div>
              ) : groups.map(({ type, items }) => {
                const o = originCounts(items)
                return (
                  <div key={type} className="rec__group">
                    <div className="rec__groupHead">
                      <button className="link" onClick={() => {
                        const f = items[0]
                        if (f) flyBack({
                          slideId: f.slideId,
                          target: { kind: 'rect', rect: boundsOfFindings(items) },
                          layers: FLYBACK_LAYERS.finding,
                          findingIds: items.map((x) => x.id),
                          spatial: 'orientation',
                        })
                      }}>
                        {typeLabel(type)}
                      </button>
                      <span className="mono">{items.length}</span>
                    </div>
                    <div className="rec__origin mono">
                      ├─ {o.fromCandidates} from confirmed candidates ◇→✓<br />
                      └─ {o.pathologist} pathologist-originated ✓
                    </div>
                    <div className="rec__chips">
                      {items.map((f, i) => (
                        <button
                          key={f.id}
                          data-rec-id={f.id}
                          className={`link mono${f.id === highlightId ? ' rec__hit' : ''}`}
                          onClick={() => flyToFinding(f)}
                          title={`${f.slideId.split('.').pop()} · ${f.origin.replace(/_/g, ' ')} · ${timeHM(f.at)}`}
                        >
                          #{i + 1}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </GroupRow>

            {/* 3 · Authored geometry. */}
            <GroupRow
              label="Marked regions & measurements"
              count={geometry.length}
              open={expanded.geometry}
              onToggle={toggle('geometry')}
            >
              {geometry.length === 0 ? (
                <div className="empty">No geometry authored.</div>
              ) : geometry.map((a) => (
                <div
                  key={a.id}
                  data-rec-id={a.id}
                  className={`rec__row${a.id === highlightId ? ' rec__hit' : ''}`}
                >
                  <span style={{ color: 'var(--measured)' }}>
                    {a.kind === 'frame' ? '▭' : a.kind === 'distance' ? '↔' : a.kind === 'text' ? 'T' : '▱'}
                  </span>
                  <button className="link" onClick={() => flyBack({
                    slideId: a.slideId,
                    target: a.kind === 'frame'
                      ? { kind: 'rect', rect: frameRect(a) }
                      : { kind: 'point', x: a.points[0].x, y: a.points[0].y, mag: a.mag },
                    layers: FLYBACK_LAYERS.geometry,
                    findingIds: [a.id],
                  })}>
                    {a.label}
                  </button>
                  <span className="mono rec__meta">
                    {a.slideId.split('.').pop()} · {a.by} · {timeHM(a.createdAt)}
                    {a.fromProposalId && ' · from model proposal'}
                  </span>
                </div>
              ))}
            </GroupRow>

            {/* 6 · Rejected candidates — collapsed by default, retained permanently. */}
            <GroupRow
              label="Rejected candidates"
              count={ev.rejected.length}
              open={expanded.rejected}
              onToggle={toggle('rejected')}
            >
              {ev.rejected.length === 0 ? (
                <div className="empty">Nothing rejected.</div>
              ) : (
                <>
                  <div className="empty" style={{ marginBottom: 8 }}>
                    Retained permanently. The fact that the system proposed something
                    and a named human declined it is exactly the record a detection
                    system exists to keep.
                  </div>
                  {ev.rejected.map((r) => (
                    <div
                      key={r.candidateId}
                      data-rec-id={r.candidateId}
                      className={`rec__row${r.candidateId === highlightId ? ' rec__hit' : ''}`}
                    >
                      <span style={{ color: 'var(--dismissed)' }}>✕</span>
                      <button className="link" onClick={() => {
                        const slideEv = ev.slides.find((s) => s.slide.id === r.slide.id)
                        const c = slideEv?.model.byId.get(r.candidateId)
                        if (!c) return
                        flyBack({
                          slideId: r.slide.id,
                          target: { kind: 'point', x: c.x, y: c.y, mag: 40 },
                          layers: FLYBACK_LAYERS.rejected,
                        })
                      }}>
                        {typeLabel(r.type)}
                      </button>
                      <span className="mono rec__meta">
                        {r.slide.label} · {r.by} · {timeHM(r.at)}
                        {r.reason ? ` · ${r.reason}` : ''}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </GroupRow>
          </div>
        </main>

        <aside className="rec__rail scroll">
          {/* 4 · Coverage, per slide, never aggregated. */}
          <section>
            <Eyebrow>Coverage</Eyebrow>
            <div className="rec__cov">
              {ev.slides.map((s) => (
                <div key={s.slide.id} className="rec__covRow">
                  <span>{s.slide.label}</span>
                  <MicroBar value={s.coverage.diagnostic} width={72} height={5} />
                  <button
                    className="link mono"
                    title="Fly to the largest unviewed region"
                    onClick={() => {
                      if (!s.largestUnviewed) return
                      flyBack({
                        slideId: s.slide.id,
                        target: { kind: 'rect', rect: s.largestUnviewed },
                        layers: FLYBACK_LAYERS.coverage,
                        spatial: 'orientation',
                      })
                    }}
                  >
                    {pct(s.coverage.orientation)} / {pct(s.coverage.diagnostic)}
                  </button>
                </div>
              ))}
            </div>
            <div className="empty" style={{ marginTop: 6 }}>
              Never aggregated to a single case figure: an average hides a slide
              that was never opened.
            </div>
          </section>

          {/* 5 · Verification ledger. */}
          <section>
            <Eyebrow>Ledger</Eyebrow>
            <div className="rec__kv"><span>Proposed</span><span className="mono">{ev.ledger.proposed}</span></div>
            <div className="rec__kv"><span>Confirmed</span><span className="mono">{ev.ledger.confirmed}</span></div>
            <div className="rec__kv"><span>Rejected</span><span className="mono">{ev.ledger.rejected}</span></div>
            <div className="rec__kv"><span>Reclassified</span><span className="mono">{ev.ledger.reclassified}</span></div>
            <div className="rec__kv"><span>Unreviewed</span><span className="mono">{ev.ledger.unreviewed}</span></div>
          </section>

          {/* 7 · Model provenance, per slide, per run. */}
          <section>
            <Eyebrow>Provenance</Eyebrow>
            {ev.slides.map((s) => (
              <div key={s.slide.id} className="rec__kv">
                <span>{s.slide.label}</span>
                <span className="mono" style={{ color: s.slide.model ? undefined : 'var(--text-faint)' }}>
                  {s.slide.model ? s.slide.model.id : analysisLabel(s.slide.analysis).toLowerCase()}
                </span>
              </div>
            ))}
          </section>

          {/* 8 · Open items, surfaced, not hidden, and not evaluated. */}
          <section>
            <Eyebrow>Open items</Eyebrow>
            {ev.openItems.length === 0 ? (
              <div className="empty">None.</div>
            ) : ev.openItems.map((o, i) => (
              <div key={i} className="rec__kv">
                <span>{o.slideLabel}</span>
                <span style={{ color: 'var(--text-dim)', textAlign: 'right' }}>{o.text}</span>
              </div>
            ))}
          </section>

          <section>
            <Eyebrow>Case</Eyebrow>
            <div className="rec__kv"><span>Laterality</span><span style={{ fontWeight: 600 }}>{def.laterality}</span></div>
            <div className="rec__kv"><span>Reader</span><span>{session.by}</span></div>
            <div className="rec__kv"><span>Updated</span><span className="mono">{timeHM(session.updatedAt)}</span></div>
          </section>

          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {readOnly ? (
              <Chip tone="solid">Finalized · read-only</Chip>
            ) : session.status === 'ready' ? (
              <>
                <Button variant="primary" size="lg" block onClick={() => {
                  setStatus(caseId, 'finalized')
                  ui.announce('Case finalized')
                }}>
                  Finalize
                </Button>
                <Button size="sm" block onClick={() => setStatus(caseId, 'in_review')}>
                  Reopen for review
                </Button>
                <div className="empty">
                  Finalizing locks verdicts, geometry and quantities. Real sign-out is a
                  regulated act; MORPHA models it as a portfolio-level lock.
                </div>
              </>
            ) : (
              <Button variant="primary" size="lg" block onClick={() => setSheet(true)}>
                Mark ready
              </Button>
            )}
          </div>
        </aside>
      </div>

      {sheet && (
        <OpenItemsSheet
          items={ev.openItems}
          onCancel={() => setSheet(false)}
          onView={(item) => {
            const s = ev.slides.find((x) => x.slide.id === item.slideId)
            if (!s) return
            setSheet(false)
            if (item.kind === 'coverage' && s.largestUnviewed) {
              flyBack({
                slideId: item.slideId, target: { kind: 'rect', rect: s.largestUnviewed },
                layers: FLYBACK_LAYERS.coverage, spatial: 'orientation',
              })
            } else if (item.kind === 'qc') {
              const q = s.model.qcRegions[0]
              if (q) flyBack({
                slideId: item.slideId,
                target: { kind: 'point', x: q.polygon[0].x, y: q.polygon[0].y, mag: 4 },
                layers: FLYBACK_LAYERS.qc,
              })
            } else {
              setActiveSlide(caseId, item.slideId)
              setPanel(caseId, 'candidates')
              navigate(`/case/${caseId}`)
            }
          }}
          onAcknowledge={() => {
            setSheet(false)
            setStatus(caseId, 'ready')
            useSessions.getState().acknowledgeOpenItems(caseId)
            ui.announce('Case marked ready for assessment')
          }}
        />
      )}
    </div>
  )
}

function GroupRow({
  label, count, open, onToggle, children,
}: {
  label: string
  count: number
  open: boolean | undefined
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <section className="rec__section">
      <button type="button" className="rec__sectionHead" onClick={onToggle} aria-expanded={Boolean(open)}>
        <span className={`rec__chev${open ? ' rec__chev--open' : ''}`}>›</span>
        <span>{label}</span>
        <span className="mono">{count}</span>
      </button>
      {open && <div className="rec__sectionBody">{children}</div>}
    </section>
  )
}

function boundsOfFindings(items: Finding[]): Rect {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const f of items) {
    minX = Math.min(minX, f.x - f.r); minY = Math.min(minY, f.y - f.r)
    maxX = Math.max(maxX, f.x + f.r); maxY = Math.max(maxY, f.y + f.r)
  }
  const pad = Math.max(400, (maxX - minX) * 0.15)
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 }
}
