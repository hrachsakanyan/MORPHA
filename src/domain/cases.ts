import { CURRENT_USER } from './constants'
import type { CaseDef, SlideDef } from './types'

/**
 * Demo worklist.
 *
 * Every slide renders the same real breast H&E whole-slide image
 * (TCGA-AN-A0FL, 122,807 × 71,603 px, 0.248 µm/px). That is a demo constraint,
 * not a product claim — the metadata, states and model output differ per slide,
 * the pixels do not.
 */

const DZI = '/dzi/morpha-slide.dzi'
const W = 122807
const H = 71603
const MPP = 0.248

let seedCounter = 1000
function slide(partial: Partial<SlideDef> & { id: string; label: string }): SlideDef {
  seedCounter += 977
  return {
    block: partial.label[0],
    stain: 'H&E',
    level: 'Level 1',
    dzi: DZI,
    width: W,
    height: H,
    mpp: MPP,
    format: 'Aperio SVS',
    formatSupported: true,
    analysis: 'complete',
    seed: seedCounter,
    model: { id: 'mitosis-v4.2', version: '4.2.1', runAt: '2026-08-29T21:14:00Z' },
    ...partial,
  }
}

const A1 = slide({
  id: 'MOR-2026-00421.A1',
  label: 'A1',
  level: 'Level 1',
  seed: 1421,
  analysis: 'complete',
  synth: {
    clusters: [
      { type: 'mitotic_figure', members: 14 },
      { type: 'mitotic_figure', members: 6 },
      { type: 'tumor_region', members: 5 },
      { type: 'necrosis', members: 3 },
    ],
    qc: [
      { type: 'focus', fraction: 0.026 },
      { type: 'fold', fraction: 0.015 },
    ],
  },
})

const A2 = slide({
  id: 'MOR-2026-00421.A2',
  label: 'A2',
  level: 'Level 2',
  seed: 4212,
  analysis: 'complete',
  // A2 was re-analysed: v4.1.6 ran first, v4.2.1 replaced it. The earlier run's
  // objects are retained as Superseded (§K.3) — never adjudicated, never
  // deleted, and never counted.
  previousModel: { id: 'mitosis-v4.1', version: '4.1.6', runAt: '2026-08-29T09:41:00Z' },
  synth: {
    // 47 proposed objects: 34 mitotic in two clusters, then the long tail.
    clusters: [
      { type: 'mitotic_figure', members: 23 },
      { type: 'mitotic_figure', members: 11 },
      { type: 'tumor_region', members: 6 },
      { type: 'necrosis', members: 4 },
      { type: 'cellular_density', members: 3 },
    ],
    qc: [{ type: 'fold', fraction: 0.012 }],
    superseded: [
      { type: 'mitotic_figure', members: 5 },
      { type: 'cellular_density', members: 2 },
    ],
  },
})

const A3 = slide({
  id: 'MOR-2026-00421.A3',
  label: 'A3',
  level: 'Level 3',
  seed: 7731,
  analysis: 'partially_analyzed',
  synth: {
    clusters: [
      { type: 'mitotic_figure', members: 9 },
      { type: 'tumor_region', members: 4 },
    ],
    qc: [],
  },
})

export const CASES: CaseDef[] = [
  {
    id: 'MOR-2026-00421',
    accession: 'MOR-2026-00421',
    specimen: 'Breast',
    laterality: 'LEFT',
    procedure: 'Excision',
    priority: 'Routine',
    status: 'in_review',
    receivedAt: '2026-08-28T08:20:00Z',
    assignedTo: CURRENT_USER,
    clinicalNote:
      'Screen-detected mass, upper outer quadrant. Core biopsy reported invasive ductal carcinoma, grade pending on excision. Mitotic count requested for Nottingham grading.',
    slides: [A1, A2, A3],
    lastActivity: { at: '2026-08-30T09:41:00Z', by: CURRENT_USER, what: 'Reviewed candidates on A1' },
    seededSession: {
      activeSlideId: A2.id,
      // A2 is left at the reveal threshold, so Resume lands on the read-first moment.
      coverage: {
        [A1.id]: { orientation: 0.88, diagnostic: 0.34 },
        [A2.id]: { orientation: 0.72, diagnostic: 0.19 },
        [A3.id]: { orientation: 0, diagnostic: 0 },
      },
      revealed: { [A1.id]: true, [A2.id]: false, [A3.id]: false },
    },
  },
  {
    id: 'MOR-2026-00445',
    accession: 'MOR-2026-00445',
    specimen: 'Breast',
    laterality: 'RIGHT',
    procedure: 'Core biopsy',
    priority: 'STAT',
    status: 'new',
    receivedAt: '2026-08-30T06:05:00Z',
    assignedTo: CURRENT_USER,
    clinicalNote: 'Palpable lump, rapid growth over six weeks. Frozen section not performed.',
    slides: [
      slide({
        id: 'MOR-2026-00445.A1', label: 'A1', analysis: 'analyzing',
        synth: { clusters: [{ type: 'mitotic_figure', members: 12 }], qc: [] },
      }),
      slide({ id: 'MOR-2026-00445.A2', label: 'A2', analysis: 'queued' }),
    ],
  },
  {
    id: 'MOR-2026-00437',
    accession: 'MOR-2026-00437',
    specimen: 'Breast',
    laterality: 'RIGHT',
    procedure: 'Core biopsy',
    priority: 'Urgent',
    status: 'new',
    receivedAt: '2026-08-29T14:10:00Z',
    assignedTo: CURRENT_USER,
    clinicalNote: 'BI-RADS 5 lesion, ultrasound guided core. Grading requested.',
    slides: [
      slide({
        id: 'MOR-2026-00437.A1', label: 'A1', seed: 3311,
        synth: {
          clusters: [
            { type: 'mitotic_figure', members: 18 },
            { type: 'tumor_region', members: 4 },
          ],
          qc: [{ type: 'edge', fraction: 0.008 }],
        },
      }),
      slide({
        id: 'MOR-2026-00437.A2', label: 'A2', seed: 3312,
        synth: { clusters: [{ type: 'mitotic_figure', members: 7 }], qc: [] },
      }),
    ],
  },
  {
    id: 'MOR-2026-00448',
    accession: 'MOR-2026-00448',
    specimen: 'Breast',
    laterality: 'LEFT',
    procedure: 'Core biopsy',
    priority: 'Urgent',
    status: 'new',
    receivedAt: '2026-08-29T17:52:00Z',
    assignedTo: CURRENT_USER,
    clinicalNote: 'Architectural distortion on tomosynthesis.',
    slides: [
      // Demonstrates `Analysis Failed` (§K.2, §L). The reason must name a
      // failure of the model run — a reason that sounds like an image-pipeline
      // fault reads as a broken viewer, which is exactly the wrong impression
      // for a state whose whole point is that the workspace still works.
      slide({
        id: 'MOR-2026-00448.A1', label: 'A1', analysis: 'failed',
        analysisFailReason: 'Model run timed out after 1,800 s',
      }),
      slide({
        id: 'MOR-2026-00448.A2', label: 'A2', seed: 5150,
        synth: { clusters: [{ type: 'mitotic_figure', members: 5 }], qc: [] },
      }),
    ],
  },
  {
    id: 'MOR-2026-00402',
    accession: 'MOR-2026-00402',
    specimen: 'Breast',
    laterality: 'LEFT',
    procedure: 'Excision',
    priority: 'Routine',
    status: 'paused',
    pauseReason: 'Pending IHC',
    receivedAt: '2026-08-24T09:00:00Z',
    assignedTo: CURRENT_USER,
    clinicalNote: 'Margins requested. Deferred pending hormone receptor studies.',
    slides: [
      slide({
        id: 'MOR-2026-00402.A1', label: 'A1', seed: 8801,
        synth: { clusters: [{ type: 'mitotic_figure', members: 11 }, { type: 'necrosis', members: 3 }], qc: [] },
      }),
      slide({
        id: 'MOR-2026-00402.A2', label: 'A2', seed: 8802,
        synth: { clusters: [{ type: 'mitotic_figure', members: 8 }], qc: [{ type: 'bubble', fraction: 0.01 }] },
      }),
      slide({ id: 'MOR-2026-00402.A3', label: 'A3', seed: 8803, synth: { clusters: [{ type: 'tumor_region', members: 5 }], qc: [] } }),
    ],
    seededSession: {
      activeSlideId: 'MOR-2026-00402.A1',
      coverage: {
        'MOR-2026-00402.A1': { orientation: 0.96, diagnostic: 0.61 },
        'MOR-2026-00402.A2': { orientation: 0.44, diagnostic: 0.12 },
        'MOR-2026-00402.A3': { orientation: 0, diagnostic: 0 },
      },
      revealed: { 'MOR-2026-00402.A1': true, 'MOR-2026-00402.A2': true, 'MOR-2026-00402.A3': false },
    },
  },
  {
    id: 'MOR-2026-00391',
    accession: 'MOR-2026-00391',
    specimen: 'Breast',
    laterality: 'LEFT',
    procedure: 'Mastectomy',
    priority: 'Routine',
    status: 'ready',
    receivedAt: '2026-08-21T11:30:00Z',
    assignedTo: CURRENT_USER,
    clinicalNote: 'Multifocal disease. Sentinel nodes reported separately.',
    slides: [
      slide({ id: 'MOR-2026-00391.A1', label: 'A1', seed: 9101, synth: { clusters: [{ type: 'mitotic_figure', members: 16 }], qc: [] } }),
      slide({ id: 'MOR-2026-00391.A2', label: 'A2', seed: 9102, synth: { clusters: [{ type: 'mitotic_figure', members: 9 }], qc: [] } }),
      slide({ id: 'MOR-2026-00391.A3', label: 'A3', seed: 9103, analysis: 'partially_analyzed', synth: { clusters: [{ type: 'necrosis', members: 4 }], qc: [] } }),
      slide({
        id: 'MOR-2026-00391.A4', label: 'A4', analysis: 'not_available',
        dzi: null, format: 'Hamamatsu NDPI', formatSupported: false,
      }),
    ],
    seededSession: {
      activeSlideId: 'MOR-2026-00391.A1',
      coverage: {
        'MOR-2026-00391.A1': { orientation: 0.99, diagnostic: 0.82 },
        'MOR-2026-00391.A2': { orientation: 0.91, diagnostic: 0.66 },
        'MOR-2026-00391.A3': { orientation: 0.87, diagnostic: 0.51 },
        'MOR-2026-00391.A4': { orientation: 0, diagnostic: 0 },
      },
      revealed: {
        'MOR-2026-00391.A1': true, 'MOR-2026-00391.A2': true,
        'MOR-2026-00391.A3': true, 'MOR-2026-00391.A4': false,
      },
    },
  },
  {
    id: 'MOR-2026-00450',
    accession: 'MOR-2026-00450',
    specimen: 'Colon, sigmoid',
    laterality: 'NOT APPLICABLE',
    procedure: 'Endoscopic biopsy',
    priority: 'Routine',
    status: 'new',
    receivedAt: '2026-08-30T07:40:00Z',
    assignedTo: CURRENT_USER,
    clinicalNote: 'Surveillance biopsy. No breast model applies; read manually.',
    slides: [
      slide({ id: 'MOR-2026-00450.A1', label: 'A1', analysis: 'out_of_scope', model: undefined }),
      slide({ id: 'MOR-2026-00450.A2', label: 'A2', analysis: 'out_of_scope', model: undefined }),
    ],
  },
  {
    id: 'MOR-2026-00452',
    accession: 'MOR-2026-00452',
    specimen: 'Breast',
    laterality: 'RIGHT',
    procedure: 'Excision',
    priority: 'Routine',
    status: 'new',
    receivedAt: '2026-08-30T05:15:00Z',
    assignedTo: CURRENT_USER,
    clinicalNote: 'Re-excision for close margin.',
    slides: [
      slide({ id: 'MOR-2026-00452.A1', label: 'A1', analysis: 'not_available', model: undefined }),
      slide({ id: 'MOR-2026-00452.A2', label: 'A2', analysis: 'not_available', model: undefined }),
    ],
  },
  {
    id: 'MOR-2026-00358',
    accession: 'MOR-2026-00358',
    specimen: 'Breast',
    laterality: 'RIGHT',
    procedure: 'Excision',
    priority: 'Routine',
    status: 'finalized',
    receivedAt: '2026-08-14T10:05:00Z',
    assignedTo: CURRENT_USER,
    clinicalNote: 'Grade 2 invasive carcinoma of no special type. Signed out 26 Aug.',
    slides: [
      slide({ id: 'MOR-2026-00358.A1', label: 'A1', seed: 6601, synth: { clusters: [{ type: 'mitotic_figure', members: 13 }], qc: [] } }),
      slide({ id: 'MOR-2026-00358.A2', label: 'A2', seed: 6602, synth: { clusters: [{ type: 'mitotic_figure', members: 6 }], qc: [] } }),
    ],
    seededSession: {
      activeSlideId: 'MOR-2026-00358.A1',
      coverage: {
        'MOR-2026-00358.A1': { orientation: 1, diagnostic: 0.78 },
        'MOR-2026-00358.A2': { orientation: 0.98, diagnostic: 0.71 },
      },
      revealed: { 'MOR-2026-00358.A1': true, 'MOR-2026-00358.A2': true },
    },
  },
  {
    id: 'MOR-2026-00299',
    accession: 'MOR-2026-00299',
    specimen: 'Breast',
    laterality: 'LEFT',
    procedure: 'Excision',
    priority: 'Routine',
    status: 'in_review',
    receivedAt: '2026-08-18T13:25:00Z',
    assignedTo: 'Dr. M. Petrosyan',
    clinicalNote: 'Second reader requested for mitotic count discrepancy.',
    slides: [
      slide({ id: 'MOR-2026-00299.A1', label: 'A1', seed: 2201, synth: { clusters: [{ type: 'mitotic_figure', members: 21 }], qc: [{ type: 'pen', fraction: 0.009 }] } }),
    ],
    lastActivity: { at: '2026-08-29T16:02:00Z', by: 'Dr. M. Petrosyan', what: 'Confirmed 6 candidates' },
  },
]

export const CASE_BY_ID = new Map(CASES.map((c) => [c.id, c]))

export function findCase(id: string | undefined): CaseDef | undefined {
  return id ? CASE_BY_ID.get(id) : undefined
}
