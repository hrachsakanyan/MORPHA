/** Formatting helpers. Every numeric string produced here is meant for tabular figures. */

export function pct(v: number, digits = 0): string {
  return `${(v * 100).toFixed(digits)}%`
}

export function mm2(v: number): string {
  return `${v.toFixed(2)} mm²`
}

export function magLabel(mag: number): string {
  if (mag >= 10) return `${Math.round(mag)}×`
  if (mag >= 1) return `${mag.toFixed(1)}×`
  return `${mag.toFixed(2)}×`
}

export function coords(x: number, y: number): string {
  return `x ${Math.round(x).toLocaleString('en-US')} y ${Math.round(y).toLocaleString('en-US')}`
}

export function timeHM(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function relativeAge(iso: string, now = Date.now()): string {
  const ms = now - new Date(iso).getTime()
  const h = ms / 3_600_000
  if (h < 1) return `${Math.max(1, Math.round(ms / 60_000))} min`
  if (h < 48) return `${Math.round(h)} h`
  return `${Math.round(h / 24)} d`
}

export function absoluteDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

const TYPE_LABELS: Record<string, string> = {
  mitotic_figure: 'Mitotic figure',
  tumor_region: 'Tumor region',
  necrosis: 'Necrosis',
  cellular_density: 'Cellular density',
  apoptotic_body: 'Apoptotic body',
  hyperchromatic_nucleus: 'Hyperchromatic nucleus',
  artifact: 'Artifact',
  other: 'Other',
}
export function typeLabel(t: string): string {
  return TYPE_LABELS[t] ?? t
}

const QC_LABELS: Record<string, string> = {
  focus: 'Focus issue',
  fold: 'Tissue fold',
  bubble: 'Air bubble',
  pen: 'Pen mark',
  incomplete: 'Incomplete scan',
  edge: 'Section edge',
}
export function qcLabel(t: string): string {
  return QC_LABELS[t] ?? t
}

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  in_review: 'In Review',
  paused: 'Paused',
  ready: 'Ready for Assessment',
  finalized: 'Finalized',
}
export function statusLabel(s: string): string {
  return STATUS_LABELS[s] ?? s
}

const ANALYSIS_LABELS: Record<string, string> = {
  not_available: 'Not Available',
  queued: 'Queued',
  analyzing: 'Analyzing',
  partially_analyzed: 'Partially Analyzed',
  complete: 'Analysis Complete',
  failed: 'Analysis Failed',
  out_of_scope: 'Out of Model Scope',
}
export function analysisLabel(s: string): string {
  return ANALYSIS_LABELS[s] ?? s
}
