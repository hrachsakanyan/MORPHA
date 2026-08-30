import { Chip } from './ui'
import { analysisLabel, statusLabel } from '@/lib/format'
import { READINESS_LABEL } from '@/domain/derive'
import type { AnalysisState, CaseStatus, QcState, ReadinessGlyph } from '@/domain/types'
import './glyphs.css'

/* Colour is never the only indicator. Every glyph carries shape and a title. */

export function EvidenceGlyph({
  kind, size = 11,
}: {
  kind: 'candidate' | 'confirmed' | 'rejected' | 'reclassified' | 'qc' | 'marked' | 'frame'
  size?: number
}) {
  const map = {
    candidate: { g: '◇', c: 'var(--inferred)' },
    confirmed: { g: '✓', c: 'var(--measured)' },
    rejected: { g: '✕', c: 'var(--dismissed)' },
    reclassified: { g: '✎', c: 'var(--measured)' },
    qc: { g: '⚠', c: 'var(--advisory)' },
    marked: { g: '▱', c: 'var(--measured)' },
    frame: { g: '▭', c: 'var(--measured)' },
  }[kind]
  return (
    <span aria-hidden style={{ color: map.c, fontSize: size, lineHeight: 1 }}>{map.g}</span>
  )
}

export function AnalysisDot({ state, size = 10 }: { state: AnalysisState; size?: number }) {
  const title = analysisLabel(state)
  const v = 'var(--inferred)'
  const n = 'var(--text-faint)'
  const a = 'var(--advisory)'
  const r = size / 2

  const common = { width: size, height: size, viewBox: '0 0 12 12', 'aria-hidden': true } as const
  switch (state) {
    case 'complete':
      return <svg {...common} className="glyph"><title>{title}</title><circle cx="6" cy="6" r={r} fill={v} /></svg>
    case 'partially_analyzed':
      return (
        <svg {...common} className="glyph"><title>{title}</title>
          <circle cx="6" cy="6" r={r - 0.5} fill="none" stroke={v} strokeWidth="1" />
          <path d={`M6 ${6 - r + 0.5} A ${r - 0.5} ${r - 0.5} 0 0 1 6 ${6 + r - 0.5} Z`} fill={v} />
        </svg>
      )
    case 'analyzing':
      return (
        <svg {...common} className="glyph glyph--spin"><title>{title}</title>
          <circle cx="6" cy="6" r={r - 0.5} fill="none" stroke="var(--hairline-strong)" strokeWidth="1.5" />
          <path d={`M6 ${6 - r + 0.5} A ${r - 0.5} ${r - 0.5} 0 0 1 ${6 + r - 0.5} 6`} fill="none" stroke={v} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )
    case 'queued':
      return <svg {...common} className="glyph"><title>{title}</title><circle cx="6" cy="6" r={r - 0.5} fill="none" stroke={v} strokeWidth="1" strokeDasharray="2 2" /></svg>
    case 'failed':
      return <svg {...common} className="glyph"><title>{title}</title><circle cx="6" cy="6" r={r} fill={a} /><path d="M4 4 L8 8 M8 4 L4 8" stroke="#1b1520" strokeWidth="1.2" /></svg>
    case 'out_of_scope':
    case 'not_available':
    default:
      return <svg {...common} className="glyph"><title>{title}</title><circle cx="6" cy="6" r={r - 0.5} fill="none" stroke={n} strokeWidth="1" /></svg>
  }
}

export function ReadinessMark({ glyph, size = 11 }: { glyph: ReadinessGlyph; size?: number }) {
  const title = READINESS_LABEL[glyph]
  const common = { width: size, height: size, viewBox: '0 0 12 12', 'aria-hidden': true } as const
  switch (glyph) {
    case 'ready':
      return <svg {...common} className="glyph"><title>{title}</title><rect x="1.5" y="1.5" width="9" height="9" fill="var(--measured)" /></svg>
    case 'partial':
      return (
        <svg {...common} className="glyph"><title>{title}</title>
          <rect x="1.5" y="1.5" width="9" height="9" fill="none" stroke="var(--measured)" strokeWidth="1" />
          <rect x="1.5" y="1.5" width="4.5" height="9" fill="var(--measured)" />
        </svg>
      )
    case 'working':
      return (
        <svg {...common} className="glyph glyph--spin"><title>{title}</title>
          <circle cx="6" cy="6" r="4.5" fill="none" stroke="var(--hairline-strong)" strokeWidth="1.5" />
          <path d="M6 1.5 A 4.5 4.5 0 0 1 10.5 6" fill="none" stroke="var(--inferred)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )
    case 'attention':
      return (
        <svg {...common} className="glyph"><title>{title}</title>
          <path d="M6 1 L11 10.5 L1 10.5 Z" fill="none" stroke="var(--advisory)" strokeWidth="1.2" />
          <path d="M6 4.5 L6 7.5" stroke="var(--advisory)" strokeWidth="1.2" />
          <circle cx="6" cy="9" r="0.7" fill="var(--advisory)" />
        </svg>
      )
    case 'manual':
    default:
      return <svg {...common} className="glyph"><title>{title}</title><circle cx="6" cy="6" r="4.5" fill="none" stroke="var(--text-faint)" strokeWidth="1" /></svg>
  }
}

/** `Clean` displays nothing — an interface that announces the absence of problems trains the reader to ignore it. */
export function QcMark({ state, size = 11 }: { state: QcState; size?: number }) {
  if (state === 'clean') return null
  const filled = state === 'needs_attention'
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" className="glyph" aria-hidden>
      <title>{filled ? 'Scan QC · Needs Attention' : 'Scan QC · Flagged'}</title>
      <path
        d="M6 1 L11 10.5 L1 10.5 Z"
        fill={filled ? 'var(--advisory)' : 'none'}
        stroke="var(--advisory)"
        strokeWidth="1.2"
      />
      <path d="M6 4.5 L6 7.3" stroke={filled ? '#1b1520' : 'var(--advisory)'} strokeWidth="1.2" />
      <circle cx="6" cy="8.9" r="0.7" fill={filled ? '#1b1520' : 'var(--advisory)'} />
    </svg>
  )
}

export function StatusChip({ status, reason }: { status: CaseStatus; reason?: string }) {
  const label = statusLabel(status)
  switch (status) {
    case 'in_review':
      return <Chip tone="measured">{label}</Chip>
    case 'ready':
      return <Chip tone="measured">✓ {label}</Chip>
    case 'finalized':
      return <Chip tone="solid">⬤ {label}</Chip>
    case 'paused':
      return (
        <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
          <Chip tone="neutral">{label}</Chip>
          {reason && <Chip tone="neutral">{reason}</Chip>}
        </span>
      )
    case 'new':
    default:
      return <Chip tone="neutral">{label}</Chip>
  }
}

export function PriorityChip({ priority }: { priority: string }) {
  if (priority === 'STAT') return <Chip tone="critical">STAT</Chip>
  if (priority === 'Urgent') return <Chip tone="advisory">Urgent</Chip>
  return <Chip tone="neutral">Routine</Chip>
}
