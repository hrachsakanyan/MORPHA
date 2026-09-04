/*
 * Headless verification of MORPHA's domain logic.
 * Run with: npm run verify
 *
 * These are assertions over the pure domain modules — no DOM, no React. They
 * exist because the numbers this product renders are clinical claims, and a
 * regression in the denominator is invisible in a screenshot.
 */
import { modelOutput } from '@/domain/synth'
import {
  coverageStats, emptyGrid, encodeGrid, decodeGrid, largestUnviewedRegion,
  markViewport, seedGrid, tierFor,
} from '@/domain/coverage'
import { computeDensity, frameRect } from '@/domain/density'
import {
  findingsForSlide, ledgerFor, modelRunsFor, originCounts, readinessGlyph, slideQcState,
} from '@/domain/derive'
import {
  frameHandleAt, movePoint, polygonArea, polygonCentroid, rectContains, rectCorners,
  rectFromCorners, rectPolygonOverlapArea, resizeRect, vertexAt,
} from '@/lib/geometry'
import { CASES } from '@/domain/cases'
import { REVEAL_THRESHOLD } from '@/domain/constants'
import { FLYBACK_LAYERS } from '@/features/record/flyback'
import {
  addFailure, clearFailure, dropTileRecords, tileKey,
  type FailedTile, type TileMatrixHolder,
} from '@/features/workspace/tileRetry'
import {
  BOOT, BOOT_MARKS, confirmDelay, coverageAt, FIELD, letterDelay, markDelay,
  markPosition, marksSettledMs, membraneSettledMs, readSettledMs, rowDelay,
  SPECIMEN, specimenTiles, wordmarkSettledMs, WORDMARK as BOOT_WORDMARK,
} from '@/features/boot/timing'
import { readFileSync } from 'node:fs'
import type { TissueData } from '@/domain/tissue'
import type { Annotation, Finding, ProposedFrame, Pt, Verdict } from '@/domain/types'

let failures = 0
function ok(name: string, cond: boolean, detail = '') {
  if (!cond) { failures++; console.log(`  FAIL  ${name} ${detail}`) }
  else console.log(`  ok    ${name} ${detail}`)
}
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps

/* A fake pyramid read: an ellipse of tissue on the same grid the app uses. */
function fakeTissue(slideW: number, slideH: number): TissueData {
  const gridW = 192
  const gridH = Math.round((192 * slideH) / slideW)
  const mask = new Uint8Array(gridW * gridH)
  let cells = 0
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const nx = (x - gridW / 2) / (gridW * 0.42)
      const ny = (y - gridH / 2) / (gridH * 0.42)
      if (nx * nx + ny * ny <= 1) { mask[y * gridW + x] = 1; cells++ }
    }
  }
  return {
    image: null as unknown as HTMLCanvasElement,
    imageW: 1919, imageH: 1119,
    mask, gridW, gridH, tissueCells: cells,
    slideW, slideH, cellW: slideW / gridW, cellH: slideH / gridH,
  }
}

const demo = CASES[0]
const A2 = demo.slides[1]
const MPP = A2.mpp!
const tissue = fakeTissue(A2.width, A2.height)

console.log('\n— synthetic model output —')
const m = modelOutput(A2, tissue)
ok('A2 emits 47 candidates', m.candidates.length === 47, `(${m.candidates.length})`)
ok('A2 has 5 clusters', m.clusters.length === 5, `(${m.clusters.length})`)
ok('mitotic first in clinical order', m.clusters[0].type === 'mitotic_figure')
ok('largest mitotic cluster is 23', m.clusters[0].candidateIds.length === 23)
ok('34 mitotic in 2 clusters',
  m.clusters.filter((c) => c.type === 'mitotic_figure').reduce((n, c) => n + c.candidateIds.length, 0) === 34)
ok('every candidate lands on tissue', m.candidates.every((c) => {
  const gx = Math.floor(c.x / tissue.cellW), gy = Math.floor(c.y / tissue.cellH)
  return tissue.mask[gy * tissue.gridW + gx] === 1
}))
ok('one QC region on A2', m.qcRegions.length === 1)
ok('output is cached and identical', modelOutput({ ...A2, id: A2.id }, tissue) === m)

console.log('\n— coverage trace —')
ok('tier below 2x is null', tierFor(1.5) === null)
ok('2x is orientation', tierFor(2) === 1)
ok('10x is diagnostic', tierFor(10) === 2)
const grid = emptyGrid(tissue)
const whole = { x: 0, y: 0, w: A2.width, h: A2.height }
markViewport(grid, tissue, whole, 1.5)
ok('below-threshold pan records nothing', coverageStats(grid, tissue, 0).orientation === 0)
markViewport(grid, tissue, whole, 4)
ok('orientation sweep reaches 100%', coverageStats(grid, tissue, 0).orientation > 0.99)
ok('diagnostic still 0', coverageStats(grid, tissue, 0).diagnostic === 0)
markViewport(grid, tissue, { x: 0, y: 0, w: A2.width / 2, h: A2.height }, 20)
const half = coverageStats(grid, tissue, 0).diagnostic
ok('diagnostic accrues on the swept half', half > 0.4 && half < 0.6)
markViewport(grid, tissue, { x: 0, y: 0, w: A2.width / 2, h: A2.height }, 20)
ok('revisiting adds nothing', coverageStats(grid, tissue, 0).diagnostic === half)
ok('QC shrinks the denominator', coverageStats(grid, tissue, 0.1).diagnostic > half)
ok('unassessable reported separately', coverageStats(grid, tissue, 0.1).unassessable === 0.1)
ok('grid round-trips through storage',
  decodeGrid(encodeGrid(grid), tissue).every((v, i) => v === grid[i]))
const seeded = seedGrid(tissue, 0.72, 0.19)
const ss = coverageStats(seeded, tissue, 0)
ok('seeded read restores its targets',
  Math.abs(ss.orientation - 0.72) < 0.02 && Math.abs(ss.diagnostic - 0.19) < 0.02)
ok('largest unviewed region found', largestUnviewedRegion(seeded, tissue) !== null)

console.log('\n— verdicts, findings, ledger —')
const mit = m.clusters[0].candidateIds
const now = new Date().toISOString()
const v = (candidateId: string, kind: Verdict['kind'], to?: Verdict['reclassifiedTo']): Verdict => ({
  id: 'v' + candidateId, candidateId, slideId: A2.id, kind, at: now, by: 'test', reclassifiedTo: to,
})
let verdicts: Verdict[] = [
  ...mit.slice(0, 17).map((id) => v(id, 'confirmed')),
  ...mit.slice(17, 21).map((id) => v(id, 'rejected')),
  v(mit[21], 'reclassified', 'apoptotic_body'),
]
let findings = findingsForSlide(A2.id, m, verdicts, [])
ok('18 findings from 22 verdicts', findings.length === 18)
ok('17 remain mitotic', findings.filter((f) => f.type === 'mitotic_figure').length === 17)
ok('reclassified keeps the proposed type',
  findings.find((f) => f.origin === 'reclassified_candidate')?.proposedType === 'mitotic_figure')
const led = ledgerFor(m, verdicts, A2.id)
ok('ledger reconciles',
  led.proposed === 47 && led.confirmed === 17 && led.rejected === 4 &&
  led.reclassified === 1 && led.unreviewed === 25, JSON.stringify(led))
ok('latest verdict is in force',
  findingsForSlide(A2.id, m, [...verdicts, v(mit[0], 'rejected')], []).length === 17)

console.log('\n— mitotic density —')
const cluster = m.clusters[0]
const frame: Annotation = {
  id: 'ANN-034', slideId: A2.id, kind: 'frame',
  points: [
    { x: cluster.bounds.x, y: cluster.bounds.y },
    { x: cluster.bounds.x + cluster.bounds.w, y: cluster.bounds.y + cluster.bounds.h },
  ],
  label: 'Counting frame 1', createdAt: now, by: 'test', mag: 40,
}
const rejectedPts = m.candidates
  .filter((c) => verdicts.some((x) => x.candidateId === c.id && x.kind === 'rejected'))
  .map((c) => ({ id: c.id, x: c.x, y: c.y }))
let d = computeDensity(frame, MPP, findings, m.qcRegions, rejectedPts)
ok('frame area is measured from MPP', d.areaMm2 > 0.1 && d.areaMm2 < 20)
ok('numerator is confirmed mitoses in frame', d.confirmed.length === 17)
ok('density = numerator / effective area',
  d.density !== null && near(d.density, d.confirmed.length / d.effectiveAreaMm2))
ok('effective area never exceeds area', d.effectiveAreaMm2 <= d.areaMm2)
const before = d.confirmed.length
verdicts = [...verdicts, v(mit[0], 'reclassified', 'apoptotic_body')]
findings = findingsForSlide(A2.id, m, verdicts, [])
d = computeDensity(frame, MPP, findings, m.qcRegions, rejectedPts)
ok('reclassify leaves the mitotic count', d.confirmed.length === before - 1)
const degenerate: Annotation = { ...frame, points: [{ x: 10, y: 10 }, { x: 10, y: 10 }] }
ok('zero-area frame yields no density',
  computeDensity(degenerate, MPP, findings, [], []).density === null)

/* ── §I.4 — counting frame edge dragging ───────────────────────────── */
console.log('\n— frame handles (§I.4) —')
const R = { x: 100, y: 200, w: 400, h: 300 }
ok('west edge', frameHandleAt(R, { x: 100, y: 350 }, 7) === 'w')
ok('east edge', frameHandleAt(R, { x: 500, y: 350 }, 7) === 'e')
ok('north edge', frameHandleAt(R, { x: 300, y: 200 }, 7) === 'n')
ok('south edge', frameHandleAt(R, { x: 300, y: 500 }, 7) === 's')
ok('corners win over edges', frameHandleAt(R, { x: 100, y: 200 }, 7) === 'nw')
ok('ne corner', frameHandleAt(R, { x: 500, y: 200 }, 7) === 'ne')
ok('se corner', frameHandleAt(R, { x: 500, y: 500 }, 7) === 'se')
ok('sw corner', frameHandleAt(R, { x: 100, y: 500 }, 7) === 'sw')
ok('interior is not a handle', frameHandleAt(R, { x: 300, y: 350 }, 7) === null)
ok('far outside is not a handle', frameHandleAt(R, { x: 40, y: 350 }, 7) === null)
ok('tolerance is symmetric about the edge',
  frameHandleAt(R, { x: 94, y: 350 }, 7) === 'w' && frameHandleAt(R, { x: 106, y: 350 }, 7) === 'w')

console.log('\n— frame resize (§I.4) —')
let n = resizeRect(R, 'e', { x: 600, y: 999 }, 14)
ok('east drag moves only the east edge', n.x === 100 && n.y === 200 && n.h === 300 && n.w === 500)
n = resizeRect(R, 'w', { x: 50, y: 999 }, 14)
ok('west drag moves the origin, keeps the far edge',
  n.x === 50 && n.x + n.w === 500 && n.h === 300)
n = resizeRect(R, 'n', { x: 999, y: 150 }, 14)
ok('north drag moves only the top', n.y === 150 && n.y + n.h === 500 && n.w === 400)
n = resizeRect(R, 'se', { x: 700, y: 800 }, 14)
ok('corner drag moves two edges', n.w === 600 && n.h === 600 && n.x === 100 && n.y === 200)
n = resizeRect(R, 'e', { x: -9999, y: 0 }, 14)
ok('minimum size is enforced', n.w === 14, `(w=${n.w})`)
n = resizeRect(R, 'w', { x: 9999, y: 0 }, 14)
ok('minimum holds when dragging past the far edge', n.w === 14 && n.x + n.w === 500)
ok('a drag never translates the frame',
  resizeRect(R, 'n', { x: 999, y: 250 }, 14).x === R.x)
ok('rectCorners round-trips through frameRect', (() => {
  const back = frameRect({ ...frame, points: rectCorners(R) })
  return back.x === R.x && back.y === R.y && back.w === R.w && back.h === R.h
})())

console.log('\n— density recomputes live during a resize (§I.4) —')
/* The spec's worked example: 17 mitoses, 1.21 mm², then the frame grows. */
const px2ToMm2 = (MPP * MPP) / 1e6
const side = Math.sqrt(1.21 / px2ToMm2)
const originX = 20000, originY = 20000
const seventeen: Finding[] = Array.from({ length: 17 }, (_, i) => ({
  id: `F${i}`, slideId: A2.id, type: 'mitotic_figure', origin: 'confirmed_candidate',
  x: originX + 40 + i * 7, y: originY + 40, r: 6, at: now, by: 'test',
  qcAffected: false, mag: 40,
}))
const mkFrame = (r: { x: number; y: number; w: number; h: number }): Annotation =>
  ({ ...frame, points: rectCorners(r) })

const small = { x: originX, y: originY, w: side, h: side }
let live = computeDensity(mkFrame(small), MPP, seventeen, [], [])
ok('denominator is 1.21 mm²', near(live.areaMm2, 1.21, 1e-9), `(${live.areaMm2.toFixed(4)})`)
ok('17 / 1.21 mm² = 14.0 /mm²', live.density!.toFixed(1) === '14.0', `(${live.density!.toFixed(2)})`)

/* Grow the east edge until the area reaches 1.35 mm² — one frame of a drag. */
const grown = resizeRect(small, 'e', { x: originX + (1.35 / 1.21) * side, y: 0 }, 14)
live = computeDensity(mkFrame(grown), MPP, seventeen, [], [])
ok('denominator follows the edge to 1.35 mm²', near(live.areaMm2, 1.35, 1e-9), `(${live.areaMm2.toFixed(4)})`)
ok('17 / 1.35 mm² = 12.6 /mm²', live.density!.toFixed(1) === '12.6', `(${live.density!.toFixed(2)})`)
ok('numerator unchanged when the frame only grows', live.confirmed.length === 17)
ok('growing the frame lowers the density', live.density! < 14.0)

/* Findings crossing the boundary enter and leave the count in real time. */
const shrunk = resizeRect(small, 'e', { x: originX + 80, y: 0 }, 14)
const crossing = computeDensity(mkFrame(shrunk), MPP, seventeen, [], [])
ok('findings leave the count as the edge passes them',
  crossing.confirmed.length < 17 && crossing.confirmed.length > 0,
  `(${crossing.confirmed.length} of 17)`)
ok('reopening the edge brings them back',
  computeDensity(mkFrame(small), MPP, seventeen, [], []).confirmed.length === 17)

/* The denominator is never pixel area. */
ok('area is physical, not pixels', !near(live.areaMm2, grown.w * grown.h, 1))
ok('area scales with MPP squared', (() => {
  const a = computeDensity(mkFrame(small), MPP, seventeen, [], []).areaMm2
  const b = computeDensity(mkFrame(small), MPP * 2, seventeen, [], []).areaMm2
  return near(b, a * 4, 1e-9)
})())

/* QC still comes out of the denominator after a resize. */
const withQc = computeDensity(mkFrame(small), MPP, seventeen, m.qcRegions, [])
ok('QC subtraction survives a resize', withQc.effectiveAreaMm2 <= withQc.areaMm2)

/* ── §I.5 — model-proposed counting frame ──────────────────────────── */
console.log('\n— model-proposed frame (§I.5) —')
const prop = m.proposedFrame
ok('the fixture offers a proposal on A2', prop !== null)
ok('the proposal is deterministic', (() => {
  const again = modelOutput({ ...A2, id: A2.id + '-copy2' }, tissue).proposedFrame
  return !!again && !!prop &&
    again.points[0].x === prop.points[0].x && again.points[1].y === prop.points[1].y
})())
ok('it frames the mitotic hotspot', prop!.clusterId === m.clusters[0].id)
ok('it contains the hotspot bounds', (() => {
  const r = rectFromCorners(prop!.points[0], prop!.points[1])
  const b = m.clusters[0].bounds
  return r.x <= b.x && r.y <= b.y && r.x + r.w >= b.x + b.w && r.y + r.h >= b.y + b.h
})())
ok('it stays inside the slide',
  prop!.points[0].x >= 0 && prop!.points[0].y >= 0 &&
  prop!.points[1].x <= A2.width && prop!.points[1].y <= A2.height)

/* A proposal is not an Annotation. That is the membrane, structurally. */
ok('a proposal has no author', !('by' in (prop as object)))
ok('a proposal has no creation time', !('createdAt' in (prop as object)))
ok('a proposal has no annotation kind', !('kind' in (prop as object)))
ok('a proposal is not itself accepted geometry', !('fromProposalId' in (prop as object)))
ok('a proposal is distinct from the human frame', prop!.id !== frame.id)

/* No number, of any kind, while it is only proposed. */
ok('a proposal never appears in the frame list',
  ![frame].some((f) => (f as { id: string }).id === prop!.id))
ok('computeDensity cannot be handed a proposal',
  typeof (prop as unknown as Annotation).kind === 'undefined')

/* Slides with no mitotic hotspot get no proposal. */
const A1 = demo.slides[0]
ok('a slide whose analysis failed gets no proposal',
  modelOutput({ ...A1, id: A1.id + '-failed', analysis: 'failed' }, tissue).proposedFrame === null)
ok('a slide out of model scope gets no proposal',
  modelOutput({ ...A1, id: A1.id + '-oos', analysis: 'out_of_scope' }, tissue).proposedFrame === null)

/* Read-First: the same gate every other inferred overlay passes through. */
function visibleProposal(
  mo: { proposedFrame: ProposedFrame | null }, revealed: boolean, anns: Annotation[],
): ProposedFrame | null {
  const pf = mo.proposedFrame
  if (!pf) return null
  if (!revealed) return null
  if (anns.some((a) => a.fromProposalId === pf.id)) return null
  return pf
}
ok('suppressed before reveal', visibleProposal(m, false, []) === null)
ok('offered after reveal', visibleProposal(m, true, []) !== null)

/* Accept frame — the proposal becomes authored geometry in the reader's name. */
const accepted: Annotation = {
  id: 'ANN-900', slideId: A2.id, kind: 'frame',
  points: [{ ...prop!.points[0] }, { ...prop!.points[1] }],
  label: 'Counting frame 2', createdAt: now, by: 'Dr Test', mag: prop!.mag,
  fromProposalId: prop!.id,
}
ok('acceptance authors a frame Annotation', accepted.kind === 'frame' && accepted.by === 'Dr Test')
ok('acceptance preserves provenance', accepted.fromProposalId === prop!.id)
ok('acceptance copies the geometry exactly', (() => {
  const a = rectFromCorners(prop!.points[0], prop!.points[1])
  const b = frameRect(accepted)
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
})())
ok('the proposal is withdrawn once accepted', visibleProposal(m, true, [accepted]) === null)

/* Only after acceptance does an area, and a density, exist. */
const inFrame = m.candidates
  .filter((c) => rectContains(frameRect(accepted), { x: c.x, y: c.y }))
  .slice(0, 9)
const acceptedFindings: Finding[] = inFrame.map((c, i2) => ({
  id: 'AF' + i2, slideId: A2.id, type: 'mitotic_figure', origin: 'confirmed_candidate',
  x: c.x, y: c.y, r: c.r, at: now, by: 'Dr Test', qcAffected: false, mag: 40,
}))
const acc = computeDensity(accepted, MPP, acceptedFindings, [], [])
ok('the accepted frame has a measured area', acc.areaMm2 > 0, '(' + acc.areaMm2.toFixed(3) + ' mm2)')
ok('the accepted frame produces a density', acc.density !== null)
ok('density is numerator over measured area',
  near(acc.density!, acc.confirmed.length / acc.effectiveAreaMm2))

/* §I.4 resizing works on it immediately. */
const accRect = frameRect(accepted)
ok('an accepted frame exposes handles',
  frameHandleAt(accRect, { x: accRect.x, y: accRect.y + accRect.h / 2 }, 7) === 'w')
const widened = resizeRect(accRect, 'e', { x: accRect.x + accRect.w * 1.25, y: 0 }, 14)
const acc2 = computeDensity({ ...accepted, points: rectCorners(widened) }, MPP, acceptedFindings, [], [])
ok('resizing an accepted frame grows the measured area', acc2.areaMm2 > acc.areaMm2)
ok('resizing an accepted frame lowers the density', acc2.density! < acc.density!)
ok('the resized frame keeps its provenance',
  ({ ...accepted, points: rectCorners(widened) }).fromProposalId === prop!.id)

/* ── Polygon vertex editing ────────────────────────────────────────── */
console.log('\n— polygon vertex editing —')
const poly: Pt[] = [
  { x: 1000, y: 1000 }, { x: 1400, y: 1020 }, { x: 1440, y: 1380 },
  { x: 1080, y: 1420 }, { x: 960, y: 1200 },
]
const region: Annotation = {
  id: 'ANN-500', slideId: A2.id, kind: 'polygon', points: poly,
  label: 'Region of interest', createdAt: now, by: 'Dr Test', mag: 10,
}

/* Hit-testing. */
ok('a vertex is found under the pointer', vertexAt(poly, { x: 1400, y: 1020 }, 8) === 1)
ok('a near miss still grabs the vertex', vertexAt(poly, { x: 1405, y: 1024 }, 8) === 1)
ok('just outside tolerance misses', vertexAt(poly, { x: 1412, y: 1020 }, 8) === null)
ok('the polygon interior is not a vertex', vertexAt(poly, { x: 1200, y: 1200 }, 8) === null)
ok('the nearest vertex wins a tie', (() => {
  const pair: Pt[] = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 100, y: 100 }]
  return vertexAt(pair, { x: 5, y: 0 }, 8) === 1
})())
ok('every vertex is reachable',
  poly.every((q, k) => vertexAt(poly, q, 8) === k))

/* Dragging one vertex. */
const moved = movePoint(poly, 2, { x: 1600, y: 1500 })
ok('the dragged vertex moves', moved[2].x === 1600 && moved[2].y === 1500)
ok('neighbours are untouched', (() => moved.every((q, k) =>
  k === 2 ? true : q.x === poly[k].x && q.y === poly[k].y))())
ok('the original is not mutated', poly[2].x === 1440 && poly[2].y === 1380)
ok('the vertex count is preserved', moved.length === poly.length)
ok('the polygon stays valid', moved.length >= 3 && moved.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y)))
ok('an out-of-range index is a no-op', movePoint(poly, 99, { x: 0, y: 0 }) === poly)
ok('a negative index is a no-op', movePoint(poly, -1, { x: 0, y: 0 }) === poly)

/* Derived geometry follows the drag. */
const areaBefore = polygonArea(poly)
const areaAfter = polygonArea(moved)
ok('polygon area recomputes from the edited points', areaAfter !== areaBefore)
ok('pushing a vertex outward enlarges the region', areaAfter > areaBefore,
  '(' + Math.round(areaBefore) + ' → ' + Math.round(areaAfter) + ' px2)')
ok('measured area is physical, not pixels', (() => {
  const mm2After = (areaAfter * MPP * MPP) / 1e6
  return mm2After > 0 && !near(mm2After, areaAfter, 1)
})())
ok('the centroid follows the geometry', (() => {
  const c1 = polygonCentroid(poly)
  const c2 = polygonCentroid(moved)
  return c2.x !== c1.x || c2.y !== c1.y
})())

/* An unassessable region is a denominator input, so it must recompute too. */
const unassessable: Annotation = { ...region, id: 'ANN-501', kind: 'unassessable' }
const unassessableGrown: Annotation = { ...unassessable, points: moved }
ok('unassessable area recomputes when reshaped',
  polygonArea(unassessableGrown.points) > polygonArea(unassessable.points))

/* Slide coordinates survive pan and zoom: the drag stores image space, and
   hit-testing happens in screen space through the viewport transform. */
function toScreen(pts: Pt[], scale: number, ox: number, oy: number): Pt[] {
  return pts.map((q) => ({ x: ox + q.x * scale, y: oy + q.y * scale }))
}
ok('a vertex is grabbable at low magnification',
  vertexAt(toScreen(poly, 0.02, 40, 60), { x: 40 + 1400 * 0.02, y: 60 + 1020 * 0.02 }, 8) === 1)
ok('the same vertex is grabbable at 40x',
  vertexAt(toScreen(poly, 4, -3800, -3900), { x: -3800 + 1400 * 4, y: -3900 + 1020 * 4 }, 8) === 1)
ok('image coordinates are unchanged by the viewport', (() => {
  const a = toScreen(moved, 0.02, 40, 60)
  const b = toScreen(moved, 4, -3800, -3900)
  return a.length === b.length && moved[2].x === 1600 && moved[2].y === 1500
})())

/* Committing on pointer up replaces the points and nothing else. */
const committed: Annotation = { ...region, points: moved }
ok('commit replaces only the geometry',
  committed.id === region.id && committed.kind === region.kind &&
  committed.label === region.label && committed.by === region.by &&
  committed.createdAt === region.createdAt && committed.mag === region.mag)
ok('the committed polygon holds the edit', committed.points[2].x === 1600)

/* Frames and polygons share one drag mechanism but never collide. */
ok('a frame is not an editable polygon', !['polygon', 'unassessable', 'area'].includes(frame.kind))
ok('a polygon is not a frame', region.kind !== 'frame')
ok('the frame path still resizes after the refactor', (() => {
  const r0 = frameRect(frame)
  const r1 = resizeRect(r0, 'e', { x: r0.x + r0.w * 1.5, y: 0 }, 14)
  return r1.w > r0.w && r1.x === r0.x
})())

/* ── §J.4 — Show in record, per object ─────────────────────────────── */
console.log('\n— show in record (§J.4) —')

/*
 * The Record is derived: every finding, frame and measurement is already in it.
 * Show in record is navigation — it opens the Record scrolled and highlighted
 * to one object. These assertions cover the routing contract that behaviour
 * rests on, since the Record itself is assembled by findingsForSlide and the
 * annotation list, both already covered above.
 */

/** The section of the Record that owns an object id — what gets auto-expanded. */
function sectionFor(
  id: string, recFindings: Finding[], rejected: Array<{ candidateId: string }>,
): 'findings' | 'rejected' | 'geometry' {
  if (recFindings.some((f) => f.id === id)) return 'findings'
  if (rejected.some((r) => r.candidateId === id)) return 'rejected'
  return 'geometry'
}

const recFindings = findingsForSlide(A2.id, m, verdicts, [])
const rejectedRows = verdicts
  .filter((x) => x.kind === 'rejected')
  .map((x) => ({ candidateId: x.candidateId }))

ok('a finding routes to the findings section',
  sectionFor(recFindings[0].id, recFindings, rejectedRows) === 'findings')
ok('a rejected candidate routes to the rejected section',
  sectionFor(rejectedRows[0].candidateId, recFindings, rejectedRows) === 'rejected')
ok('a frame routes to the geometry section',
  sectionFor(frame.id, recFindings, rejectedRows) === 'geometry')
ok('a marked region routes to the geometry section',
  sectionFor(region.id, recFindings, rejectedRows) === 'geometry')

/* Only the object acted on is targeted. */
const targetId = recFindings[3].id
ok('exactly one finding matches the highlight',
  recFindings.filter((f) => f.id === targetId).length === 1)
ok('no other object shares the id',
  ![frame, region].some((a) => a.id === targetId) &&
  !rejectedRows.some((r) => r.candidateId === targetId))

/* Repeated activation cannot duplicate evidence, because nothing is inserted. */
ok('the record is derived, not accumulated', (() => {
  const once = findingsForSlide(A2.id, m, verdicts, [])
  const twice = findingsForSlide(A2.id, m, verdicts, [])
  return once.length === twice.length
})())
ok('the finding count is unchanged by being shown',
  findingsForSlide(A2.id, m, verdicts, []).length === recFindings.length)

/* Provenance survives the trip. */
ok('a finding carries its origin into the record',
  recFindings.every((f) => ['confirmed_candidate', 'reclassified_candidate', 'pathologist'].includes(f.origin)))
ok('origin distinguishes model-derived from pathologist-originated', (() => {
  const o = originCounts(recFindings)
  return o.fromCandidates + o.pathologist === recFindings.length
})())
ok('a reclassified finding still names what the model proposed',
  recFindings.find((f) => f.origin === 'reclassified_candidate')?.proposedType === 'mitotic_figure')
ok('an accepted proposal is not shown as independently human-discovered',
  accepted.fromProposalId === prop!.id && accepted.by === 'Dr Test')
ok('a hand-drawn frame carries no proposal provenance', frame.fromProposalId === undefined)

/* Fly-back from the Record still resolves to the right tissue and layers.
   These assert the declaration the Record actually reads, so a layer set that
   drifts out of agreement with §J.4 fails here rather than at the click. */
ok('a finding flies back to a real point at its creation magnification', (() => {
  const f = recFindings[0]
  return Number.isFinite(f.x) && Number.isFinite(f.y) && f.mag > 0 &&
    f.x >= 0 && f.x <= A2.width && f.y >= 0 && f.y <= A2.height
})())
ok('a frame flies back to a rect with real extent', (() => {
  const r = frameRect(frame)
  return r.w > 0 && r.h > 0
})())
ok('geometry fly-back forces every authored layer',
  FLYBACK_LAYERS.geometry.marked && FLYBACK_LAYERS.geometry.frames &&
  FLYBACK_LAYERS.geometry.measurements)
ok('the rejected ledger forces the rejected layer', FLYBACK_LAYERS.rejected.rejected === true)
ok('a rejected count inside a frame forces rejected on top of findings',
  FLYBACK_LAYERS.rejectedInFrame.rejected === true &&
  FLYBACK_LAYERS.rejectedInFrame.findings === true)
ok('density forces the frame it was measured in',
  FLYBACK_LAYERS.density.frames === true && FLYBACK_LAYERS.density.findings === true)
ok('a coverage figure forces the coverage veil', FLYBACK_LAYERS.coverage.coverage === true)
ok('a QC figure forces the QC layer', FLYBACK_LAYERS.qc.qc === true)
ok('no fly-back target is left with an empty layer set',
  Object.values(FLYBACK_LAYERS).every((l) => Object.keys(l).length > 0))
ok('every fly-back layer is forced on, never off',
  Object.values(FLYBACK_LAYERS).every((l) => Object.values(l).every((v) => v === true)))
ok('every finding has a magnification to return to',
  recFindings.every((f) => Number.isFinite(f.mag) && f.mag > 0))
ok('every finding has a slide to return to',
  recFindings.every((f) => f.slideId === A2.id))

/* ── §K.3 — Superseded candidate state ─────────────────────────────── */
console.log('\n— superseded candidates (§K.3) —')
const sup = m.supersededCandidates
ok('A2 carries superseded candidates from the replaced run', sup.length === 7, '(' + sup.length + ')')
ok('the slide names the run they came from',
  A2.previousModel?.id === 'mitosis-v4.1' && A2.previousModel?.version === '4.1.6')
ok('they are deterministic', (() => {
  const again = modelOutput({ ...A2, id: A2.id + '-sup-copy' }, tissue).supersededCandidates
  return again.length === sup.length &&
    again.every((c, k) => c.x === sup[k].x && c.y === sup[k].y && c.type === sup[k].type)
})())
ok('they land on tissue like any candidate', sup.every((c) => {
  const gx = Math.floor(c.x / tissue.cellW), gy = Math.floor(c.y / tissue.cellH)
  return tissue.mask[gy * tissue.gridW + gx] === 1
}))
ok('a slide with no previous run has none',
  modelOutput({ ...A2, id: A2.id + '-norerun', previousModel: undefined }, tissue)
    .supersededCandidates.length === 0)
ok('a slide whose analysis failed has none',
  modelOutput({ ...A2, id: A2.id + '-supfail', analysis: 'failed' }, tissue)
    .supersededCandidates.length === 0)

/* Distinct from Rejected — the whole point of the state. */
const rejectedIds = new Set(
  verdicts.filter((x) => x.kind === 'rejected').map((x) => x.candidateId),
)
ok('superseded is not rejected: no verdict exists against them',
  sup.every((c) => !verdicts.some((x) => x.candidateId === c.id)))
ok('no superseded candidate is in the rejected set',
  sup.every((c) => !rejectedIds.has(c.id)))
ok('rejected candidates are active-run candidates, not superseded', (() => {
  const active = new Set(m.candidates.map((c) => c.id))
  return [...rejectedIds].every((id) => active.has(id))
})())
ok('the two states cannot be conflated by id',
  sup.every((c) => c.id.includes('-sup-')) &&
  m.candidates.every((c) => !c.id.includes('-sup-')))

/* Held apart from everything that counts. */
ok('superseded are absent from the active candidate list',
  sup.every((c) => !m.candidates.some((a) => a.id === c.id)))
ok('superseded are absent from the byId index', sup.every((c) => !m.byId.has(c.id)))
ok('superseded belong to no active cluster',
  m.clusters.every((cl) => cl.candidateIds.every((id) => !id.includes('-sup-'))))
ok('the ledger does not count them',
  ledgerFor(m, verdicts, A2.id).proposed === m.candidates.length)
ok('the ledger total still reconciles', (() => {
  const l = ledgerFor(m, verdicts, A2.id)
  return l.confirmed + l.rejected + l.reclassified + l.unreviewed === l.proposed
})())

/* Never a finding, and therefore never Record evidence or a numerator. */
ok('a superseded candidate cannot become a finding',
  findingsForSlide(A2.id, m, verdicts, []).every((f) => !f.candidateId?.includes('-sup-')))
ok('inventing a verdict against one still produces no finding', (() => {
  const forged = [...verdicts, v(sup[0].id, 'confirmed')]
  const out = findingsForSlide(A2.id, m, forged, [])
  return out.every((f) => f.candidateId !== sup[0].id)
})())
ok('the finding count is unchanged by their presence',
  findingsForSlide(A2.id, m, verdicts, []).length === recFindings.length)
ok('they add no Record evidence', (() => {
  const ids = new Set(recFindings.map((f) => f.id))
  return sup.every((c) => !ids.has(c.id))
})())
ok('forging verdicts on every superseded candidate moves no number', (() => {
  const forged = [...verdicts, ...sup.map((c) => v(c.id, 'confirmed'))]
  const before = computeDensity(frame, MPP, findingsForSlide(A2.id, m, verdicts, []), [], [])
  const after = computeDensity(frame, MPP, findingsForSlide(A2.id, m, forged, []), [], [])
  const lb = ledgerFor(m, verdicts, A2.id)
  const la = ledgerFor(m, forged, A2.id)
  return after.confirmed.length === before.confirmed.length &&
    after.density === before.density &&
    la.confirmed === lb.confirmed && la.proposed === lb.proposed
})())

/* Audit trail: retained, never deleted. */
ok('verdict activity never removes them', (() => {
  const busy = [...verdicts, ...sup.map((c) => v(c.id, 'rejected'))]
  findingsForSlide(A2.id, m, busy, [])
  ledgerFor(m, busy, A2.id)
  return modelOutput(A2, tissue).supersededCandidates.length === sup.length
})())
ok('each carries the type the replaced run proposed',
  sup.every((c) => typeof c.type === 'string' && c.type.length > 0))
ok('each carries a score band like any candidate',
  sup.every((c) => ['high', 'moderate', 'low'].includes(c.band)))

/* Read-First: they are model output, so the reveal gate governs them. The
   demo fixture leaves A2 unrevealed, which is the state Resume lands on. */
ok('superseded live in model output, not in session state',
  Array.isArray(modelOutput(A2, tissue).supersededCandidates))
ok('the demo case leaves A2 unrevealed, so nothing inferred shows on arrival',
  demo.seededSession?.revealed?.[A2.id] === false)

/* Existing verification is untouched. */
ok('confirm still produces a finding',
  findingsForSlide(A2.id, m, [v(mit[5], 'confirmed')], []).length === 1)
ok('reject still produces none',
  findingsForSlide(A2.id, m, [v(mit[5], 'rejected')], []).length === 0)
ok('reclassify still produces a finding under the new type', (() => {
  const out = findingsForSlide(A2.id, m, [v(mit[5], 'reclassified', 'apoptotic_body')], [])
  return out.length === 1 && out[0].type === 'apoptotic_body' &&
    out[0].proposedType === 'mitotic_figure'
})())

/* -- Model provenance, per slide, per run (J.1 item 7) -------------- */
console.log('\n— model provenance (§J.1) —')
const runsA1 = modelRunsFor(A1)
const runsA2 = modelRunsFor(A2)

ok('a slide analysed once lists exactly one run', runsA1.length === 1, '(' + runsA1.length + ')')
ok('that run is the slide’s own model metadata',
  runsA1[0].id === A1.model?.id && runsA1[0].version === A1.model?.version &&
  runsA1[0].runAt === A1.model?.runAt)
ok('a re-analysed slide lists both runs', runsA2.length === 2, '(' + runsA2.length + ')')
ok('the current run is the one that produced the live candidates',
  runsA2[0].id === 'mitosis-v4.2' && runsA2[0].version === '4.2.1' &&
  runsA2[0].id === A2.model?.id)
ok('the replaced run is named with its own version',
  runsA2[1].id === 'mitosis-v4.1' && runsA2[1].version === '4.1.6')
ok('the two runs are distinguishable, not a repeated line',
  runsA2[0].id !== runsA2[1].id && runsA2[0].runAt !== runsA2[1].runAt)

/* The point of the `current` flag: a past run is documented, never active. */
ok('exactly one run is current', runsA2.filter((r) => r.current).length === 1)
ok('the replaced run is not current', runsA2[1].current === false)
ok('runs are newest first', Date.parse(runsA2[0].runAt) > Date.parse(runsA2[1].runAt))
ok('the current run is the one the live candidates came from', (() => {
  const out = modelOutput(A2, tissue)
  // The replaced run left only superseded objects, held in a separate list.
  return out.candidates.length > 0 && out.supersededCandidates.length > 0 &&
    runsA2.find((r) => r.current)!.id === A2.model!.id
})())
ok('removing the previous run leaves the current one untouched', (() => {
  const once = modelRunsFor({ ...A2, previousModel: undefined })
  return once.length === 1 && once[0].current === true && once[0].id === 'mitosis-v4.2'
})())
ok('a slide with no analysis lists no runs at all', (() => {
  const unanalysed = CASES.flatMap((c) => c.slides).filter((sl) => !sl.model)
  return unanalysed.length > 0 && unanalysed.every((sl) => modelRunsFor(sl).length === 0)
})())
ok('provenance is documentation: a run carries metadata and nothing else',
  runsA2.every((r) => Object.keys(r).sort().join() === 'current,id,runAt,version'))
ok('naming the replaced run adds no Record evidence', (() => {
  // The rail gained a line; the evidence stream must not have gained an object.
  const out = findingsForSlide(A2.id, m, verdicts, [])
  return out.length === recFindings.length &&
    runsA2.every((r) => !out.some((f) => f.id.includes(r.id)))
})())
ok('superseded candidates still reach no finding now that their run is named',
  findingsForSlide(A2.id, m, [...verdicts, ...sup.map((c) => v(c.id, 'confirmed'))], [])
    .every((f) => !f.candidateId?.includes('-sup-')))
ok('the ledger is unchanged by provenance',
  ledgerFor(m, verdicts, A2.id).proposed === m.candidates.length)

/* -- Tile retry -------------------------------------------------- */
console.log('\n— tile retry —')

const t1: FailedTile = { level: 14, x: 3, y: 7 }
const t2: FailedTile = { level: 14, x: 4, y: 7 }
const t3: FailedTile = { level: 15, x: 3, y: 7 }

/* Tracking. */
ok('a failure is recorded', addFailure([], t1).length === 1)
ok('two different tiles are two failures', addFailure(addFailure([], t1), t2).length === 2)
ok('the same tile failing twice is still one failure',
  addFailure(addFailure([], t1), { ...t1 }).length === 1)
ok('the same coordinates at another level are a different tile',
  addFailure(addFailure([], t1), t3).length === 2)
ok('recording a duplicate returns the list unchanged, so no render is triggered', (() => {
  const list = addFailure([], t1)
  return addFailure(list, { ...t1 }) === list
})())
ok('a recorded failure keeps its coordinates',
  tileKey(addFailure([], t1)[0]) === '14/3/7')

/* Clearing on success. */
ok('a tile that loads retires its own failure',
  clearFailure(addFailure(addFailure([], t1), t2), t1).length === 1)
ok('the count reaches zero when every failed tile loads', (() => {
  let list = addFailure(addFailure([], t1), t2)
  list = clearFailure(list, t1)
  list = clearFailure(list, t2)
  return list.length === 0
})())
ok('an unrelated tile loading clears nothing',
  clearFailure(addFailure([], t1), t3).length === 1)
ok('a failure that persists is still reported after a retry', (() => {
  // t1 recovers, t2 fails again: the reader is told about t2 and only t2.
  let list = addFailure(addFailure([], t1), t2)
  list = clearFailure(list, t1)
  list = addFailure(list, t2)
  return list.length === 1 && tileKey(list[0]) === tileKey(t2)
})())

/* Targeting: only the failed records are dropped. */
function fakeImage(): TileMatrixHolder & { tilesMatrix: any } {
  return {
    tilesMatrix: {
      14: { 3: { 7: 'failed-tile', 8: 'good-tile' }, 4: { 7: 'failed-tile' } },
      15: { 3: { 7: 'good-tile' } },
    },
    _needsDraw: false,
  }
}
ok('retry drops exactly the failed tile records', (() => {
  const img = fakeImage()
  const dropped = dropTileRecords(img, [t1, t2])
  return dropped === 2 &&
    img.tilesMatrix[14][3][7] === undefined &&
    img.tilesMatrix[14][4][7] === undefined
})())
ok('retry leaves every other tile record alone', (() => {
  const img = fakeImage()
  dropTileRecords(img, [t1])
  return img.tilesMatrix[14][3][8] === 'good-tile' &&
    img.tilesMatrix[14][4][7] === 'failed-tile' &&
    img.tilesMatrix[15][3][7] === 'good-tile'
})())
ok('retry marks the image for redraw so the request is actually issued', (() => {
  const img = fakeImage()
  dropTileRecords(img, [t1])
  return img._needsDraw === true
})())
ok('retrying nothing touches nothing', (() => {
  const img = fakeImage()
  return dropTileRecords(img, []) === 0 && img._needsDraw === false
})())
ok('retrying a tile the viewer never held is a no-op, not a crash', (() => {
  const img = fakeImage()
  return dropTileRecords(img, [{ level: 99, x: 1, y: 1 }]) === 0 &&
    img._needsDraw === false
})())
ok('retry is idempotent: the second pass drops nothing', (() => {
  const img = fakeImage()
  dropTileRecords(img, [t1])
  return dropTileRecords(img, [t1]) === 0
})())
ok('retry never clears the failures itself — only a loaded tile does', (() => {
  const img = fakeImage()
  const list = addFailure(addFailure([], t1), t2)
  dropTileRecords(img, list)
  return list.length === 2
})())

/* The whole point: no page reload, and nothing else reset with it. */
const statusBarSrc = readFileSync('src/features/workspace/StatusBar.tsx', 'utf8')
const microscopeSrc = readFileSync('src/features/workspace/Microscope.tsx', 'utf8')
ok('Retry does not reload the page', !statusBarSrc.includes('location.reload'))
ok('nothing in the workspace reloads the page', !microscopeSrc.includes('location.reload'))
ok('Retry calls the viewer-registered retry', statusBarSrc.includes('retryTiles?.()'))
ok('retry does not destroy or rebuild the viewer', (() => {
  const retry = microscopeSrc.slice(
    microscopeSrc.indexOf('const retryFailedTiles'),
    microscopeSrc.indexOf('/* ── Viewer lifecycle'),
  )
  return retry.length > 0 && !retry.includes('destroy(') && !retry.includes('open(')
})())
ok('the failure count lives in the view readout, not in the session',
  !readFileSync('src/state/store.ts', 'utf8').includes('tileFailures'))

/* Slide switching: the demo slides share one pyramid, so the viewer is not
   rebuilt and the failures have to be re-scoped by hand. */
ok('failure state is re-scoped on a slide switch, not on the tile source', (() => {
  const i = microscopeSrc.indexOf('Tile failures belong to the slide being read')
  if (i < 0) return false
  const effect = microscopeSrc.slice(i, i + 900)
  return effect.includes('failedTiles.current = []') &&
    effect.includes('tileFailures: 0') &&
    effect.includes('[slide?.id')
})())
ok('a slide switch retries the failed tiles rather than only hiding the count', (() => {
  const i = microscopeSrc.indexOf('Tile failures belong to the slide being read')
  const effect = microscopeSrc.slice(i, i + 900)
  return effect.indexOf('retryFailedTiles()') < effect.indexOf('failedTiles.current = []')
})())
ok('the viewer is still rebuilt only when the tile source changes',
  microscopeSrc.includes('}, [dzi])'))

/* -- Entry sequence ------------------------------------------------ */
console.log('\n— entry sequence —')

const bootCss = readFileSync('src/features/boot/boot.css', 'utf8')
const bootTsx = readFileSync('src/features/boot/BootScreen.tsx', 'utf8')
const bootTiming = readFileSync('src/features/boot/timing.ts', 'utf8')
const appTsx = readFileSync('src/App.tsx', 'utf8')

/* Comments describe the intent; only the declarations are evidence of it. */
const bootCssCode = bootCss.replace(/\/\*[\s\S]*?\*\//g, '')
const bootTsxCode = bootTsx.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

function cssRule(selector: string): string {
  const i = bootCss.indexOf(selector)
  return i < 0 ? '' : bootCss.slice(i, bootCss.indexOf('}', i))
}
function cssDelayIn(selector: string): number {
  const m = /animation:[^;]*?(\d+)ms[^;]*?(\d+)ms/.exec(cssRule(selector))
  return m ? Number(m[2]) : NaN
}
/* Whole keyframe block: up to the closing brace that sits in the first column. */
function keyframes(name: string): string {
  return (new RegExp('@keyframes ' + name + ' \\{[\\s\\S]*?\\n\\}').exec(bootCss) ?? [''])[0]
}

/* Choreography: the stages are ordered, and the order is the concept. */
ok('the read begins while the field is still resolving',
  BOOT.readStartMs > 0 && BOOT.readStartMs < BOOT.fieldMs)
ok('the read is a sequence of rows, not a single wipe',
  BOOT.readRowStaggerMs > 0 && BOOT.readRowStaggerMs < BOOT.readRowMs)
ok('the read turns at the margin rather than restarting',
  bootCss.includes('.boot__row:nth-child(even) .boot__cover'))
ok('an unread row is ground, not a dimmed picture of tissue',
  cssRule('.boot__cover {').includes('background: var(--bg-0)'))
ok('the read uncovers rather than paints over', (() => {
  const kf = keyframes('boot-read')
  return /from \{ transform: scaleX\(1\); \}/.test(kf) &&
    /to\s+\{ transform: scaleX\(0\); \}/.test(kf)
})())
ok('the head of the read belongs to the motion, not to the result', (() => {
  const kf = keyframes('boot-head')
  // It must start dark, or every row would show a head before it was reached.
  return /0%\s*\{ opacity: 0; \}/.test(kf) && /100%\s*\{ opacity: 0; \}/.test(kf)
})())
ok('the wordmark waits until the read is under way',
  BOOT.letterStartMs > rowDelay(0))
ok('characters are staggered, not revealed together',
  BOOT.letterStaggerMs >= 60 && BOOT.letterStaggerMs <= 160)
ok('each character moves for a restrained duration',
  BOOT.letterDurationMs >= 500 && BOOT.letterDurationMs <= 1000)
ok('the stagger is short enough to read as one word, not a queue',
  letterDelay(BOOT_WORDMARK.length - 1) - BOOT.letterStartMs < BOOT.letterDurationMs)
ok('the tracking settles with the last character, not before it',
  BOOT.letterStartMs + BOOT.trackMs >= wordmarkSettledMs() - 100 &&
  BOOT.letterStartMs + BOOT.trackMs <= wordmarkSettledMs() + 100)
ok('the line beneath waits for the wordmark to finish settling',
  BOOT.subtitleStartMs >= wordmarkSettledMs())

/* Read-first, which is the whole reason the sequence is shaped this way. */
ok('the model says nothing until the read has crossed the reveal threshold',
  coverageAt(BOOT.revealMs) >= REVEAL_THRESHOLD,
  '(' + Math.round(coverageAt(BOOT.revealMs) * 100) + '% at reveal)')
ok('and it speaks at that crossing rather than long after it',
  coverageAt(BOOT.revealMs - BOOT.readRowStaggerMs) < REVEAL_THRESHOLD)
ok('the field is still being read when the proposals arrive',
  BOOT.revealMs < readSettledMs())
ok('proposals are staggered, so they read as findings rather than a layer',
  BOOT.markStaggerMs > 0 && BOOT.markStaggerMs < BOOT.markDurationMs)
ok('nothing is confirmed before it has been proposed',
  BOOT_MARKS.every((m, i) => {
    const c = confirmDelay(i)
    return !m.confirmed || (c !== null && c >= markDelay(i) + BOOT.markDurationMs)
  }))
ok('the membrane is crossed only once every proposal is on screen',
  BOOT.membraneMs >= marksSettledMs())
ok('the two registers are introduced in the order the sequence earns them',
  BOOT.revealMs < BOOT.membraneMs)

/* The ending. */
const bootSettled = Math.max(
  readSettledMs(), BOOT.subtitleStartMs + BOOT.subtitleDurationMs,
  marksSettledMs(), membraneSettledMs(),
)
ok('everything has settled before the sequence hands off',
  bootSettled < BOOT.sequenceMs, '(' + bootSettled + 'ms)')
ok('the sequence holds on the finished composition before it lifts',
  BOOT.sequenceMs - bootSettled >= 150)
ok('the whole entry lands near its five-second budget',
  BOOT.sequenceMs + BOOT.exitMs >= 4600 && BOOT.sequenceMs + BOOT.exitMs <= 5600,
  '(' + (BOOT.sequenceMs + BOOT.exitMs) + 'ms)')
ok('a reader who has asked for less motion waits materially less',
  BOOT.reducedMs < BOOT.sequenceMs / 2)

/* The declared timeline and the stylesheet are the same timeline. */
ok('boot.css sweeps each row for the declared duration',
  bootCss.includes('animation: boot-read ' + BOOT.readRowMs + 'ms'))
ok('boot.css runs the character reveal for the declared duration',
  bootCss.includes('animation: boot-letter ' + BOOT.letterDurationMs + 'ms'))
ok('boot.css settles the tracking over the declared duration',
  bootCss.includes('animation: boot-track ' + BOOT.trackMs + 'ms'))
ok('boot.css starts the tracking with the first character',
  cssDelayIn('.boot__letters {') === BOOT.letterStartMs)
ok('boot.css holds the line beneath until its declared cue',
  cssDelayIn('.boot__tag {') === BOOT.subtitleStartMs)
ok('boot.css names the inferred register exactly when the model speaks',
  cssDelayIn('.boot__key--inferred {') === BOOT.revealMs)
ok('boot.css names the measured register exactly when the membrane is crossed',
  cssDelayIn('.boot__key--measured {') === BOOT.membraneMs)
ok('boot.css redraws a confirmed proposal over the declared duration',
  bootCss.includes('boot-confirm-ring ' + BOOT.membraneDurationMs + 'ms') &&
  bootCss.includes('boot-confirm-core ' + BOOT.membraneDurationMs + 'ms'))
ok('boot.css resolves the field over the declared duration',
  bootCss.includes('animation: boot-in ' + BOOT.fieldMs + 'ms'))
ok('the exit fade in boot.css matches the hand-off timer',
  bootCss.includes('transition: opacity ' + BOOT.exitMs + 'ms'))

/* The graticule. Square cells are a construction, not a hope. */
ok('the field carries the aspect ratio of its own cell count',
  bootCss.includes('aspect-ratio: ' + FIELD.cols + ' / ' + FIELD.rows))
ok('the rule is drawn at exactly that cell count',
  bootCss.includes('calc(100% / ' + FIELD.cols + ') calc(100% / ' + FIELD.rows + ')'))
ok('the field is sized against the viewport height as well as its width',
  /--field-w:\s*min\([^;]*vw[^;]*vh[^;]*\)/.test(bootCss))
ok('everything on the field is derived from that one measure',
  cssRule('.boot {').includes('--cell: calc(var(--field-w)'))
ok('the read lays down one row per graticule row',
  bootTsx.includes('length: FIELD.rows'))
ok('the field is marked as an examined area, not a backdrop',
  ['tl', 'tr', 'bl', 'br'].every((c) => bootCss.includes('.boot__corner--' + c)))

/* Composition: where the proposals are allowed to be. */
ok('every proposal sits on the graticule', BOOT_MARKS.every((m) =>
  Number.isInteger(m.col) && Number.isInteger(m.row) &&
  m.col >= 0 && m.col < FIELD.cols && m.row >= 0 && m.row < FIELD.rows))
ok('every proposal lands on a cell centre', BOOT_MARKS.every((m) => {
  const p = markPosition(m)
  return p.left === (((m.col + 0.5) / FIELD.cols) * 100).toFixed(4) + '%' &&
    p.top === (((m.row + 0.5) / FIELD.rows) * 100).toFixed(4) + '%'
}))
ok('no proposal is allowed to compete with the wordmark', BOOT_MARKS.every((m) =>
  !(m.row >= 5 && m.row <= 8 && m.col >= 5 && m.col <= 18)))
ok('proposals appear in the order the read passes over them', BOOT_MARKS.every(
  (m, i) => i === 0 || m.row >= BOOT_MARKS[i - 1].row))
ok('two proposals cross the membrane — enough to state it, few enough to mean it',
  BOOT_MARKS.filter((m) => m.confirmed).length === 2)
ok('the confirmed proposals are not neighbours in the reveal order', (() => {
  const idx = BOOT_MARKS.map((m, i) => (m.confirmed ? i : -1)).filter((i) => i >= 0)
  return idx.length === 2 && idx[1] - idx[0] > 1
})())
ok('an unconfirmed proposal carries no confirmation timing at all',
  BOOT_MARKS.every((m, i) => m.confirmed === (confirmDelay(i) !== null)))
ok('only a confirmed proposal is redrawn in the measured register',
  bootCss.includes('.boot__object--confirmed .boot__ring') &&
  bootCss.includes('.boot__object--confirmed .boot__core') &&
  cssRule('.boot__ring {').includes('var(--inferred)') &&
  !cssRule('.boot__ring {').includes('var(--measured)') &&
  !cssRule('.boot__core {').includes('var(--measured)'))

/* The specimen. Real tissue, laid out so it can never be distorted, and held
   firmly subordinate to the wordmark standing on it. */
ok('the mosaic is the declared block',
  specimenTiles().length === SPECIMEN.cols * SPECIMEN.rows)
ok('every tile renders square, so the tissue is cropped and never stretched', (() => {
  // A tile's width is a percentage of the field's width and its height a
  // percentage of the field's height, so squareness is a statement about both.
  const t = specimenTiles()[0]
  const w = parseFloat(t.width) * FIELD.cols
  const h = parseFloat(t.height) * FIELD.rows
  // Written to four decimal places, so equal means equal at that precision.
  return Math.abs(w - h) < 0.01
})())
ok('the mosaic covers the field rather than fitting inside it', (() => {
  const tiles = specimenTiles()
  const spanned = parseFloat(tiles[0].width) * SPECIMEN.cols
  const tall = parseFloat(tiles[0].height) * SPECIMEN.rows
  return spanned >= 100 && Math.abs(tall - 100) < 0.01
})())
ok('the overflow is split evenly, so the crop is centred', (() => {
  const tiles = specimenTiles()
  const left = parseFloat(tiles[0].left)
  const right = 100 - (left + parseFloat(tiles[0].width) * SPECIMEN.cols)
  return Math.abs(left - right) < 0.01 && left <= 0
})())
ok('the tiles tile: no gaps and no double-drawn columns', (() => {
  const tiles = specimenTiles()
  const w = parseFloat(tiles[0].width)
  return tiles.every((t, i) => {
    const c = i % SPECIMEN.cols, r = Math.floor(i / SPECIMEN.cols)
    return Math.abs(parseFloat(t.left) - (parseFloat(tiles[0].left) + c * w)) < 1e-3 &&
      Math.abs(parseFloat(t.top) - r * parseFloat(tiles[0].height)) < 1e-3
  })
})())
ok('the pyramid overlap pixel is cropped back off',
  cssRule('.boot__tissue > i {').includes('background-size: 100.7874% 100.7874%'))
ok('the specimen is the ground, not the subject', (() => {
  const m = /\.boot__tissue \{[\s\S]*?opacity: ([\d.]+);/.exec(bootCss)
  return m !== null && Number(m[1]) > 0 && Number(m[1]) <= 0.2
})())
ok('the specimen resolves into focus as the read begins',
  cssDelayIn('.boot__tissue {') === BOOT.readStartMs &&
  /from \{ filter: [^}]*blur\([\d.]+px\)/.test(keyframes('boot-focus')) &&
  /to\s+\{ filter: [^}]*blur\(0\)/.test(keyframes('boot-focus')))
ok('the field still reads as read if the pyramid is not on disk',
  /\.boot__field \{[\s\S]*?background-color: color-mix\(in srgb, var\(--text\)/.test(bootCss))
ok('the tissue sits under the read and the graticule over it', (() => {
  const i = bootTsx.indexOf('className="boot__tissue"')
  const j = bootTsx.indexOf('className="boot__read"')
  const k = bootTsx.indexOf('className="boot__grid"')
  return i > 0 && j > i && k > j
})())
ok('the graticule rules the specimen at the declared cell count',
  cssRule('.boot__grid {').includes(
    'background-size: calc(100% / ' + FIELD.cols + ') calc(100% / ' + FIELD.rows + ')'))
ok('a proposal is separated from the tissue it sits on',
  cssRule('.boot__ring {').includes('box-shadow'))
ok('the wordmark is given ground to stand on',
  /\.boot__centre::before \{[\s\S]*?radial-gradient\([\s\S]*?var\(--bg-0\)/.test(bootCss))
ok('the type paints over that ground rather than under it',
  cssRule('.boot__word {').includes('position: relative') &&
  cssRule('.boot__tag {').includes('position: relative'))

/* Motion character: restrained, and the product's own easing throughout. */
ok('the entry eases the way the rest of the product eases',
  !bootCssCode.includes('cubic-bezier') &&
  (bootCss.match(/var\(--ease\)/g) ?? []).length >= 8)
ok('nothing overshoots, springs or rebounds',
  !/elastic|overshoot|spring/i.test(bootCssCode))
ok('nothing spins and nothing pulses forever',
  !/rotate\(/.test(bootCssCode) && !/infinite/.test(bootCssCode))
ok('the wordmark resolves rather than arrives', (() => {
  const kf = keyframes('boot-letter')
  return kf.includes('blur(') && kf.includes('translate3d') && !kf.includes('scale(')
})())
ok('the read is compositor work, not layout work', (() => {
  const kf = keyframes('boot-read')
  return kf.includes('scaleX(0)') && kf.includes('scaleX(1)') &&
    !kf.includes('width') && !kf.includes('left')
})())
ok('the tracking closes rather than opens', (() => {
  const m = /from \{ letter-spacing: ([\d.]+)em[\s\S]*?to\s+\{ letter-spacing: ([\d.]+)em/
    .exec(keyframes('boot-track'))
  return m !== null && Number(m[1]) > Number(m[2]) &&
    cssRule('.boot__letters {').includes('letter-spacing: ' + m[2] + 'em')
})())

/* Colour carries meaning here, so it comes only from the tokens that carry it. */
ok('the entry writes no colour of its own',
  !/#[0-9a-fA-F]{3,8}\b/.test(bootCssCode) && !/rgba?\(/.test(bootCssCode))
ok('the two registers are the product\'s own evidence tokens',
  bootCss.includes('var(--inferred)') && bootCss.includes('var(--measured)'))
ok('the entry stands on the ground the application stands on',
  cssRule('.boot {').includes('background: var(--bg-0)'))
ok('the wordmark is set in the product\'s display face',
  cssRule('.boot__word {').includes('font-family: var(--font-display)'))
ok('the instrument text is set in the product\'s mono face',
  cssRule('.boot__tag {').includes('font-family: var(--font-mono)') &&
  cssRule('.boot__base {').includes('font-family: var(--font-mono)'))
ok('the entry fetches no font of its own', !bootCss.includes('@import'))

/* Architecture: the entry is a leaf, and it costs nothing. */
ok('the entry adds no dependency', (() => {
  const imports = bootTsx.match(/from '[^']+'/g) ?? []
  return imports.every((s) => s === "from 'react'" || s === "from './timing'" ||
    s === "from './boot.css'")
})())
ok('the choreography module depends on nothing at all',
  !bootTiming.includes('import '))
ok('the entry reaches into no domain or application state',
  !bootTsx.includes('@/domain') && !bootTsx.includes('@/state'))
ok('the entry animates nothing on the main thread',
  !bootTsx.includes('requestAnimationFrame') && !bootTsx.includes('setInterval'))
ok('the entry does not navigate',
  !bootTsx.includes('Router') && !bootTsx.includes('useNavigate'))
ok('the entry loads no remote asset and no stock imagery', (() => {
  const urls = [...bootTsx.matchAll(/url\(\${?([^)$]*)/g)].map((m) => m[1])
  return !bootTsxCode.includes('<img') && !bootCssCode.includes('url(') &&
    urls.every((u) => u.startsWith('t.url') || u === '') &&
    !/https?:/.test(bootTsxCode) && !/https?:/.test(bootCssCode)
})())
ok('the tissue is the case the workspace itself streams',
  specimenTiles().every((t) => t.url.startsWith('/dzi/morpha-slide_files/')))
ok('the router mounts beneath the entry rather than after it',
  appTsx.includes('{hydrated && <RouterProvider') && appTsx.includes('{booting && <BootScreen'))

/* Accessibility and exit. */
ok('the entry is announced once, in words, not as decoration',
  bootTsx.includes('role="status"') &&
  bootTsx.includes('<span className="sr-only">MORPHA'))
ok('the drawn sequence is hidden from assistive technology',
  bootTsx.includes('className="boot__stage" aria-hidden="true"'))
ok('the entry honours a request for reduced motion',
  bootTsx.includes("matchMedia?.('(prefers-reduced-motion: reduce)')") &&
  bootCss.includes('@media (prefers-reduced-motion: reduce)'))
const reducedBlock = bootCss.slice(bootCss.indexOf('@media (prefers-reduced-motion: reduce)'))
ok('reduced motion stills every stage, not merely the wordmark',
  ['.boot__frame,', '.boot__tissue,', '.boot__cover,', '.boot__letters,', '.boot__object,',
    '.boot__tag,'].every((s) => reducedBlock.includes(s)))
ok('reduced motion still shows the finished composition, membrane included',
  reducedBlock.includes('.boot__cover { transform: scaleX(0); }') &&
  reducedBlock.includes('.boot__head { display: none; }') &&
  /\.boot__tissue \{ filter: saturate\([\d.]+\) contrast\([\d.]+\); \}/.test(reducedBlock) &&
  reducedBlock.includes('border-color: var(--measured)'))
ok('the entry can be skipped without adding a control',
  bootTsx.includes("addEventListener('pointerdown'") &&
  bootTsx.includes("addEventListener('keydown'"))
ok('the hand-off runs exactly once however it is triggered',
  bootTsx.includes('if (leavingRef.current) return'))
ok('the entry cleans up every timer it starts',
  bootTsx.includes('window.clearTimeout(t)') && bootTsx.includes('removeEventListener'))

console.log('\n— QC geometry —')
const q = m.qcRegions[0]
ok('QC polygon has area', Math.abs(polygonArea(q.polygon) - q.areaPx) < 1)
ok('rect/polygon overlap is bounded', (() => {
  const o = rectPolygonOverlapArea(
    { x: q.polygon[0].x - 100, y: q.polygon[0].y - 100, w: 200, h: 200 }, q.polygon,
  )
  return o >= 0 && o <= 200 * 200
})())

console.log('\n— readiness glyph —')
ok('all complete → ready', readinessGlyph([{ ...A2, analysis: 'complete' }, { ...A2, analysis: 'complete' }]) === 'ready')
ok('any failed → attention', readinessGlyph([{ ...A2, analysis: 'complete' }, { ...A2, analysis: 'failed' }]) === 'attention')
ok('any running → working', readinessGlyph([{ ...A2, analysis: 'complete' }, { ...A2, analysis: 'analyzing' }]) === 'working')
ok('mixed, none failed → partial', readinessGlyph([{ ...A2, analysis: 'complete' }, { ...A2, analysis: 'partially_analyzed' }]) === 'partial')
ok('no analysis anywhere → manual', readinessGlyph([{ ...A2, analysis: 'out_of_scope' }, { ...A2, analysis: 'not_available' }]) === 'manual')
ok('demo case A1 is QC-flagged', slideQcState(demo.slides[0]) === 'flagged')

console.log('\n— worklist —')
ok('every case has slides', CASES.every((c) => c.slides.length > 0))
ok('accessions are unique', new Set(CASES.map((c) => c.id)).size === CASES.length)
ok('slide ids are unique',
  new Set(CASES.flatMap((c) => c.slides.map((s) => s.id))).size ===
  CASES.reduce((acc, c) => acc + c.slides.length, 0))
ok('all seven analysis states appear',
  new Set(CASES.flatMap((c) => c.slides.map((s) => s.analysis))).size === 7)
ok('all five case states appear', new Set(CASES.map((c) => c.status)).size === 5)
ok('seeded sessions reference real slides',
  CASES.every((c) => !c.seededSession || c.slides.some((s) => s.id === c.seededSession!.activeSlideId)))

console.log(failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} CHECK(S) FAILED\n`)
if (failures > 0) process.exit(1)
