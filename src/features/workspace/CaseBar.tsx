import { Link } from 'react-router-dom'
import { StatusChip } from '@/components/glyphs'
import { Button } from '@/components/ui'
import type { CaseDef, CaseSession, SlideDef } from '@/domain/types'

/**
 * Thin and low-contrast by design: the reader knows which case they opened, and
 * what they need on screen is tissue. Laterality is the exception — it lives
 * here at full legibility while everything around it recedes.
 */
export function CaseBar({
  def, session, slide, backTo, right,
}: {
  def: CaseDef
  session: CaseSession | undefined
  slide?: SlideDef
  /** Present on the Record: the return trip to the Workspace. */
  backTo?: { href: string; label: string }
  right?: React.ReactNode
}) {
  const status = session?.status ?? def.status
  return (
    <header className="casebar">
      <span className="casebar__accession">{def.accession}</span>
      <span className="casebar__sep">·</span>
      <span className="casebar__specimen">{def.specimen},</span>
      <span className="casebar__laterality">{def.laterality}</span>
      <span className="casebar__sep">·</span>
      <span className="casebar__specimen">{def.procedure}</span>
      {slide && (
        <>
          <span className="casebar__sep">·</span>
          <span className="casebar__slide">Block {slide.block} · {slide.label} · {slide.stain}</span>
        </>
      )}
      <span style={{ marginLeft: 12 }}>
        <StatusChip status={status} reason={session?.pauseReason ?? def.pauseReason} />
      </span>

      <div className="casebar__right">
        {right}
        {backTo ? (
          <Link to={backTo.href}><Button size="sm">{backTo.label}</Button></Link>
        ) : (
          <Link to={`/case/${def.id}/record`}><Button size="sm">Record</Button></Link>
        )}
        <Link to="/library" aria-label="Exit to Library">
          <Button size="sm" variant="ghost">✕</Button>
        </Link>
      </div>
    </header>
  )
}
