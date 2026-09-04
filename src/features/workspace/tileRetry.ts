/**
 * Retrying tiles that failed to load, without reloading the page.
 *
 * A tile request that fails leaves OpenSeadragon holding a `Tile` with
 * `exists = false`, memoised in the tiled image's `tilesMatrix`. Every later
 * update pass returns on that flag before the tile can be queued, so the tile
 * is never asked for again for the life of the viewer — which is why the only
 * retry available until now was reloading the document.
 *
 * Dropping the memoised record is enough: the next update pass builds a fresh
 * `Tile` for those coordinates and requests it through the ordinary image
 * loader, the same path a tile takes when the reader scrolls to it for the
 * first time. The viewer, the tile source, the viewport and the session are all
 * untouched.
 *
 * The logic lives here, apart from the viewer, so it can be asserted against
 * without a DOM.
 */

export interface FailedTile { level: number; x: number; y: number }

/** The part of an OpenSeadragon `TiledImage` this module reaches into. */
export interface TileMatrixHolder {
  tilesMatrix: Record<number, Record<number, Record<number, unknown>>>
  _needsDraw?: boolean
}

export function tileKey(t: FailedTile): string {
  return `${t.level}/${t.x}/${t.y}`
}

/**
 * Record a failure. Deduplicated by coordinate: a tile that fails, is retried
 * and fails again is one broken tile, not two, and the count the reader is
 * shown must stay the count of tiles actually missing from the canvas.
 */
export function addFailure(list: FailedTile[], t: FailedTile): FailedTile[] {
  const key = tileKey(t)
  if (list.some((f) => tileKey(f) === key)) return list
  return [...list, { level: t.level, x: t.x, y: t.y }]
}

/** Retire a failure because that tile has now loaded. */
export function clearFailure(list: FailedTile[], t: FailedTile): FailedTile[] {
  const key = tileKey(t)
  return list.filter((f) => tileKey(f) !== key)
}

/**
 * Drop the memoised tile records for `failed` so the viewer requests them again.
 * Returns how many records were actually dropped, so the caller only forces a
 * redraw when there is something to redraw.
 */
export function dropTileRecords(image: TileMatrixHolder, failed: FailedTile[]): number {
  let dropped = 0
  for (const f of failed) {
    const column = image.tilesMatrix?.[f.level]?.[f.x]
    if (!column || column[f.y] === undefined) continue
    delete column[f.y]
    dropped++
  }
  if (dropped > 0) image._needsDraw = true
  return dropped
}
