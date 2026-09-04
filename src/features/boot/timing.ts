/**
 * The entry sequence's choreography, in one place.
 *
 * The concept is the product's founding rule, played once: the reader reads,
 * and only then does the model speak. So the sequence is ordered and the order
 * carries the meaning — graticule, read, wordmark, then the model's proposals,
 * then two of them crossing into measurement. Held here rather than inline so
 * the ordering is one declaration the component reads and the verification
 * suite can assert against. A sequence whose stages have drifted into
 * overlapping is a hierarchy the reader can no longer see, and it looks
 * identical in a diff.
 *
 * Nothing in this module knows about the domain. The choreography is asserted
 * against the real constants from the verification suite instead, so the entry
 * screen stays a leaf.
 */
export const BOOT = {
  /** Stage 1 — the reading field: the graticule resolves out of the ground. */
  fieldMs: 700,

  /** Stage 2 — the read. One row at a time, in reading order. */
  readStartMs: 480,
  readRowStaggerMs: 200,
  readRowMs: 600,

  /** Stage 3 — the wordmark, one character at a time. */
  letterStartMs: 1000,
  letterStaggerMs: 140,
  letterDurationMs: 860,
  trackMs: 1560,

  /** Stage 4 — the line beneath, on the last character. */
  subtitleStartMs: 2560,
  subtitleDurationMs: 560,

  /**
   * Stage 5 — the model speaks. Deliberately late: by this point the read has
   * just crossed the reveal threshold, which is the only reason the proposals
   * are allowed on screen at all.
   */
  revealMs: 2760,
  markStaggerMs: 100,
  markDurationMs: 440,

  /** Stage 6 — the membrane: two proposals cross into measurement. */
  membraneMs: 3760,
  membraneStaggerMs: 140,
  membraneDurationMs: 480,

  /** The hand-off. */
  sequenceMs: 4700,
  reducedMs: 800,
  /** The exit fade. Must match the `.boot` transition in boot.css. */
  exitMs: 440,
} as const

/**
 * The graticule the whole composition is built on. Cell count is fixed and the
 * field carries the matching aspect ratio, so cells are square by construction
 * at every viewport and the field can never distort.
 */
export const FIELD = { cols: 24, rows: 14 } as const

export const WORDMARK = 'MORPHA'

/**
 * The specimen under the graticule: a block of real tiles from the same Deep
 * Zoom pyramid the workspace reads, so what the entry scans is the case itself
 * rather than an illustration of one. The level is chosen so nuclei are the
 * size of a graticule cell's tenth: legible as cells at a glance, without the
 * field turning into a photograph the wordmark has to fight.
 */
export const SPECIMEN = {
  level: 16,
  x: 38,
  y: 120,
  cols: 4,
  rows: 2,
} as const

/**
 * The mosaic, laid out to cover the field without ever distorting it.
 *
 * Pyramid tiles are square, so a tile's rendered width and height must stay
 * equal. Height is divided evenly across the block's rows; width is then that
 * same measure expressed against the field's own width, which makes the block
 * wider than the field. The overflow is split evenly and cropped — the
 * background-layer equivalent of object-fit: cover.
 */
export interface SpecimenTile {
  url: string
  left: string
  top: string
  width: string
  height: string
}

export function specimenTiles(): SpecimenTile[] {
  const height = 100 / SPECIMEN.rows
  // The field is FIELD.cols wide by FIELD.rows tall in square cells, so its own
  // height is (rows / cols) of its width. A tile as tall as `height` percent of
  // the field is that many percent of the field's width once converted.
  const width = height * (FIELD.rows / FIELD.cols)
  const offsetX = (100 - width * SPECIMEN.cols) / 2
  const tiles: SpecimenTile[] = []
  for (let r = 0; r < SPECIMEN.rows; r++) {
    for (let c = 0; c < SPECIMEN.cols; c++) {
      tiles.push({
        url: `/dzi/morpha-slide_files/${SPECIMEN.level}/${SPECIMEN.x + c}_${SPECIMEN.y + r}.jpeg`,
        left: `${(offsetX + c * width).toFixed(4)}%`,
        top: `${(r * height).toFixed(4)}%`,
        width: `${width.toFixed(4)}%`,
        height: `${height.toFixed(4)}%`,
      })
    }
  }
  return tiles
}

/**
 * One model proposal, placed on the graticule rather than scattered over it —
 * the product anchors candidates to real structure, and marks that land on
 * cell centres read as measured positions instead of decoration.
 */
export interface BootMark {
  col: number
  row: number
  /** Confirmed by the reader during the sequence, and so redrawn as measured. */
  confirmed: boolean
}

/**
 * Six proposals, ordered the way the read passes over them, and kept clear of
 * the centre band so the wordmark never has to compete with one. Two are
 * confirmed: enough to state that the membrane is crossable, few enough that
 * the distinction between the two registers stays the point.
 */
export const BOOT_MARKS: readonly BootMark[] = [
  { col: 4, row: 2, confirmed: false },
  { col: 17, row: 3, confirmed: true },
  { col: 21, row: 6, confirmed: false },
  { col: 19, row: 10, confirmed: false },
  { col: 6, row: 11, confirmed: true },
  { col: 11, row: 12, confirmed: false },
]

/** When character `i` of the wordmark begins. */
export function letterDelay(i: number): number {
  return BOOT.letterStartMs + i * BOOT.letterStaggerMs
}

/** When the last character has finished moving. */
export function wordmarkSettledMs(): number {
  return letterDelay(WORDMARK.length - 1) + BOOT.letterDurationMs
}

/** When row `i` of the read begins. */
export function rowDelay(i: number): number {
  return BOOT.readStartMs + i * BOOT.readRowStaggerMs
}

/** When the read has passed over the whole field. */
export function readSettledMs(): number {
  return rowDelay(FIELD.rows - 1) + BOOT.readRowMs
}

/**
 * How much of the field the read has covered at `t`. Rows finished, not rows
 * started — coverage accrues where the reader has actually been.
 */
export function coverageAt(t: number): number {
  let done = 0
  for (let i = 0; i < FIELD.rows; i++) if (rowDelay(i) + BOOT.readRowMs <= t) done++
  return done / FIELD.rows
}

/** When proposal `i` appears. */
export function markDelay(i: number): number {
  return BOOT.revealMs + i * BOOT.markStaggerMs
}

/** When every proposal has appeared. */
export function marksSettledMs(): number {
  return markDelay(BOOT_MARKS.length - 1) + BOOT.markDurationMs
}

/** When proposal `i` is confirmed, or null if this one is never adjudicated. */
export function confirmDelay(i: number): number | null {
  if (!BOOT_MARKS[i]?.confirmed) return null
  const rank = BOOT_MARKS.slice(0, i).filter((m) => m.confirmed).length
  return BOOT.membraneMs + rank * BOOT.membraneStaggerMs
}

/** When the last confirmation has finished. */
export function membraneSettledMs(): number {
  const confirmed = BOOT_MARKS.filter((m) => m.confirmed).length
  return BOOT.membraneMs + (confirmed - 1) * BOOT.membraneStaggerMs + BOOT.membraneDurationMs
}

/** Where proposal `m` sits on the graticule, as a percentage of the field. */
export function markPosition(m: BootMark): { left: string; top: string } {
  return {
    left: `${(((m.col + 0.5) / FIELD.cols) * 100).toFixed(4)}%`,
    top: `${(((m.row + 0.5) / FIELD.rows) * 100).toFixed(4)}%`,
  }
}
