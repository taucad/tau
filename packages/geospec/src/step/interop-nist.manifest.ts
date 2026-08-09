/**
 * Per-file expectation manifest for the NIST AP242 PMI interop corpus
 * (`fixtures/interop/nist-pmi/` — pristine upstream artifacts, never edited).
 *
 * Every expectation is corpus-derived: product names, datum identification
 * letters, datum-system counts, supplemental item names, and raw coordinates
 * were extracted from the committed STEP text (see PROVENANCE.md for the
 * feature matrix). Expectations assert on **reader evidence**, never on file
 * text, and change only with corpus-derived evidence (NIST verification PDFs)
 * — never to green a row.
 */

/* eslint-disable @typescript-eslint/naming-convention -- pinned-origin keys are corpus item names like 'ABC'. */

export type InteropExpectation = {
  /** Fixture filename under fixtures/interop/nist-pmi/. */
  file: string;
  /** STEP PRODUCT names that must appear as occurrence product identities. */
  partProductNames: string[];
  /**
   * Exact sorted set of semantic GD&T datum identification letters
   * (`DATUM(...,'A')`). Empty means the file must yield NO semantic datums
   * (the graphical-only negative control).
   */
  semanticDatumLabels: string[];
  /** Labels whose datums must resolve at least one attached face index. */
  semanticDatumLabelsWithFaces: string[];
  /** Exact count of distinct DATUM_SYSTEM entities in the file. */
  datumSystemCount: number;
  /** Exact sorted set of named supplemental-geometry PLANE items (CGR channel). */
  supplementalPlaneNames: string[];
  /** Exact sorted set of named supplemental AXIS2_PLACEMENT_3D items (CGR channel). */
  datumPlacementNames: string[];
  /**
   * Pinned subject-frame origins (mm) for named supplemental items, extracted
   * from the file's own coordinates in its owning representation context.
   * Catches unit-resolution defects (F5) to 1e-3 mm.
   */
  pinnedOrigins: Record<string, [number, number, number]>;
  /**
   * Minimum part AABB diagonal (mm). Guards shape unit normalization on
   * inch-context files: an unconverted inch part reads ~25x too small.
   */
  partAabbMinDiagonalMm?: number;
};

export const interopExpectations: InteropExpectation[] = [
  {
    // AP203 graphical-only negative control: no semantic PMI; its one CGR
    // holds two UNNAMED placements — identity lives on items (rec practice),
    // so an unnamed item under the literal 'supplemental geometry' name is
    // channel plumbing, not a datum frame. No false positives.
    file: 'nist_ctc_01_asme1_ap203.stp',
    partProductNames: ['nist_ctc_01_asme1'],
    semanticDatumLabels: [],
    semanticDatumLabelsWithFaces: [],
    datumSystemCount: 0,
    supplementalPlaneNames: [],
    datumPlacementNames: [],
    pinnedOrigins: {},
  },
  {
    file: 'nist_ctc_01_asme1_ap242-e1.stp',
    partProductNames: ['NIST Test Case 1'],
    semanticDatumLabels: ['A', 'B', 'C'],
    semanticDatumLabelsWithFaces: ['A', 'B', 'C'],
    datumSystemCount: 2,
    supplementalPlaneNames: [],
    datumPlacementNames: [],
    pinnedOrigins: {},
  },
  {
    // Datums A/B/C are point datum targets attached to isolated
    // CARTESIAN_POINTs (GISU 'DATUM TARGET' items) — the file carries no face
    // evidence for them; D–K attach to faces.
    file: 'nist_ctc_02_asme1_ap242-e2.stp',
    partProductNames: ['NIST Test Case 02'],
    semanticDatumLabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K'],
    semanticDatumLabelsWithFaces: ['D', 'E', 'F', 'G', 'H', 'J', 'K'],
    datumSystemCount: 14,
    supplementalPlaneNames: ['Datum Plane 1', 'Datum Plane 2'],
    datumPlacementNames: [],
    pinnedOrigins: {
      'Datum Plane 1': [0, 200, 0],
      'Datum Plane 2': [0, 0, -185],
    },
  },
  {
    // Inch shape context; no CGR channel. The AABB gate proves shape unit
    // normalization; semantic datums prove edition-1 GDT parsing.
    file: 'nist_ctc_05_asme1_ap242-e1.stp',
    partProductNames: ['nist_ctc_05_asme1'],
    semanticDatumLabels: ['A', 'B', 'C', 'D'],
    semanticDatumLabelsWithFaces: ['A'],
    datumSystemCount: 5,
    supplementalPlaneNames: [],
    datumPlacementNames: [],
    pinnedOrigins: {},
    partAabbMinDiagonalMm: 50,
  },
  {
    file: 'nist_ftc_06_asme1_ap242-e2.stp',
    partProductNames: ['NIST PMI FTC 06 ASME1'],
    semanticDatumLabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K'],
    semanticDatumLabelsWithFaces: ['A'],
    datumSystemCount: 12,
    supplementalPlaneNames: [
      'Datum Plane 1',
      'Datum Plane 10',
      'Datum Plane 11',
      'Datum Plane 2',
      'Datum Plane 3',
      'Datum Plane 4',
      'Datum Plane 5',
      'Datum Plane 6',
      'Datum Plane 7',
      'Datum Plane 8',
      'Datum Plane 9',
    ],
    datumPlacementNames: ['ABC', 'DBC', 'DCJ', 'DCK', 'DG', 'DH', 'EAB', 'F1', 'F2', 'F3', 'F4'],
    pinnedOrigins: {
      DBC: [0, 31.750_000_000_127, 0],
      'Datum Plane 1': [152.400_000_000_61, 2.842_170_943_040_4e-14, 0],
    },
  },
  {
    // Edition-3 parse parity; inch shape context with a millimetre CGR
    // context — the per-context unit gate (supplemental coords are already
    // mm in the file and must NOT be rescaled by the shape context factor).
    file: 'nist_stc_06_asme1_ap242-e3.stp',
    partProductNames: ['nist_stc_06_asme1'],
    semanticDatumLabels: ['A', 'B', 'C', 'D', 'E', 'F'],
    semanticDatumLabelsWithFaces: ['A'],
    datumSystemCount: 9,
    supplementalPlaneNames: [
      'Datum Plane (27)',
      'Datum Plane (29)',
      'Datum Plane (7)',
      'Datum Plane (9)',
      'DatumPlane',
    ],
    datumPlacementNames: [
      'Coordinate System 2833',
      'Coordinate System 2834',
      'Coordinate System 2835',
      'Coordinate System 2836',
      'Coordinate System 2837',
      'Coordinate System 2838',
      'Coordinate System 2839',
      'Coordinate System 2841',
      'Coordinate System 2842',
      'Coordinate System 2843',
      'Coordinate System 2844',
      'Coordinate System 2845',
      'Coordinate System 2846',
      'Coordinate System 2847',
      'Coordinate System 2848',
      'Coordinate System 2849',
      'Coordinate System 2850',
      'Coordinate System 2851',
      'Coordinate System 2991',
      'Coordinate System 2992',
      'Coordinate System 2993',
      'Coordinate System 2994',
      'Coordinate System 2995',
      'Coordinate System 2996',
      'Coordinate System 2997',
      'Coordinate System 2998',
      'Coordinate System 2999',
      'Coordinate System 3000',
      'Coordinate System 3001',
      'Coordinate System 3002',
      'Coordinate System 3004',
    ],
    pinnedOrigins: {
      'Datum Plane (7)': [82.55, -76.2, 64.77],
      'Datum Plane (29)': [117.475, 0, 82.544_92],
    },
    partAabbMinDiagonalMm: 50,
  },
  {
    file: 'nist_stc_08_asme1_ap242-e3.stp',
    partProductNames: ['NIST PMI STC 08 ASME1'],
    semanticDatumLabels: ['A', 'B', 'C', 'D', 'E', 'G', 'H', 'J'],
    semanticDatumLabelsWithFaces: ['A'],
    datumSystemCount: 9,
    supplementalPlaneNames: ['Datum Plane 1'],
    datumPlacementNames: [
      'ABC',
      'Axis System.17',
      'Axis System.18',
      'Axis System.19',
      'Axis System.7',
      'Axis System.8',
      'DBC',
      'DE-F',
      'DG',
      'DHJ',
      'DKL',
    ],
    pinnedOrigins: {
      ABC: [142.875_000_000_572, 98.425_000_000_393_7, 0],
      'Datum Plane 1': [-155.797_250_000_623, 108.299_250_000_433, 0],
    },
  },
];
