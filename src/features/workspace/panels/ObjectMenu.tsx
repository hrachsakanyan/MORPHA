import { useEffect, useRef } from 'react'
import './objectmenu.css'

export interface MenuTarget {
  /** The finding or annotation this menu acts on. */
  id: string
  label: string
  x: number
  y: number
}

/**
 * The per-object context menu (§J.4).
 *
 * Findings run to dozens on a slide, so a visible per-object control would cost
 * more chrome than the action is worth. The spec puts this in a context menu for
 * that reason, and the menu carries exactly one action: the Record is the case's
 * other face, not a place things are added to.
 */
export function ObjectMenu({
  target, onShowInRecord, onClose,
}: {
  target: MenuTarget
  onShowInRecord: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.querySelector('button')?.focus()
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    // Capture, so dismissing the menu never also reaches the object underneath.
    window.addEventListener('mousedown', away, true)
    window.addEventListener('keydown', key, true)
    return () => {
      window.removeEventListener('mousedown', away, true)
      window.removeEventListener('keydown', key, true)
    }
  }, [onClose])

  // Kept inside the viewport without measuring: the menu is a known size.
  const left = Math.min(target.x, window.innerWidth - 190)
  const top = Math.min(target.y, window.innerHeight - 76)

  return (
    <div
      ref={ref}
      className="objmenu"
      role="menu"
      aria-label={`Actions for ${target.label}`}
      style={{ left, top }}
    >
      <div className="objmenu__head">{target.label}</div>
      <button type="button" role="menuitem" className="objmenu__item" onClick={onShowInRecord}>
        Show in record
      </button>
    </div>
  )
}
