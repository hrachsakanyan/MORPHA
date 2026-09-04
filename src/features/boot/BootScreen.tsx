import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  BOOT, BOOT_MARKS, confirmDelay, FIELD, letterDelay, markDelay, markPosition,
  rowDelay, specimenTiles, WORDMARK,
} from './timing'
import './boot.css'

/**
 * The entry sequence.
 *
 * MORPHA is a reading instrument, not an AI product with a viewer attached, and
 * the entry says so before the application appears. A graticule resolves — the
 * field, ruled the way an eyepiece is ruled — over a specimen that is still
 * dark. The specimen pulls into focus, and a read passes over it row by row, in
 * reading order, the way a pathologist actually works a slide: each row it
 * finishes is tissue the reader has now seen. Only once that read has crossed
 * the reveal threshold does the model put anything on screen, and everything it
 * puts there arrives violet: inferred, proposed, not yet believed. Two of those
 * proposals are then confirmed and redrawn teal.
 *
 * The tissue is not an illustration. It is a block of tiles from the same Deep
 * Zoom pyramid the workspace streams, at roughly a 10x objective, so the thing
 * being scanned is the case itself.
 *
 * That last beat is the whole product in one gesture. The evidence membrane —
 * the line between what the machine proposed and what a human measured — is the
 * thing MORPHA is built around, and it is the one idea worth spending the
 * entry on.
 *
 * Everything else is CSS. Fourteen covers, eight tiles, six marks and six
 * characters, animating transform, opacity, filter and colour off a single
 * declared timeline. No canvas, no library, nothing on the main thread. If the
 * pyramid is not there the tiles paint nothing, the field keeps its fallback
 * wash, and the sequence is unchanged.
 */

/**
 * The specimen the demo actually reads, stated plainly. Real scanner-reported
 * numbers rather than set dressing: a hardcoded string here rather than an
 * import, because the entry screen has no business reaching into the domain.
 */
const SPECIMEN_LINE = 'TCGA-AN-A0FL · Breast H&E · 0.248 µm/px'

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

export function BootScreen({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false)
  const leavingRef = useRef(false)
  const reduced = useRef(prefersReducedMotion()).current
  const timers = useRef<number[]>([])

  // Guarded by a ref, not by the rendered flag: the exit can be triggered by the
  // timer and by a skip in the same frame, and it must only ever run once.
  const leave = useCallback(() => {
    if (leavingRef.current) return
    leavingRef.current = true
    setLeaving(true)
    timers.current.push(window.setTimeout(onDone, BOOT.exitMs))
  }, [onDone])

  useEffect(() => {
    timers.current.push(
      window.setTimeout(leave, reduced ? BOOT.reducedMs : BOOT.sequenceMs),
    )
    // The sequence is skippable. A reader who has seen it once should never be
    // made to sit through it again, and no visible control is worth the chrome.
    const skip = () => leave()
    window.addEventListener('pointerdown', skip)
    window.addEventListener('keydown', skip)
    return () => {
      window.removeEventListener('pointerdown', skip)
      window.removeEventListener('keydown', skip)
      for (const t of timers.current) window.clearTimeout(t)
      timers.current = []
    }
  }, [leave, reduced])

  return (
    <div
      className={`boot${leaving ? ' boot--leaving' : ''}`}
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">MORPHA — reading instrument for digital pathology. Initializing.</span>

      <div className="boot__stage" aria-hidden="true">
        <div className="boot__frame">
          <div className="boot__field">
            {/* The specimen, laid down first and covered until it is read. */}
            <div className="boot__tissue">
              {specimenTiles().map((t, i) => (
                <i
                  key={i}
                  style={{
                    left: t.left, top: t.top, width: t.width, height: t.height,
                    backgroundImage: `url(${t.url})`,
                  }}
                />
              ))}
            </div>

            {/* The read. Each row uncovers its band of tissue, and turns at the
                margin the way reading does. */}
            <div className="boot__read">
              {Array.from({ length: FIELD.rows }, (_, i) => (
                <div className="boot__row" key={i}>
                  <i className="boot__cover" style={{ animationDelay: `${rowDelay(i)}ms` }} />
                  <i className="boot__head" style={{ animationDelay: `${rowDelay(i)}ms` }} />
                </div>
              ))}
            </div>

            {/* The graticule rules the specimen, so it sits above the read. */}
            <div className="boot__grid" />

            <span className="boot__corner boot__corner--tl" />
            <span className="boot__corner boot__corner--tr" />
            <span className="boot__corner boot__corner--bl" />
            <span className="boot__corner boot__corner--br" />

            {/* What the model proposes, once the read has earned it. */}
            <div className="boot__objects">
              {BOOT_MARKS.map((m, i) => {
                const confirmed = confirmDelay(i)
                return (
                  <span
                    key={i}
                    className={`boot__object${confirmed !== null ? ' boot__object--confirmed' : ''}`}
                    style={{
                      ...markPosition(m),
                      '--in': `${markDelay(i)}ms`,
                      '--cf': `${confirmed ?? 0}ms`,
                    } as CSSProperties}
                  >
                    <i className="boot__ring" />
                    <i className="boot__core" />
                    {confirmed !== null && <i className="boot__pulse" />}
                  </span>
                )
              })}
            </div>

            <div className="boot__centre">
              <h1 className="boot__word">
                <span className="boot__letters">
                  {WORDMARK.split('').map((ch, i) => (
                    <span key={i} style={{ animationDelay: `${letterDelay(i)}ms` }}>{ch}</span>
                  ))}
                </span>
              </h1>
              <p className="boot__tag">
                Reading instrument<i />Digital pathology
              </p>
            </div>
          </div>

          {/* The two registers, named as the sequence introduces them. */}
          <div className="boot__base">
            <div className="boot__legend">
              <span className="boot__key boot__key--inferred">Inferred</span>
              <span className="boot__key boot__key--measured">Measured</span>
            </div>
            <p className="boot__specimen">{SPECIMEN_LINE}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
