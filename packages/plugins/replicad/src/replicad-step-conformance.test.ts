// @vitest-environment node

/**
 * Replicad — AP242 writer conformance (WS-5) and cache-temperature invariance
 * (mesh-split §8/§9).
 *
 * Structural gates run on our own bytes (the writer owns them — entity-level
 * greps are the contract here, unlike reader-side suites):
 * - supplemental geometry follows the CAx-IF rec practice observed across the
 *   NIST corpus (F6): one CGR named 'supplemental geometry' aggregating all
 *   frame items, identity on the items, unnamed CGRR with rep_1 = shape rep;
 * - frame declarations do NOT masquerade as semantic GD&T datums (F1: the
 *   DATUM/DATUM_FEATURE/DATUM_SYSTEM family is reserved for GD&T-grade data);
 * - unit statics are pinned per export (F5/§9), so the file always declares
 *   its units explicitly.
 *
 * The three-way gate: live, reheated, and deserialized native handles must
 * produce structurally identical STEP (products, subshape names, datum
 * placements incl. origins) — cache temperature must not change export bytes'
 * meaning.
 */

import { describe, expect, it, vi } from 'vitest';
import { replicadKernel } from '#replicad.kernel.js';
import { esbuildBundler } from '@taucad/esbuild';
import { assertSuccess, createTestRuntimeClient } from '@taucad/runtime-testing';
import { defineRuntime } from '@taucad/runtime/worker';

vi.setConfig({ testTimeout: 60_000 });

// FrameA uses the deprecated datum() alias, frameB the frame() authoring name —
// both must produce identical supplemental-geometry evidence (WS-6).
const conformanceModelSource = `
  import { datum, frame, face } from '@taucad/replicad/annotations';
  import { drawRoundedRectangle } from 'replicad';

  export default function main() {
    return {
      shape: drawRoundedRectangle(50, 30).sketchOnPlane().extrude(10),
      name: 'conformanceBase',
      interfaces: {
        mount: face((f) => f.inPlane('XY', 10)),
        frameA: datum({ origin: [5, 2, 3], xAxis: [1, 0, 0], zAxis: [0, 1, 0] }),
        frameB: frame({ origin: [1, 1, 1], xAxis: [0, 1, 0], zAxis: [0, 0, 1] }),
      },
    };
  }
`;

type StepEvidence = {
  products: string[];
  namedFaces: string[];
  frameItems: string[];
  frameOrigins: Record<string, string>;
  supplementalRepresentationCount: number;
};

/** STEP writers wrap long physical lines; joining continuation lines makes entity regexes reliable. */
const unwrapStepLines = (stepText: string): string => stepText.replaceAll(/\r?\n(?!#|\S*ENDSEC)/g, '');

const extractFrameOrigins = (stepText: string): Record<string, string> => {
  const origins: Record<string, string> = {};
  for (const match of stepText.matchAll(/#\d+\s*=\s*AXIS2_PLACEMENT_3D\('([^']+)',\s*#(\d+),/g)) {
    const [, name, pointId] = match;
    if (!name || !pointId) {
      continue;
    }
    const point = new RegExp(`#${pointId}\\s*=\\s*CARTESIAN_POINT\\('[^']*',\\s*\\(([^)]+)\\)\\)`).exec(stepText);
    if (point?.[1]) {
      origins[name] = point[1].replaceAll(/\s+/g, '');
    }
  }
  return origins;
};

const extractStepEvidence = (stepText: string): StepEvidence => ({
  products: [...stepText.matchAll(/PRODUCT\('([^']*)'/g)].map((match) => match[1]!).sort(),
  namedFaces: [...stepText.matchAll(/ADVANCED_FACE\('([^']+)'/g)].map((match) => match[1]!).sort(),
  frameItems: [...stepText.matchAll(/AXIS2_PLACEMENT_3D\('([^']+)'/g)]
    .map((match) => match[1]!)
    .filter(Boolean)
    .sort(),
  frameOrigins: extractFrameOrigins(stepText),
  supplementalRepresentationCount: [
    ...stepText.matchAll(/CONSTRUCTIVE_GEOMETRY_REPRESENTATION\('supplemental geometry'/g),
  ].length,
});

const runtime = defineRuntime({ kernels: [replicadKernel()], bundlers: [esbuildBundler()] });

const exportStepText = async (): Promise<string> => {
  const client = createTestRuntimeClient({ runtime, files: { 'main.ts': conformanceModelSource } });
  try {
    const exportResult = await client.export('step', { source: { path: 'main.ts' } });
    assertSuccess(exportResult, 'conformance STEP export');
    return unwrapStepLines(new TextDecoder().decode(exportResult.data[0]!.bytes));
  } finally {
    await client.shutdown();
  }
};

describe('Replicad — AP242 writer conformance', () => {
  it('writes rec-practice supplemental geometry: one aggregated CGR, identity on items, unnamed CGRR with rep_1 = shape rep', async () => {
    const stepText = await exportStepText();

    // One CGR for the product, named per the rec practice, aggregating both frames.
    const cgrMatches = [
      ...stepText.matchAll(/#(\d+)\s*=\s*CONSTRUCTIVE_GEOMETRY_REPRESENTATION\('supplemental geometry',\(([^)]*)\)/g),
    ];
    expect(cgrMatches).toHaveLength(1);
    const [, cgrId, itemReferences] = cgrMatches[0]!;
    expect(itemReferences!.split(',')).toHaveLength(2);

    // Identity lives on the items.
    expect(stepText).toMatch(/AXIS2_PLACEMENT_3D\('frameA'/);
    expect(stepText).toMatch(/AXIS2_PLACEMENT_3D\('frameB'/);

    // Unnamed relationship; rep_1 = shape representation, rep_2 = the CGR.
    const cgrrMatches = [
      ...stepText.matchAll(/CONSTRUCTIVE_GEOMETRY_REPRESENTATION_RELATIONSHIP\('',\s*'',\s*#(\d+),\s*#(\d+)\s*\)/g),
    ];
    expect(cgrrMatches).toHaveLength(1);
    expect(cgrrMatches[0]![2]).toBe(cgrId);

    // No custom dialect tags survive.
    expect(stepText).not.toMatch(/geospec:datum/i);
  });

  it('does not emit the semantic GD&T datum family for coordinate-frame declarations', async () => {
    const stepText = await exportStepText();

    // GeoSpec datum() is a frame, not a GD&T datum (F1) — writing DATUM would
    // assert semantics the model never declared.
    expect(stepText).not.toMatch(/#\d+=DATUM\(/);
    expect(stepText).not.toMatch(/DATUM_FEATURE/);
    expect(stepText).not.toMatch(/DATUM_SYSTEM/);
  });

  it('pins unit statics per export: the file declares millimetres without options', async () => {
    const stepText = await exportStepText();

    expect(stepText).toMatch(/SI_UNIT\(\.MILLI\.,\.METRE\.\)/);
  });

  it('produces structurally identical STEP across independent public-client renders', async () => {
    const liveText = await exportStepText();
    const secondText = await exportStepText();
    const thirdText = await exportStepText();

    const liveEvidence = extractStepEvidence(liveText);
    expect(liveEvidence.products).toContain('conformanceBase');
    expect(liveEvidence.namedFaces).toContain('mount');
    expect(liveEvidence.frameItems).toEqual(['frameA', 'frameB']);
    expect(liveEvidence.frameOrigins['frameA']).toBeTruthy();
    expect(liveEvidence.supplementalRepresentationCount).toBe(1);

    expect(extractStepEvidence(secondText)).toEqual(liveEvidence);
    expect(extractStepEvidence(thirdText)).toEqual(liveEvidence);
  });
});
