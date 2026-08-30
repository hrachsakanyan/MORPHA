import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CASES } from '@/domain/cases'
import { CURRENT_USER } from '@/domain/constants'
import { readinessGlyph, READINESS_LABEL } from '@/domain/derive'
import { useSessions } from '@/state/store'
import { Button } from '@/components/ui'
import { LibraryRow } from './LibraryRow'
import type { CaseDef, CaseStatus, ReadinessGlyph } from '@/domain/types'
import './library.css'

type Fetch = 'loading' | 'ready' | 'error' | 'empty'
type SortKey = 'received' | 'priority' | 'accession' | 'status'

const PRIORITY_RANK: Record<string, number> = { STAT: 0, Urgent: 1, Routine: 2 }
const STATUS_RANK: Record<CaseStatus, number> = {
  in_review: 0, paused: 1, new: 2, ready: 3, finalized: 4,
}

export function LibraryPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const sessions = useSessions((s) => s.sessions)
  const openCase = useSessions((s) => s.openCase)

  // Demo state override: /library?state=error | empty. Both are real surfaces
  // in the spec and both must be reachable.
  const forced = params.get('state')
  const [fetchState, setFetchState] = useState<Fetch>('loading')
  const [lastFetch, setLastFetch] = useState<string>('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    setFetchState('loading')
    const t = window.setTimeout(() => {
      if (forced === 'error') setFetchState('error')
      else if (forced === 'empty') setFetchState('empty')
      else {
        setFetchState('ready')
        setLastFetch(new Date().toISOString())
      }
    }, 320)
    return () => window.clearTimeout(t)
  }, [forced, attempt])

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | CaseStatus>('all')
  const [priority, setPriority] = useState<'all' | string>('all')
  const [assigned, setAssigned] = useState<'all' | 'mine' | 'others'>('all')
  const [readiness, setReadiness] = useState<'all' | ReadinessGlyph>('all')
  const [sort, setSort] = useState<SortKey>('priority')
  const [expanded, setExpanded] = useState<string | null>(null)

  const cases = fetchState === 'empty' ? [] : CASES

  const statusOf = (c: CaseDef): CaseStatus => sessions[c.id]?.status ?? c.status

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = cases.filter((c) => {
      if (q && !(
        c.accession.toLowerCase().includes(q) ||
        c.specimen.toLowerCase().includes(q) ||
        c.procedure.toLowerCase().includes(q) ||
        c.assignedTo.toLowerCase().includes(q)
      )) return false
      if (status !== 'all' && statusOf(c) !== status) return false
      if (priority !== 'all' && c.priority !== priority) return false
      if (assigned === 'mine' && c.assignedTo !== CURRENT_USER) return false
      if (assigned === 'others' && c.assignedTo === CURRENT_USER) return false
      if (readiness !== 'all' && readinessGlyph(c.slides) !== readiness) return false
      return true
    })
    return rows.sort((a, b) => {
      switch (sort) {
        case 'accession': return a.accession.localeCompare(b.accession)
        case 'received': return a.receivedAt.localeCompare(b.receivedAt)
        case 'status': return STATUS_RANK[statusOf(a)] - STATUS_RANK[statusOf(b)]
        case 'priority':
        default:
          return (
            PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
            a.receivedAt.localeCompare(b.receivedAt)
          )
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cases, query, status, priority, assigned, readiness, sort, sessions])

  const filtersActive =
    query !== '' || status !== 'all' || priority !== 'all' || assigned !== 'all' || readiness !== 'all'

  function resetFilters() {
    setQuery(''); setStatus('all'); setPriority('all'); setAssigned('all'); setReadiness('all')
  }

  function open(c: CaseDef) {
    openCase(c)
    navigate(`/case/${c.id}`)
  }

  return (
    <div className="lib">
      <header className="lib__top">
        <span className="lib__mark">MORPHA</span>
        <input
          className="lib__search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search accession, specimen, procedure, pathologist"
          aria-label="Search cases"
        />
        <div className="lib__user">
          <span>{CURRENT_USER}</span>
          <span style={{ color: 'var(--text-faint)' }}>Breast pathology</span>
        </div>
      </header>

      <div className="lib__filters">
        <select className="lib__select" value={status} aria-label="Status filter"
          onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="all">Status · All</option>
          <option value="new">New</option>
          <option value="in_review">In Review</option>
          <option value="paused">Paused</option>
          <option value="ready">Ready for Assessment</option>
          <option value="finalized">Finalized</option>
        </select>
        <select className="lib__select" value={priority} aria-label="Priority filter"
          onChange={(e) => setPriority(e.target.value)}>
          <option value="all">Priority · All</option>
          <option value="STAT">STAT</option>
          <option value="Urgent">Urgent</option>
          <option value="Routine">Routine</option>
        </select>
        <select className="lib__select" value={assigned} aria-label="Assignment filter"
          onChange={(e) => setAssigned(e.target.value as typeof assigned)}>
          <option value="all">Assigned · All</option>
          <option value="mine">Assigned to me</option>
          <option value="others">Assigned to others</option>
        </select>
        <select className="lib__select" value={readiness} aria-label="Readiness filter"
          onChange={(e) => setReadiness(e.target.value as typeof readiness)}>
          <option value="all">Readiness · All</option>
          {(Object.keys(READINESS_LABEL) as ReadinessGlyph[]).map((k) => (
            <option key={k} value={k}>{READINESS_LABEL[k]}</option>
          ))}
        </select>
        <select className="lib__select" value={sort} aria-label="Sort"
          onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="priority">Sort · Priority</option>
          <option value="received">Sort · Received</option>
          <option value="accession">Sort · Accession</option>
          <option value="status">Sort · Status</option>
        </select>
        <span className="lib__count mono">
          {fetchState === 'ready' ? `${filtered.length} of ${cases.length}` : ''}
        </span>
      </div>

      <div className="lib__body scroll">
        {fetchState === 'loading' && <LoadingRows />}

        {fetchState === 'error' && (
          <div className="lib__surface">
            {/* An empty list and a failed fetch are visually identical and
                clinically opposite, so this is never an empty table. */}
            <div style={{ color: 'var(--critical)', marginBottom: 8 }}>Worklist unavailable</div>
            <div style={{ marginBottom: 4 }}>The worklist service did not respond.</div>
            <div className="mono" style={{ color: 'var(--text-faint)', marginBottom: 16 }}>
              Last successful fetch {lastFetch ? new Date(lastFetch).toLocaleTimeString('en-GB') : 'never this session'}
            </div>
            <Button onClick={() => setAttempt((a) => a + 1)}>Retry</Button>
          </div>
        )}

        {fetchState === 'empty' && <div className="lib__surface">No cases assigned.</div>}

        {fetchState === 'ready' && filtered.length === 0 && (
          <div className="lib__surface" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <span>No cases match these filters</span>
            <Button size="sm" onClick={resetFilters}>Reset filters</Button>
          </div>
        )}

        {fetchState === 'ready' && filtered.length > 0 && (
          <table className="lib__table">
            <thead>
              <tr>
                <th style={{ width: 32 }} aria-label="Expand" />
                <th style={{ width: 180 }}>Accession</th>
                <th style={{ width: 260 }}>Specimen</th>
                <th style={{ width: 140 }}>Procedure</th>
                <th style={{ width: 80 }}>Priority</th>
                <th style={{ width: 200 }}>Case status</th>
                <th style={{ width: 140 }}>Slides</th>
                <th style={{ width: 200 }}>Progress</th>
                <th style={{ width: 120 }}>Received</th>
                <th style={{ width: 140 }}>Assigned</th>
                <th style={{ width: 128 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <LibraryRow
                  key={c.id}
                  def={c}
                  status={statusOf(c)}
                  session={sessions[c.id]}
                  expanded={expanded === c.id}
                  onToggle={() => setExpanded(expanded === c.id ? null : c.id)}
                  onOpen={() => open(c)}
                />
              ))}
            </tbody>
          </table>
        )}

        {!filtersActive && fetchState === 'ready' && (
          <div style={{ padding: '24px', fontSize: 11, color: 'var(--text-faint)' }}>
            Every slide in this worklist renders the same real breast H&amp;E whole-slide image
            (122,807 × 71,603 px · 0.248 µm/px). Metadata, analysis states and model output
            differ per slide; the pixels do not.
          </div>
        )}
      </div>
    </div>
  )
}

function LoadingRows() {
  return (
    <div aria-busy="true" aria-label="Loading worklist">
      {Array.from({ length: 6 }, (_, i) => <div key={i} className="lib__skeleton" />)}
    </div>
  )
}
