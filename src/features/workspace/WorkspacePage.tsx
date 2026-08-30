import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CANDIDATE_TYPES } from '@/domain/derive'
import { typeLabel } from '@/lib/format'
import { findCase } from '@/domain/cases'
import { useSessions } from '@/state/store'
import { useUi } from '@/state/ui'
import { useView } from '@/state/view'
import { Button, Kbd, Segmented } from '@/components/ui'
import { CaseBar } from './CaseBar'
import { SlideStrip } from './SlideStrip'
import { LeftRail } from './LeftRail'
import { SlideMap } from './SlideMap'
import { Microscope } from './Microscope'
import { StatusBar } from './StatusBar'
import { CandidatesPanel } from './panels/CandidatesPanel'
import { FindingsPanel } from './panels/FindingsPanel'
import { DensityPanel } from './panels/DensityPanel'
import { SlideInfoPanel } from './panels/SlideInfoPanel'
import { useHotkeys } from './useHotkeys'
import { useWorkspace } from './useWorkspace'
import type { PanelContext } from '@/domain/types'
import './workspace.css'

export function WorkspacePage() {
  const { caseId = '' } = useParams()
  const navigate = useNavigate()
  const def = findCase(caseId)
  const openCase = useSessions((s) => s.openCase)
  const setPanel = useSessions((s) => s.setPanel)
  const ui = useUi()

  useEffect(() => { if (def) openCase(def) }, [def, openCase])
  useEffect(() => () => ui.resetWorkspaceUi(), []) // eslint-disable-line react-hooks/exhaustive-deps

  const ws = useWorkspace(caseId)
  useHotkeys(ws, caseId)

  /* Rails hold at 1728; below that they yield in order of dispensability. */
  useEffect(() => {
    let lastPanel = window.innerWidth < 1400
    let lastRail = window.innerWidth < 1160
    let lastStrip = window.innerHeight < 800
    ui.setPanelCollapsed(lastPanel)
    ui.setRailCollapsed(lastRail)
    ui.setStripCollapsed(lastStrip)
    const onResize = () => {
      const p = window.innerWidth < 1400
      const r = window.innerWidth < 1160
      const s = window.innerHeight < 800
      if (p !== lastPanel) { lastPanel = p; useUi.getState().setPanelCollapsed(p) }
      if (r !== lastRail) { lastRail = r; useUi.getState().setRailCollapsed(r) }
      if (s !== lastStrip) { lastStrip = s; useUi.getState().setStripCollapsed(s) }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!def) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: 12 }}>That case is not in this worklist.</div>
          <Button onClick={() => navigate('/library')}>Case Library</Button>
        </div>
      </div>
    )
  }

  if (def.slides.length === 0) {
    // A data-integrity error. The case does not open.
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center', padding: 48 }}>
        <div style={{ maxWidth: 460 }}>
          <div style={{ color: 'var(--critical)', marginBottom: 8 }}>Case cannot be opened</div>
          <p style={{ color: 'var(--text-dim)' }}>
            {def.accession} has no slides associated with it. This is a data-integrity
            error rather than an empty case; contact laboratory informatics before
            proceeding.
          </p>
          <Button onClick={() => navigate('/library')}>Back to Library</Button>
        </div>
      </div>
    )
  }

  const session = ws.session
  const slide = ws.slide
  const inspection = ws.slideSession?.spatial === 'inspection'
  const drawing = session?.tool === 'annotate' || session?.tool === 'measure' || session?.tool === 'frame'
  const strip = ui.chipStrip

  return (
    <div
      className="ws"
      style={{
        // @ts-expect-error custom properties are valid inline style values
        '--rail-w': ui.railCollapsed ? '0px' : 'var(--w-rail)',
        '--panel-w': ui.panelCollapsed ? '0px' : 'var(--w-panel)',
      }}
    >
      <CaseBar
        def={def}
        session={session}
        slide={slide}
        right={
          <>
            {inspection && slide && (
              <Button
                size="sm"
                variant="ghost"
                title="Return to orientation · Esc"
                onClick={() => {
                  // Leaves a return marker at the departed viewport, so Enter
                  // drops the reader straight back in.
                  const v = useView.getState()
                  useSessions.getState().patchSlide(caseId, slide.id, {
                    spatial: 'orientation',
                    returnMarker: { x: v.centreX, y: v.centreY, imageZoom: v.imageZoom },
                  })
                  ui.setFocusedCandidate(null)
                }}
              >
                ◱ Map <Kbd>Esc</Kbd>
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => ui.setRailCollapsed(!ui.railCollapsed)}
              title="Collapse left rail">
              {ui.railCollapsed ? '▶' : '◀'} Rail
            </Button>
            <Button size="sm" variant="ghost" onClick={() => ui.setPanelCollapsed(!ui.panelCollapsed)}
              title="Collapse right panel">
              Panel {ui.panelCollapsed ? '◀' : '▶'}
            </Button>
          </>
        }
      />

      <SlideStrip def={def} session={session} caseId={caseId} collapsed={ui.stripCollapsed} />

      <div className="ws__main">
        <LeftRail ws={ws} caseId={caseId} collapsed={ui.railCollapsed} />

        <div style={{ display: 'grid', gridTemplateRows: 'minmax(0,1fr) auto', minWidth: 0 }}>
          {/* The map is full-canvas in orientation and demotes to the rail in
              inspection, with a continuous transition rather than a cut. Both
              instruments stay mounted throughout: they are two distances from
              the same object, not two places. */}
          <div className={`canvas${drawing ? ' canvas--tool' : ''}`}>
            <Microscope ws={ws} caseId={caseId} />
            <SlideMap ws={ws} caseId={caseId} variant="canvas" hidden={inspection} />
          </div>

          {/* Temporary docked strip. Nothing but the verification control floats. */}
          {strip && strip.kind !== 'reclassify' && strip.kind !== 'dismiss-cluster' && (
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                padding: '8px 16px', borderTop: '1px solid var(--hairline)',
                background: 'var(--bg-1)', fontSize: 12,
              }}
            >
              <span style={{ color: 'var(--text-faint)' }}>
                {strip.kind === 'point-type' ? 'Record finding as:' : 'Marked region type:'}
              </span>
              {strip.kind === 'point-type'
                ? CANDIDATE_TYPES.map((t, i) => (
                    <Button key={t} size="sm" onClick={() => commitPoint(t, i)}>
                      <Kbd>{i + 1}</Kbd> {typeLabel(t)}
                    </Button>
                  ))
                : ['Region of interest', 'Tumor region', 'Unassessable'].map((l, i) => (
                    <Button key={l} size="sm" onClick={() => commitPolygon(i)}>
                      <Kbd>{i + 1}</Kbd> {l}
                    </Button>
                  ))}
              <span style={{ marginLeft: 'auto', color: 'var(--text-faint)', fontSize: 11 }}>
                Esc to cancel
              </span>
            </div>
          )}
        </div>

        <div className={ui.panelCollapsed ? 'panel panel--collapsed' : 'panel'}>
          {!ui.panelCollapsed && session && (
            <>
              <div className="panel__head">
                <Segmented<PanelContext>
                  ariaLabel="Panel context"
                  value={session.panel}
                  onChange={(v) => setPanel(caseId, v)}
                  options={[
                    { value: 'candidates', label: 'Candidates' },
                    { value: 'findings', label: 'Findings' },
                    { value: 'density', label: 'Density' },
                    { value: 'slideinfo', label: 'Slide' },
                  ]}
                />
              </div>
              <div className="panel__body scroll">
                {session.panel === 'candidates' && <CandidatesPanel ws={ws} caseId={caseId} />}
                {session.panel === 'findings' && <FindingsPanel ws={ws} caseId={caseId} />}
                {session.panel === 'density' && <DensityPanel ws={ws} caseId={caseId} />}
                {session.panel === 'slideinfo' && <SlideInfoPanel ws={ws} />}
              </div>
            </>
          )}
        </div>
      </div>

      <StatusBar ws={ws} caseId={caseId} />

      <div className="sr-only" role="status" aria-live="polite">{ui.announcement}</div>
    </div>
  )

  function commitPoint(t: (typeof CANDIDATE_TYPES)[number], _i: number) {
    const s = ui.chipStrip
    if (s?.kind !== 'point-type' || !slide) return
    useSessions.getState().addAnnotation(caseId, {
      slideId: slide.id, kind: 'point', points: [s.at],
      label: typeLabel(t), findingType: t, mag: 40,
    })
    ui.setChipStrip(null)
    ui.announce(`${typeLabel(t)} recorded`)
  }

  function commitPolygon(i: number) {
    const s = ui.chipStrip
    if (s?.kind !== 'polygon-type' || !slide) return
    const kinds = ['polygon', 'polygon', 'unassessable'] as const
    const labels = ['Region of interest', 'Tumor region', 'Unassessable']
    const kind = kinds[i]
    const n = ws.annotations.filter((a) => a.kind === kind).length + 1
    useSessions.getState().addAnnotation(caseId, {
      slideId: slide.id, kind, points: s.points, label: `${labels[i]} ${n}`, mag: 40,
    })
    ui.setChipStrip(null)
    ui.announce(`${labels[i]} created`)
  }
}
