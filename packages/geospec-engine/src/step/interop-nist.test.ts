/**
 * NIST AP242 PMI interop conformance suite (WS-1 of the AP242 datum interop
 * testing engine — docs/research/ap242-datum-interop-testing-engine.md).
 *
 * Runs geospec's actual native XDE reader against the committed, pristine
 * NIST corpus and asserts the manifest expectations (corpus-derived, see
 * interop-nist.manifest.ts). Every row here defines conformance against
 * standard, foreign-authored GD&T STEP AP242 — a workstream is done when its
 * rows turn green without touching the expectations.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseXdeReadResultJson } from '#step/load-step.js';
import type { GeoSpecNativeStepBackend, GeoSpecNativeXdeReadResult, XdeReadResult } from '#step/types.js';
import { interopExpectations } from '#step/interop-nist.manifest.js';
import type { InteropExpectation } from '#step/interop-nist.manifest.js';

vi.setConfig({ testTimeout: 120_000 });

const corpusDirectory = join(import.meta.dirname, '../../fixtures/interop/nist-pmi');

type LoadedCorpusFile = {
  native: GeoSpecNativeXdeReadResult;
  result: XdeReadResult;
};

const loadedFiles = new Map<string, LoadedCorpusFile>();
let backend: GeoSpecNativeStepBackend;

beforeAll(async () => {
  const module_ = (await import('@taucad/geospec-engine/native/opencascade/single')) as unknown as {
    default: () => Promise<GeoSpecNativeStepBackend>;
  };
  backend = await module_.default();
}, 240_000);

afterAll(() => {
  for (const { native } of loadedFiles.values()) {
    native.delete?.();
  }
  loadedFiles.clear();
});

const loadCorpusFile = async (file: string): Promise<LoadedCorpusFile> => {
  const existing = loadedFiles.get(file);
  if (existing) {
    return existing;
  }
  if (!backend.GeoSpecXdeReader) {
    throw new Error('GeoSpecXdeReader is missing from the native backend.');
  }
  const text = await readFile(join(corpusDirectory, file), 'utf8');
  const native = backend.GeoSpecXdeReader.readText(text, '{}');
  if (!native.isSuccess()) {
    throw new Error(`XDE read failed for ${file}: ${native.resultJson()}`);
  }
  const entry: LoadedCorpusFile = { native, result: parseXdeReadResultJson(native.resultJson()) };
  loadedFiles.set(file, entry);
  return entry;
};

const distinctSorted = (values: string[]): string[] => [...new Set(values)].sort();

type FaceFactBounds = { min: [number, number, number]; max: [number, number, number] };

const occurrenceAabbDiagonal = (native: GeoSpecNativeXdeReadResult, occurrenceIndex: number): number => {
  const facts = JSON.parse(native.faceFacts(occurrenceIndex)) as { faces?: Array<{ bounds: FaceFactBounds }> };
  const faces = facts.faces ?? [];
  if (faces.length === 0) {
    return 0;
  }
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const face of faces) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis]!, face.bounds.min[axis]!);
      max[axis] = Math.max(max[axis]!, face.bounds.max[axis]!);
    }
  }
  return Math.hypot(max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!);
};

const findPinnedRow = (result: XdeReadResult, name: string): { origin: [number, number, number] } | undefined =>
  result.supplementalPlanes.find((row) => row.name === name) ?? result.datumPlacements.find((row) => row.name === name);

describe.each<InteropExpectation>(interopExpectations)('NIST interop — $file', (expectation) => {
  it('recovers part occurrence identity from the STEP PRODUCT', async () => {
    const { result } = await loadCorpusFile(expectation.file);
    const productNames = new Set(result.occurrences.map((occurrence) => occurrence.productName));
    for (const partName of expectation.partProductNames) {
      expect(productNames).toContain(partName);
    }
    // Occurrence paths must be addressable identities, not XCAF auto-names.
    for (const occurrence of result.occurrences) {
      expect(occurrence.path).not.toMatch(/^=>/);
      expect(occurrence.path).not.toBe('');
    }
  });

  it('surfaces only face-bearing part occurrences (annotation roots are not parts)', async () => {
    const { native, result } = await loadCorpusFile(expectation.file);
    for (const [index] of result.occurrences.entries()) {
      const facts = JSON.parse(native.faceFacts(index)) as { faces?: unknown[] };
      expect(facts.faces?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('recovers the semantic GD&T datum letters exactly', async () => {
    const { result } = await loadCorpusFile(expectation.file);
    expect(distinctSorted(result.semanticDatums.map((datum) => datum.label))).toEqual(expectation.semanticDatumLabels);
  });

  it('attaches required semantic datums to product faces', async () => {
    const { result } = await loadCorpusFile(expectation.file);
    for (const label of expectation.semanticDatumLabelsWithFaces) {
      const rows = result.semanticDatums.filter((datum) => datum.label === label);
      expect(rows.length, `semantic datum '${label}'`).toBeGreaterThan(0);
      expect(
        rows.some((row) => row.faceIndexes.length > 0),
        `semantic datum '${label}' should attach to at least one face`,
      ).toBe(true);
    }
  });

  it('recovers every DATUM_SYSTEM with references drawn from known labels', async () => {
    const { result } = await loadCorpusFile(expectation.file);
    expect(result.datumSystems).toHaveLength(expectation.datumSystemCount);
    const knownLabels = new Set(expectation.semanticDatumLabels);
    for (const system of result.datumSystems) {
      expect(system.references.length).toBeGreaterThan(0);
      for (const compartment of system.references) {
        expect(compartment.length).toBeGreaterThan(0);
        for (const label of compartment) {
          expect(knownLabels).toContain(label);
        }
      }
    }
  });

  it('recovers named supplemental planes exactly', async () => {
    const { result } = await loadCorpusFile(expectation.file);
    expect(distinctSorted(result.supplementalPlanes.map((plane) => plane.name))).toEqual(
      expectation.supplementalPlaneNames,
    );
  });

  it('recovers named supplemental axis-system placements exactly', async () => {
    const { result } = await loadCorpusFile(expectation.file);
    expect(distinctSorted(result.datumPlacements.map((placement) => placement.name))).toEqual(
      expectation.datumPlacementNames,
    );
  });

  it('places pinned supplemental origins within 1e-3 mm', async () => {
    const { result } = await loadCorpusFile(expectation.file);
    for (const [name, expected] of Object.entries(expectation.pinnedOrigins)) {
      const row = findPinnedRow(result, name);
      expect(row, `pinned supplemental item '${name}'`).toBeDefined();
      for (let axis = 0; axis < 3; axis++) {
        expect(
          Math.abs(row!.origin[axis]! - expected[axis]!),
          `'${name}' origin[${axis}] = ${row!.origin[axis]} vs ${expected[axis]}`,
        ).toBeLessThan(1e-3);
      }
    }
  });

  it('normalizes shape geometry to millimetres', async () => {
    const { native, result } = await loadCorpusFile(expectation.file);
    if (expectation.partAabbMinDiagonalMm === undefined) {
      return;
    }
    const partIndex = result.occurrences.findIndex((occurrence) =>
      expectation.partProductNames.includes(occurrence.productName),
    );
    expect(partIndex).toBeGreaterThanOrEqual(0);
    expect(occurrenceAabbDiagonal(native, partIndex)).toBeGreaterThan(expectation.partAabbMinDiagonalMm);
  });
});
