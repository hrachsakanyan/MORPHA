import { GRID_W, THUMB_LEVEL } from './constants'

/**
 * The tissue substrate for the Slide Map, and the tissue mask that is the
 * denominator of the coverage trace.
 *
 * Both are derived from the real Deep Zoom pyramid at load time — a low level of
 * the same tiles the microscope reads — so the map shows the actual specimen and
 * the mask follows the actual section outline. Nothing here is hand-authored.
 */

export interface TissueData {
  /** Stitched pyramid level, used as the map substrate. */
  image: HTMLCanvasElement
  imageW: number
  imageH: number
  /** Mask grid over the whole slide. 1 = tissue. */
  mask: Uint8Array
  gridW: number
  gridH: number
  /** Number of tissue cells — the coverage denominator before QC subtraction. */
  tissueCells: number
  /** Slide dimensions in level-0 pixels. */
  slideW: number
  slideH: number
  cellW: number
  cellH: number
}

const TILE = 254
const OVERLAP = 1

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    // A missing tile must not fail the whole slide; the map simply has a gap.
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function levelSize(w: number, h: number, maxLevel: number, level: number) {
  const d = 2 ** (maxLevel - level)
  return { w: Math.ceil(w / d), h: Math.ceil(h / d) }
}

const cache = new Map<string, Promise<TissueData>>()

export function loadTissue(dzi: string, slideW: number, slideH: number): Promise<TissueData> {
  const key = `${dzi}|${slideW}x${slideH}`
  const hit = cache.get(key)
  if (hit) return hit
  const p = build(dzi, slideW, slideH)
  cache.set(key, p)
  p.catch(() => cache.delete(key))
  return p
}

async function build(dzi: string, slideW: number, slideH: number): Promise<TissueData> {
  const filesRoot = dzi.replace(/\.dzi$/, '_files')
  const maxLevel = Math.ceil(Math.log2(Math.max(slideW, slideH)))
  const level = Math.min(THUMB_LEVEL, maxLevel)
  const { w: lw, h: lh } = levelSize(slideW, slideH, maxLevel, level)

  const cols = Math.ceil(lw / TILE)
  const rows = Math.ceil(lh / TILE)

  const canvas = document.createElement('canvas')
  canvas.width = lw
  canvas.height = lh
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D context unavailable')

  // Glass, not white — an un-tiled area must never read as "no tissue here".
  ctx.fillStyle = '#f4eef2'
  ctx.fillRect(0, 0, lw, lh)

  const jobs: Promise<void>[] = []
  let loaded = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      jobs.push(
        loadImage(`${filesRoot}/${level}/${c}_${r}.jpeg`).then((img) => {
          if (!img) return
          loaded++
          const ox = c * TILE - (c > 0 ? OVERLAP : 0)
          const oy = r * TILE - (r > 0 ? OVERLAP : 0)
          ctx.drawImage(img, ox, oy)
        }),
      )
    }
  }
  await Promise.all(jobs)
  if (loaded === 0) throw new Error('No pyramid tiles could be read for this slide')

  const gridW = GRID_W
  const gridH = Math.max(1, Math.round((GRID_W * slideH) / slideW))
  const mask = computeMask(ctx, lw, lh, gridW, gridH)

  let tissueCells = 0
  for (let i = 0; i < mask.length; i++) if (mask[i]) tissueCells++

  return {
    image: canvas,
    imageW: lw,
    imageH: lh,
    mask,
    gridW,
    gridH,
    tissueCells,
    slideW,
    slideH,
    cellW: slideW / gridW,
    cellH: slideH / gridH,
  }
}

/**
 * H&E sections are stained; the surrounding glass is not. A pixel counts as
 * tissue when it is both darker than glass and chromatic — either test alone
 * catches shadows or pen marks.
 */
function computeMask(
  ctx: CanvasRenderingContext2D,
  lw: number, lh: number,
  gridW: number, gridH: number,
): Uint8Array {
  const data = ctx.getImageData(0, 0, lw, lh).data
  const raw = new Uint8Array(gridW * gridH)
  const cw = lw / gridW
  const ch = lh / gridH
  const step = Math.max(1, Math.floor(Math.min(cw, ch) / 4))

  for (let gy = 0; gy < gridH; gy++) {
    const y0 = Math.floor(gy * ch)
    const y1 = Math.min(lh, Math.ceil((gy + 1) * ch))
    for (let gx = 0; gx < gridW; gx++) {
      const x0 = Math.floor(gx * cw)
      const x1 = Math.min(lw, Math.ceil((gx + 1) * cw))
      let hits = 0, total = 0
      for (let y = y0; y < y1; y += step) {
        for (let x = x0; x < x1; x += step) {
          const i = (y * lw + x) * 4
          const r = data[i], g = data[i + 1], b = data[i + 2]
          const max = Math.max(r, g, b)
          const min = Math.min(r, g, b)
          const lum = 0.299 * r + 0.587 * g + 0.114 * b
          if (lum < 215 && max - min > 12) hits++
          total++
        }
      }
      raw[gy * gridW + gx] = total > 0 && hits / total > 0.22 ? 1 : 0
    }
  }

  // Majority filter — removes single-cell speckle from dust and scanner noise
  // without eroding the section edge.
  const out = new Uint8Array(raw.length)
  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      let n = 0, c = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ny = gy + dy, nx = gx + dx
          if (ny < 0 || nx < 0 || ny >= gridH || nx >= gridW) continue
          c++
          n += raw[ny * gridW + nx]
        }
      }
      out[gy * gridW + gx] = n * 2 > c ? 1 : 0
    }
  }
  return out
}
