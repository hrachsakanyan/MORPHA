import { useEffect, useState } from 'react'
import { loadTissue, type TissueData } from '@/domain/tissue'
import type { SlideDef } from '@/domain/types'

export type TissueStatus =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ready'; data: TissueData }
  | { state: 'error'; message: string }
  | { state: 'unavailable'; message: string }

/**
 * Loads the map substrate and tissue mask for a slide. The chrome renders
 * immediately and the map holds the slide's true aspect ratio while this runs,
 * so nothing reflows when the tissue arrives (§L, slide loading).
 */
export function useTissue(slide: SlideDef | undefined): TissueStatus {
  const [status, setStatus] = useState<TissueStatus>({ state: 'idle' })

  useEffect(() => {
    if (!slide) {
      setStatus({ state: 'idle' })
      return
    }
    if (!slide.formatSupported) {
      setStatus({ state: 'unavailable', message: `Unsupported slide format: ${slide.format}` })
      return
    }
    if (!slide.dzi) {
      setStatus({ state: 'unavailable', message: 'Slide image not available' })
      return
    }

    let cancelled = false
    setStatus({ state: 'loading' })
    loadTissue(slide.dzi, slide.width, slide.height)
      .then((data) => { if (!cancelled) setStatus({ state: 'ready', data }) })
      .catch((err: unknown) => {
        if (cancelled) return
        setStatus({
          state: 'error',
          message: err instanceof Error ? err.message : 'Slide could not be read',
        })
      })
    return () => { cancelled = true }
  }, [slide])

  return status
}
