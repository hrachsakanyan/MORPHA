import { create } from 'zustand'

/**
 * The instrument's live readout. Updated at most once per animation frame and
 * read only by the status bar and the scale bar, so continuous pan and zoom do
 * not re-render the panels.
 */
interface ViewState {
  mag: number
  centreX: number
  centreY: number
  /** Screen pixels per image pixel. */
  imageZoom: number
  /** Visible slide region in image coordinates — the map's viewport rectangle. */
  bounds: { x: number; y: number; w: number; h: number } | null
  tileFailures: number
  /**
   * Retry the tiles that failed, registered by the mounted viewer. Held here
   * beside the count because the status bar shows the count and offers the
   * retry, and the two must never disagree about which viewer they mean.
   */
  retryTiles: (() => void) | null
  ready: boolean
  set: (v: Partial<Omit<ViewState, 'set' | 'reset'>>) => void
  reset: () => void
}

export const useView = create<ViewState>((set) => ({
  mag: 0,
  centreX: 0,
  centreY: 0,
  imageZoom: 0,
  bounds: null,
  tileFailures: 0,
  retryTiles: null,
  ready: false,
  set: (v) => set(v),
  reset: () => set({
    mag: 0, centreX: 0, centreY: 0, imageZoom: 0, bounds: null,
    tileFailures: 0, ready: false,
  }),
}))
