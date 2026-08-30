import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui'
import type { CaseEvidence } from './useCaseEvidence'

type Item = CaseEvidence['openItems'][number]

/**
 * The non-punitive acknowledgment surface.
 *
 * It states facts and does not evaluate them: no warning colour, no ⚠ on the
 * coverage lines, no "missed" or "incomplete". Amber is reserved for scan QC,
 * which is a defect in the image, not a reading choice. It never blocks.
 */
export function OpenItemsSheet({
  items, onCancel, onView, onAcknowledge,
}: {
  items: Item[]
  onCancel: () => void
  onView: (item: Item) => void
  onAcknowledge: () => void
}) {
  const ref = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Before marking this case ready">
      <div className="sheet__box">
        <div className="sheet__title">Before marking this case ready</div>

        {items.length === 0 ? (
          <div className="empty">Nothing outstanding on this case.</div>
        ) : (
          items.map((item, i) => (
            <div key={i} className="sheet__row">
              <span style={{ color: 'var(--text)' }}>{item.slideLabel}</span>
              <span>{item.text}</span>
              <Button size="sm" onClick={() => onView(item)}>View</Button>
            </div>
          ))
        )}

        <p className="sheet__note">These will be recorded in the case record.</p>

        <div className="sheet__actions">
          <Button onClick={onCancel}>Go back</Button>
          <Button ref={ref} variant="primary" onClick={onAcknowledge}>Acknowledge and mark</Button>
        </div>
      </div>
    </div>
  )
}
