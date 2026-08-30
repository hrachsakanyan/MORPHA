import { AnalysisDot, QcMark } from '@/components/glyphs'
import { analysisLabel, pct } from '@/lib/format'
import { slideQcState } from '@/domain/derive'
import { useSessions } from '@/state/store'
import { useUi } from '@/state/ui'
import type { CaseDef, CaseSession } from '@/domain/types'

/**
 * Horizontal chips, the way radiology series selection works. It scales to a
 * 24-slide mastectomy by scrolling, and the coverage ring on each chip makes
 * case-wide progress visible without opening the Record.
 */
export function SlideStrip({
  def, session, caseId, collapsed,
}: {
  def: CaseDef
  session: CaseSession | undefined
  caseId: string
  collapsed: boolean
}) {
  const setActiveSlide = useSessions((s) => s.setActiveSlide)
  const ui = useUi()

  return (
    <div className={`strip${collapsed ? ' strip--collapsed' : ''} scroll`}>
      {def.slides.map((s) => {
        const active = session?.activeSlideId === s.id
        const stats = session?.perSlide[s.id]?.stats
        const qc = slideQcState(s)
        return (
          <button
            key={s.id}
            type="button"
            className={[
              'chipslide',
              active ? 'chipslide--on' : '',
              collapsed ? 'chipslide--collapsed' : '',
            ].filter(Boolean).join(' ')}
            title={`${s.label} · ${s.stain} · ${analysisLabel(s.analysis)}`}
            aria-current={active}
            onClick={() => {
              setActiveSlide(caseId, s.id)
              ui.setFocusedCandidate(null)
              ui.setExpandedCluster(null)
              ui.setActiveCluster(null)
            }}
          >
            <span className="chipslide__top">
              <AnalysisDot state={s.analysis} />
              <span>{s.label}</span>
              <span style={{ color: 'var(--text-faint)' }}>{s.stain}</span>
              {qc !== 'clean' && <span className="chipslide__ring"><QcMark state={qc} size={10} /></span>}
            </span>
            {!collapsed && (
              <span className="chipslide__meta">
                <CoverageRing value={stats?.diagnostic ?? 0} />
                <span className="mono">{stats ? pct(stats.diagnostic) : '—'}</span>
                {!s.formatSupported && <span style={{ color: 'var(--advisory)' }}>fmt</span>}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function CoverageRing({ value }: { value: number }) {
  const r = 5
  const c = 2 * Math.PI * r
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <circle cx="7" cy="7" r={r} fill="none" stroke="var(--hairline-strong)" strokeWidth="2" />
      <circle
        cx="7" cy="7" r={r} fill="none" stroke="var(--measured)" strokeWidth="2"
        strokeDasharray={`${c * Math.min(1, value)} ${c}`}
        transform="rotate(-90 7 7)"
        strokeLinecap="butt"
      />
    </svg>
  )
}
