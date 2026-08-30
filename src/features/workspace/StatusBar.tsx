import { useEffect, useState } from 'react'
import { coords, magLabel, pct } from '@/lib/format'
import { useSessions } from '@/state/store'
import { useUi } from '@/state/ui'
import { useView } from '@/state/view'
import type { Workspace } from './useWorkspace'

/**
 * The instrument's panel of gauges. Every value updates continuously and none of
 * them are ever hidden. Scale in particular must be present at all times.
 */
export function StatusBar({ ws, caseId }: { ws: Workspace; caseId: string }) {
  const mag = useView((s) => s.mag)
  const imageZoom = useView((s) => s.imageZoom)
  const cx = useView((s) => s.centreX)
  const cy = useView((s) => s.centreY)
  const tileFailures = useView((s) => s.tileFailures)
  const holdClear = useUi((s) => s.holdClear)
  const markSynced = useSessions((s) => s.markSynced)

  const unsynced = ws.session?.unsynced ?? 0
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  // Verdicts and geometry queue locally and replay. The reader is never told
  // something is saved when it is not.
  useEffect(() => {
    if (unsynced === 0 || !online) return
    const t = window.setTimeout(() => markSynced(caseId), 700)
    return () => window.clearTimeout(t)
  }, [unsynced, online, caseId, markSynced])

  const mpp = ws.slide?.mpp ?? null
  const scaleUm = mpp && imageZoom ? (60 / imageZoom) * mpp : null

  const toolLabel = ws.session?.activeToolId
    ? ws.session.activeToolId.toUpperCase()
    : ws.session?.tool.toUpperCase() ?? 'NAVIGATE'

  return (
    <footer className="status">
      <span className="status__seg">{mag > 0 ? magLabel(mag) : '—'}</span>

      <span className="status__seg status__scale">
        {mpp ? (
          <>
            <span>{scaleUm ? formatScale(scaleUm) : '—'}</span>
            <span className="status__rule" style={{ width: 60 }} />
          </>
        ) : (
          <span className="status__warn">SCALE UNAVAILABLE — MEASUREMENT DISABLED</span>
        )}
      </span>

      <span className="status__seg">{coords(cx, cy)}</span>

      <span className="status__seg" title="Orientation / diagnostic coverage on this slide">
        cov {pct(ws.coverage.orientation)} / {pct(ws.coverage.diagnostic)}
      </span>

      {ws.unassessableFraction > 0 && (
        <span className="status__seg status__warn">
          unassessable {pct(ws.unassessableFraction, 1)}
        </span>
      )}

      <span className="status__spacer" />

      {holdClear && <span className="status__seg status__ok">OVERLAYS CLEARED</span>}

      {tileFailures > 0 && (
        <span className="status__seg status__warn">
          TILES {tileFailures} FAILED
          <button
            type="button"
            className="link"
            style={{ color: 'inherit' }}
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </span>
      )}

      <span className="status__seg">TOOL: {toolLabel}</span>
      <span className="status__seg">{mpp ? `MPP ${mpp.toFixed(3)}` : 'MPP INVALID'}</span>
      <span className={`status__seg ${unsynced > 0 ? 'status__warn' : 'status__ok'}`}>
        {unsynced > 0 ? `UNSYNCED · ${unsynced}` : online ? '✓ synced' : 'OFFLINE'}
      </span>
    </footer>
  )
}

function formatScale(um: number): string {
  if (um >= 1000) return `${(um / 1000).toFixed(um >= 10000 ? 0 : 1)} mm`
  return `${um.toFixed(um >= 100 ? 0 : 1)} µm`
}
