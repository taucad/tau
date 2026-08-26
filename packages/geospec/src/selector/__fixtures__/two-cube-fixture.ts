/**
 * Hand-built XDE fixture for selector index and resolution tests (plain data,
 * no wasm): two occurrences of one product — `cubeB` with a NON-IDENTITY
 * placement (rotate 90° about Z, translate +20 x) — plus duplicated `bolt`
 * instance names disambiguated as `bolt[k]` paths per the AP242 profile.
 *
 * All face facts and datum placements are in the SUBJECT frame, matching the
 * verification kernel's `faceFacts` contract and native AP242 datum reader.
 *
 * @module
 */

import type { XdeReadResult } from '#step/types.js';
import { buildSelectorIndex } from '#selector/index-builder.js';
import type { SelectorFaceFactsTable, SelectorIndex } from '#selector/index-builder.js';

export const identityTransform = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Rotate 90° about Z, then translate +20 on x (row-major). */
export const cubeTransformB = [0, -1, 0, 20, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export const createFixtureXde = (): XdeReadResult => ({
  occurrences: [
    { path: 'cubeA', productName: 'Cube', instanceName: 'cubeA', transform: [...identityTransform], shapeIndex: 0 },
    { path: 'cubeB', productName: 'Cube', instanceName: 'cubeB', transform: [...cubeTransformB], shapeIndex: 1 },
    { path: 'bolt[1]', productName: 'Bolt', instanceName: 'bolt', transform: [...identityTransform], shapeIndex: 2 },
    { path: 'bolt[2]', productName: 'Bolt', instanceName: 'bolt', transform: [...identityTransform], shapeIndex: 3 },
  ],
  subshapeNames: [
    { occurrencePath: 'cubeA', name: 'face.top', shapeType: 'face', faceIndex: 0 },
    { occurrencePath: 'cubeA', name: 'face.bottom', shapeType: 'face', faceIndex: 1 },
    { occurrencePath: 'cubeA', name: 'bore[1]', shapeType: 'face', faceIndex: 3 },
    { occurrencePath: 'cubeA', name: 'bore[2]', shapeType: 'face', faceIndex: 4 },
    { occurrencePath: 'cubeA', name: 'bore[3]', shapeType: 'face', faceIndex: 5 },
    { occurrencePath: 'cubeA', name: 'ghost', shapeType: 'face', faceIndex: 99 },
    { occurrencePath: 'cubeA', name: 'seam', shapeType: 'edge', faceIndex: 0 },
    { occurrencePath: 'cubeB', name: 'face.a', shapeType: 'face', faceIndex: 0 },
    { occurrencePath: 'cubeB', name: 'sideBore', shapeType: 'face', faceIndex: 1 },
  ],
  datumPlacements: [
    {
      occurrencePath: 'cubeA',
      name: 'origin',
      origin: [0, 0, 0],
      xAxis: [1, 0, 0],
      zAxis: [0, 0, 1],
    },
    {
      occurrencePath: 'cubeB',
      name: 'origin',
      origin: [20, 0, 0],
      xAxis: [0, 1, 0],
      zAxis: [0, 0, 1],
    },
  ],
  semanticDatums: [
    // Plane-feature datum on cubeA's top face; frame derives from face facts.
    { occurrencePath: 'cubeA', label: 'A', faceIndexes: [0] },
    // Cylinder-feature datum on cubeA's bore.
    { occurrencePath: 'cubeA', label: 'B', faceIndexes: [2] },
    // Point-target datum with no face attachment — no frame derivable.
    { occurrencePath: 'cubeA', label: 'C', faceIndexes: [] },
  ],
  datumSystems: [{ occurrencePath: 'cubeA', name: 'Datum System.1', references: [['A'], ['B', 'C']] }],
  supplementalPlanes: [],
  freeShapeCount: 0,
});

export const createFixtureFaceFacts = (): SelectorFaceFactsTable => ({
  cubeA: {
    faces: [
      {
        faceIndex: 0,
        surfaceType: 'plane',
        normal: [0, 0, 1],
        offset: 10,
        area: 100,
        centroid: [5, 5, 10],
        bounds: { min: [0, 0, 10], max: [10, 10, 10] },
      },
      {
        faceIndex: 1,
        surfaceType: 'plane',
        normal: [0, 0, -1],
        offset: 0,
        area: 100,
        centroid: [5, 5, 0],
        bounds: { min: [0, 0, 0], max: [10, 10, 0] },
      },
      {
        faceIndex: 2,
        surfaceType: 'cylinder',
        axisOrigin: [5, 5, 0],
        axisDirection: [0, 0, 1],
        radius: 2,
        area: 125.664,
        centroid: [5, 5, 5],
        bounds: { min: [3, 3, 0], max: [7, 7, 10] },
      },
      {
        faceIndex: 3,
        surfaceType: 'cylinder',
        axisOrigin: [2, 2, 0],
        axisDirection: [0, 0, 1],
        radius: 1,
        area: 62.832,
        centroid: [2, 2, 5],
        bounds: { min: [1, 1, 0], max: [3, 3, 10] },
      },
      {
        faceIndex: 4,
        surfaceType: 'cylinder',
        axisOrigin: [5, 2, 0],
        axisDirection: [0, 0, 1],
        radius: 1,
        area: 62.832,
        centroid: [5, 2, 5],
        bounds: { min: [4, 1, 0], max: [6, 3, 10] },
      },
      {
        faceIndex: 5,
        surfaceType: 'cylinder',
        axisOrigin: [8, 2, 0],
        axisDirection: [0, 0, 1],
        radius: 1,
        area: 62.832,
        centroid: [8, 2, 5],
        bounds: { min: [7, 1, 0], max: [9, 3, 10] },
      },
      {
        faceIndex: 6,
        surfaceType: 'bspline',
        area: 5,
        centroid: [5, 5, 2],
        bounds: { min: [4, 4, 1], max: [6, 6, 3] },
      },
    ],
  },
  cubeB: {
    faces: [
      {
        faceIndex: 0,
        surfaceType: 'plane',
        normal: [0, 0, 1],
        offset: 10,
        area: 100,
        centroid: [15, 5, 10],
        bounds: { min: [10, 0, 10], max: [20, 10, 10] },
      },
      {
        faceIndex: 1,
        surfaceType: 'cylinder',
        axisOrigin: [15, 5, 5],
        axisDirection: [0, 1, 0],
        radius: 3,
        area: 50,
        centroid: [15, 5, 5],
        bounds: { min: [12, 0, 2], max: [18, 10, 8] },
      },
    ],
  },
});

export const buildFixtureIndex = (): SelectorIndex =>
  buildSelectorIndex({ xde: createFixtureXde(), faceFactsByOccurrence: createFixtureFaceFacts() });
