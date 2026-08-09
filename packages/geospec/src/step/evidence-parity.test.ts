import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GeometrySubject } from '#mesh/types.js';
import { loadStep } from '#step/load-step.js';

/**
 * Evidence-parity harness (lazy-evidence blueprint C5 / P1 gate).
 *
 * Locks the complete observable evidence of every on-disk STEP fixture —
 * BRep facets, STEP/XDE structure, mesh scalars, a triangle-stream digest,
 * capabilities, and diagnostics — as canonical JSON file snapshots. The
 * R3 facet-ledger, R5 validity-dedup, and R4 wall-thickness refactors are
 * gated on these snapshots staying byte-identical (R4 excepted only where
 * documented below).
 *
 * Deliberately excluded from the snapshot:
 * - `brep.minimumWallThickness.rejections` (checkedPairs / zeroLength /
 *   extremaFailed / noMaterialInterval): pruning diagnostics whose counts
 *   shrink by design under the R4 broad→narrow rewrite. They are counters,
 *   not verdicts (blueprint risk table); the verdict-grade wall fields
 *   (value, witness points, location, solidIndex, tieCount, faces, surface
 *   and support types, algorithm, tolerance) stay locked.
 */

const fixturesRoot = join(import.meta.dirname, '../../fixtures');

const collectStepFiles = (directory: string): string[] => {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectStepFiles(path));
    } else if (/\.(?:step|stp)$/iu.test(entry.name)) {
      files.push(path);
    }
  }
  return files.sort();
};

const stepFixtures = collectStepFiles(fixturesRoot).map((path) => ({
  path,
  id: relative(fixturesRoot, path).replaceAll('/', '__'),
}));

/** Recursively sort object keys so serialization is insertion-order-free. */
const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = canonicalize(record[key]);
    }
    return sorted;
  }
  return value;
};

const sha256 = (text: string): string => `sha256:${createHash('sha256').update(text).digest('hex')}`;

/**
 * Force and serialize every evidence facet a matcher can observe. Reading
 * each `subject.brep` field explicitly is the forcing step once the lazy
 * ledger lands; on the eager build it is a plain read — the same code paths
 * produce the baseline and the post-refactor comparison.
 */
const serializeEvidence = (subject: GeometrySubject): string => {
  const { brep } = subject;
  const wall = brep?.minimumWallThickness;
  const { rejections: _excludedRejections, ...wallLocked } = wall ?? {};
  const { stats } = subject.mesh;
  const evidence = {
    brep: brep
      ? {
          validity: brep.validity,
          topologyCounts: brep.topologyCounts,
          boundingBox: brep.boundingBox,
          massProperties: brep.massProperties,
          planarFaces: brep.planarFaces,
          cylindricalFaces: brep.cylindricalFaces,
          circularHoles: brep.circularHoles,
          circularHolePatterns: brep.circularHolePatterns,
          chamferFeatures: brep.chamferFeatures,
          filletFeatures: brep.filletFeatures,
          minimumWallThickness: wall ? wallLocked : undefined,
        }
      : undefined,
    step: subject.step
      ? {
          schema: subject.step.schema,
          unit: subject.step.unit,
          productStructure: subject.step.productStructure,
          readStrategy: subject.step.readStrategy,
          capabilities: subject.step.capabilities,
          xde: subject.step.xde,
        }
      : undefined,
    mesh: {
      format: subject.mesh.format,
      vertexCount: stats.vertexCount,
      meshCount: stats.meshCount,
      triangleCount: stats.triangleCount,
      watertight: stats.watertight,
      surfaceArea: stats.meshQuality.surfaceArea,
      signedVolume: stats.meshQuality.signedVolume,
      triangleDigest: sha256(JSON.stringify(stats.meshQuality.triangles)),
    },
    capabilities: [...subject.capabilities].sort((left, right) =>
      JSON.stringify(canonicalize(left)).localeCompare(JSON.stringify(canonicalize(right))),
    ),
    diagnostics: subject.diagnostics,
    provenance: {
      contentHash: subject.provenance.contentHash,
      loader: subject.provenance.loader,
      unit: subject.provenance.unit,
    },
  };
  return `${JSON.stringify(canonicalize(evidence), undefined, 2)}\n`;
};

describe('STEP evidence parity corpus', () => {
  it('should discover the on-disk STEP fixture corpus', () => {
    // The corpus gate is meaningless if the glob silently matches nothing.
    expect(stepFixtures.length).toBeGreaterThanOrEqual(37);
  });

  // 600s: the pre-refactor eager build pays full wall-thickness analysis on
  // every load; nist_ctc_05 alone needs >144s. The budget shrinks with R3/R4.
  it.each(stepFixtures)('should preserve evidence bytes for $id', { timeout: 600_000 }, async (fixture) => {
    const subject = await loadStep({ source: fixture.path, name: fixture.id, mesh: true });
    await expect(serializeEvidence(subject)).toMatchFileSnapshot(join('__evidence-snapshots__', `${fixture.id}.json`));
  });
});
