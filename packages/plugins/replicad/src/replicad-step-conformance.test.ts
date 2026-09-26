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
 *   its units explicitly;
 * - surface colours are the sRGB encoding of the glTF base colour, and a shape
 *   without an authored colour carries none.
 *
 * The three-way gate: live, reheated, and deserialized native handles must
 * produce structurally identical STEP (products, subshape names, datum
 * placements incl. origins) — cache temperature must not change export bytes'
 * meaning.
 */

import { describe, expect, it, vi } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import { converter } from 'culori';
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

const exportModel = async (format: 'step' | 'glb', source: string): Promise<Uint8Array<ArrayBuffer>> => {
  const client = createTestRuntimeClient({ runtime, files: { 'main.ts': source } });
  try {
    const exportResult = await client.export(format, { source: { path: 'main.ts' } });
    assertSuccess(exportResult, `conformance ${format} export`);
    return exportResult.data[0]!.bytes;
  } finally {
    await client.shutdown();
  }
};

const exportStepText = async (source = conformanceModelSource): Promise<string> =>
  unwrapStepLines(new TextDecoder().decode(await exportModel('step', source)));

const toSrgb = converter('rgb');
const colourKey = (rgb: readonly number[]): string => rgb.map((channel) => channel.toFixed(5)).join(',');
const predefinedColours: Record<string, readonly number[]> = { white: [1, 1, 1], red: [1, 0, 0] };

/** Every distinct surface colour a STEP file declares, as sRGB keys. */
const extractStepColours = (stepText: string): string[] =>
  [
    ...new Set([
      ...[...stepText.matchAll(/COLOUR_RGB\('[^']*',([^,]+),([^,]+),([^)]+)\)/g)].map(([, ...rgb]) =>
        colourKey(rgb.map(Number)),
      ),
      ...[...stepText.matchAll(/DRAUGHTING_PRE_DEFINED_COLOUR\('([^']+)'\)/g)].map(([, name]) =>
        colourKey(predefinedColours[name!] ?? [Number.NaN]),
      ),
    ]),
  ].sort();

/** Occurrence names that context-bound styles colour: style context → placement shape → NAUO. */
const extractStyledOccurrences = (stepText: string): string[] =>
  [...stepText.matchAll(/PRESENTATION_STYLE_BY_CONTEXT\(\([^)]*\),#(\d+)\)/g)].map(([, context]) => {
    const placement = new RegExp(`SHAPE_DEFINITION_REPRESENTATION\\(#(\\d+),#${context}\\)`).exec(stepText)?.[1];
    const usage = new RegExp(`#${placement}\\s*=\\s*PRODUCT_DEFINITION_SHAPE\\('[^']*','[^']*',#(\\d+)`).exec(
      stepText,
    )?.[1];
    const name = new RegExp(`#${usage}\\s*=\\s*NEXT_ASSEMBLY_USAGE_OCCURRENCE\\('[^']*','([^']*)'`).exec(stepText)?.[1];
    return name ?? `unresolved context #${context}`;
  });

/** Every distinct glTF base colour, per the glTF default for an omitted factor, sRGB-encoded as STEP stores it. */
const extractGltfColours = async (glb: Uint8Array<ArrayBuffer>): Promise<string[]> => {
  const { json } = await new NodeIO().binaryToJSON(glb);
  return [
    ...new Set(
      (json.materials ?? []).map((material) => {
        const [r = 1, g = 1, b = 1] = material.pbrMetallicRoughness?.baseColorFactor ?? [];
        const srgb = toSrgb({ mode: 'lrgb', r, g, b });
        return colourKey([srgb.r, srgb.g, srgb.b]);
      }),
    ),
  ].sort();
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

describe('Replicad — STEP appearance', () => {
  it('should write no colour for shapes without an authored colour', async () => {
    const stepText = await exportStepText(`
      import { makeBox } from 'replicad';

      export default function main() {
        return [
          { shape: makeBox([0, 0, 0], [10, 10, 10]), name: 'plain' },
          { shape: makeBox([20, 0, 0], [30, 10, 10]), name: 'finishOnly', opacity: 0.5, metalness: 1, roughness: 0.2 },
        ];
      }
    `);

    expect(stepText).toContain("PRODUCT('plain'");
    expect(stepText).toContain("PRODUCT('finishOnly'");
    expect(stepText).not.toMatch(/STYLED_ITEM|COLOUR_RGB|DRAUGHTING_PRE_DEFINED_COLOUR|SURFACE_STYLE/);
  });

  it('should write each authored colour as the sRGB encoding of the glTF base colour', async () => {
    const source = `
      import { makeBox } from 'replicad';

      export default function main() {
        return [
          { shape: makeBox([0, 0, 0], [10, 10, 10]), name: 'legacy', color: '#3366cc', opacity: 0.5 },
          {
            shape: makeBox([20, 0, 0], [30, 10, 10]),
            name: 'authored',
            material: { pbrMetallicRoughness: { baseColorFactor: [0.05, 0.6, 0.25, 1] } },
          },
          { shape: makeBox([40, 0, 0], [50, 10, 10]), name: 'authoredDefault', material: {} },
        ];
      }
    `;
    const stepText = await exportStepText(source);
    const gltfColours = await extractGltfColours(await exportModel('glb', source));

    expect(gltfColours).toHaveLength(3);
    expect(extractStepColours(stepText)).toEqual(gltfColours);
    expect(stepText).toMatch(/SURFACE_STYLE_TRANSPARENT\(0\.5\)/);
  });

  it('should keep an uncoloured occurrence from inheriting its coloured sibling through their shared product', async () => {
    const stepText = await exportStepText(`
      import { makeBox } from 'replicad';

      export default function main() {
        const bolt = makeBox([0, 0, 0], [5, 5, 20]);
        return [
          { shape: bolt.clone(), name: 'highlighted', color: '#3366cc' },
          { shape: bolt.clone().translate([30, 0, 0]), name: 'plain' },
        ];
      }
    `);

    // One shared product without a colour of its own; only the coloured occurrence is styled, in its assembly context.
    expect([...stepText.matchAll(/NEXT_ASSEMBLY_USAGE_OCCURRENCE/g)]).toHaveLength(2);
    expect(stepText).not.toMatch(/PRESENTATION_STYLE_ASSIGNMENT/);
    expect([...new Set(extractStyledOccurrences(stepText))]).toEqual(['highlighted']);
    expect(extractStepColours(stepText)).toEqual([colourKey([0.2, 0.4, 0.8])]);
  });
});
