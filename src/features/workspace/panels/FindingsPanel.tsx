import { useNavigate } from 'react-router-dom'
import { groupFindings, originCounts } from '@/domain/derive'
import { frameRect } from '@/domain/density'
import { timeHM, typeLabel } from '@/lib/format'
import { Button, Notice } from '@/components/ui'
import { useSessions } from '@/state/store'
import { useUi } from '@/state/ui'
import type { Workspace } from '../useWorkspace'
import type { Annotation, Finding } from '@/domain/types'

export function FindingsPanel({ ws, caseId }: { ws: Workspace; caseId: string }) {
  const ui = useUi()
  const navigate = useNavigate()
  const setSpatial = useSessions((s) => s.setSpatial)
  const relabel = useSessions((s) => s.relabelAnnotation)
  const remove = useSessions((s) => s.removeAnnotation)

  const slide = ws.slide
  if (!slide) return null

  function flyToFinding(f: Finding) {
    if (!slide) return
    setSpatial(caseId, slide.id, 'inspection')
    ui.setFocusedFindings([f.id])
    // Flies to the finding at the magnification at which it was created.
    ui.flyTo({
      slideId: slide.id,
      target: { kind: 'point', x: f.x, y: f.y, mag: f.mag },
      animate: true,
      focusFindingId: f.id,
    })
  }

  function flyToAnnotation(a: Annotation) {
    if (!slide) return
    setSpatial(caseId, slide.id, 'inspection')
    ui.setFocusedFindings([a.id])
    if (a.kind === 'frame') {
      ui.setSelectedFrame(a.id)
      ui.flyTo({ slideId: slide.id, target: { kind: 'rect', rect: frameRect(a) }, animate: true })
    } else {
      const p = a.points[0]
      ui.flyTo({ slideId: slide.id, target: { kind: 'point', x: p.x, y: p.y, mag: a.mag }, animate: true })
    }
  }

  const groups = groupFindings(ws.findings)
  const geometry = ws.annotations.filter((a) => a.kind !== 'point')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <section>
        <div className="typehead">
          <span style={{ color: 'var(--text)' }}>FINDINGS</span>
          <span className="typehead__counts">{ws.findings.length}</span>
        </div>
        {groups.length === 0 ? (
          <div className="empty">
            No findings yet on this slide. A finding is created when you confirm or
            reclassify a candidate, or place one yourself with the point tool.
          </div>
        ) : (
          groups.map(({ type, items }) => {
            const o = originCounts(items)
            return (
              <div key={type} style={{ marginBottom: 10 }}>
                <div className="cluster__head" style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 12 }}>
                    <span style={{ color: 'var(--measured)' }}>✓</span> {typeLabel(type)}
                  </span>
                  <span className="mono" style={{ fontSize: 11 }}>{items.length}</span>
                </div>
                {/* Origin is preserved permanently and displayed at the type
                    level: flattening destroys what a second reader most wants. */}
                <div className="mono" style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4 }}>
                  ├─ {o.fromCandidates} from candidates ◇→✓<br />
                  └─ {o.pathologist} pathologist-originated ✓
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {items.map((f, i) => (
                    <button
                      key={f.id}
                      type="button"
                      className="link"
                      style={{ fontFamily: 'var(--font-mono)' }}
                      title={`${typeLabel(f.type)} · ${f.origin.replace(/_/g, ' ')} · ${timeHM(f.at)}${f.proposedType ? ` · proposed ${typeLabel(f.proposedType)}` : ''}`}
                      onClick={() => flyToFinding(f)}
                    >
                      #{i + 1}
                    </button>
                  ))}
                </div>
              </div>
            )
          })
        )}
      </section>

      <section>
        <div className="typehead">
          <span style={{ color: 'var(--text)' }}>MARKED REGIONS &amp; MEASUREMENTS</span>
          <span className="typehead__counts">{geometry.length}</span>
        </div>
        {geometry.length === 0 ? (
          <div className="empty">
            Nothing drawn yet. Polygon <b>G</b>, counting frame <b>F</b>, distance <b>D</b>,
            area <b>A</b>, label <b>T</b>.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {geometry.map((a) => (
              <div
                key={a.id}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
              >
                <span style={{ color: 'var(--measured)' }}>
                  {a.kind === 'frame' ? '▭' : a.kind === 'distance' ? '↔' : a.kind === 'text' ? 'T' : '▱'}
                </span>
                <input
                  value={a.label}
                  onChange={(e) => relabel(caseId, a.id, e.target.value)}
                  aria-label="Annotation label"
                  style={{
                    flex: 1, minWidth: 0, background: 'transparent', border: 'none',
                    borderBottom: '1px solid var(--hairline)', padding: '2px 0', fontSize: 12,
                  }}
                />
                <Button size="sm" variant="ghost" onClick={() => flyToAnnotation(a)}>Show</Button>
                <Button
                  size="sm" variant="ghost" disabled={ws.readOnly}
                  onClick={() => remove(caseId, a.id)}
                  aria-label={`Delete ${a.label}`}
                >
                  ✕
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {ws.findings.length > 0 && (
        <Notice>
          Every finding here is traceable in both directions.
          <div style={{ marginTop: 8 }}>
            <Button size="sm" onClick={() => navigate(`/case/${caseId}/record`)}>
              Show in record
            </Button>
          </div>
        </Notice>
      )}
    </div>
  )
}
