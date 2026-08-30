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
import { findingsForSlide, ledgerFor, readinessGlyph, slideQcState } from '@/domain/derive'
import {
  frameHandleAt, polygonArea, rectCorners, rectPolygonOverlapArea, resizeRect,
} from '@/lib/geometry'
import { CASES } from '@/domain/cases'
import type { TissueData } from '@/domain/tissue'
import type { Annotation, Finding, Verdict } from '@/domain/types'

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
