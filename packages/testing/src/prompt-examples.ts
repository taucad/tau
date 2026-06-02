/**
 * Single-source-of-truth copy for the `test_requirements` example block and
 * the `Available checks` blurb the agent sees. Rendered identically in:
 *  - the cad-agent system prompt (`apps/api/.../cad-agent.prompt.ts`)
 *  - the GeoSpec-first CAD agent prompt (`apps/api/.../cad-agent.prompt.ts`)
 *
 * Single-sourcing prevents the agent from ever seeing two slightly-different
 * phrasings of the same check vocabulary.
 *
 * @module
 */

/**
 * Canonical GeoSpec example, keyed by the `<file>` placeholder. Renderers
 * substitute the placeholder with the kernel-appropriate source file.
 *
 * Includes one example each of the surviving 3-check vocabulary
 * (boundingBox, connectedComponents, watertight).
 *
 * @public
 */
export const canonicalGeoSpecTestExample = `import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('main geometry', () => {
  it('should have the expected size', async () => {
    const model = await loadModel({ file: '<file>' });
    expectGeo(model).toHaveBoundingBox({
      size: { x: 100, z: 25 },
      tolerance: 1,
    });
  });

  it('should be centered at the XY origin', async () => {
    const model = await loadModel({ file: '<file>' });
    expectGeo(model).toHaveBoundingBox({
      center: { x: 0, y: 0 },
      tolerance: 0.5,
    });
  });

  it('should be one spatial component', async () => {
    const model = await loadModel({ file: '<file>' });
    expectGeo(model).toHaveConnectedComponents({ count: 1 });
  });

  it('should be watertight', async () => {
    const model = await loadModel({ file: '<file>' });
    expectGeo(model).toBeWatertight();
  });

  it('should have expected physical measurements', async () => {
    const model = await loadModel({ file: '<file>' });
    expectGeo(model).toHaveSurfaceArea({ value: 12_345, tolerance: 5 });
    expectGeo(model).toHaveVolume({ value: 120_000, tolerance: 10 });
    expectGeo(model).toHaveCenterOfMass({
      point: { x: 0, y: 0, z: 10 },
      tolerance: 0.5,
    });
  });
});
`;

/**
 * Canonical BRep feature example for kernels that can expose exact BRep
 * evidence. Mesh-only kernels must not see this block because those matchers
 * intentionally report unsupported diagnostics without BRep evidence.
 *
 * @public
 */
export const canonicalBrepGeoSpecTestExample = `import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('main exact features', () => {
  it('should expose the top planar face', async () => {
    const model = await loadModel({ file: '<file>', format: 'step' });
    expectGeo(model).toHavePlanarFace({
      normal: { x: 0, y: 0, z: 1 },
      offset: 20,
      area: { greaterThan: 5_000 },
      tolerance: 0.05,
    });
  });

  it('should expose cylindrical and hole features', async () => {
    const model = await loadModel({ file: '<file>', format: 'step' });
    expectGeo(model).toHaveCylindricalFace({
      radius: 15,
      axis: 'z',
      tolerance: 0.05,
    });
    expectGeo(model).toHaveCircularHole({
      diameter: 8,
      through: true,
      axis: 'z',
      center: { x: 25, y: 15 },
      tolerance: 0.05,
    });
  });
});
`;

/**
 * Options for rendering the shared agent-facing GeoSpec example.
 *
 * @public
 */
export type RenderCanonicalExampleOptions = {
  /** Include exact BRep feature matcher examples for BRep-capable kernels. */
  includeBrepFeatures?: boolean;
};

/**
 * Renders {@link canonicalGeoSpecTestExample} as a fenced TypeScript code
 * block with `<file>` substituted for the kernel-appropriate `main.<ext>`.
 *
 * @param fileExtension - Kernel-specific file extension (e.g. `'ts'`,
 *   `'scad'`, `'js'`). A leading dot is stripped defensively.
 * @param options - Rendering options for optional capability-specific examples.
 * @returns A markdown code block ready to interpolate into a system prompt
 * @public
 */
export const renderCanonicalExample = (fileExtension: string, options: RenderCanonicalExampleOptions = {}): string => {
  const extension = fileExtension.startsWith('.') ? fileExtension.slice(1) : fileExtension;
  const source = options.includeBrepFeatures
    ? `${canonicalGeoSpecTestExample}\n${canonicalBrepGeoSpecTestExample}`
    : canonicalGeoSpecTestExample;
  const concrete = source.replaceAll('<file>', `main.${extension}`);
  return ['```ts', concrete.trimEnd(), '```'].join('\n');
};

/**
 * Single-sourced "Available checks" blurb. Rendered identically by the system
 * prompt body so the LLM sees one coherent geometry-test vocabulary.
 *
 * @public
 */
export const availableChecksCopy = `Available checks (each answers exactly one question — no overlap):
\`loadModel\` returns an opaque \`GeometrySubject\`: do not read \`model.boundingBox.bounds\`,
call \`model.volume()\`, or inspect subject fields. Assert through \`expectGeo(model)\` so
GeoSpec records structured diagnostics.
- boundingBox          — "Is the model the right SIZE / POSITION?" Per-axis opt-in for
                         size and center; \`tolerance\` is per-axis tolerance in mm.
- connectedComponents  — "How many SPATIALLY-DISJOINT CHUNKS does the geometry contain?"
                         Pure-geometry AABB clustering. \`tolerance\` (mm, default 0.1) is
                         the maximum gap between two parts' bounding boxes that still
                         counts as "connected." Use \`count: 1\` for "the assembly
                         is one cohesive thing"; raise tolerance if parts visibly touch
                         but the test still reports >1.
- watertight           — "Is each geometry unit's surface CLOSED (manifold / 3D-printable)?"
                         The canonical "did the boolean fuse succeed" guardrail. Assert
                         per geometry unit (e.g. \`lib/<part>.ts\`) so each part is verified
                         independently of how they are returned from \`main()\`.
- surfaceArea / volume / centerOfMass / mass — "Does the model have the expected
                         physical measurements?" Use these for scale, balance, material
                         estimates, and regression checks.
- chamferDistance      — "How close is this geometry to a reference geometry?" Use
                         \`toHaveChamferDistanceTo\` for sampled shape comparison.
- planarFace / cylindricalFace / circularHole / chamferFeature / minimumWallThickness
                       — "Does this BRep-capable kernel expose the expected exact feature?"
                         Use these only when BRep evidence is available.

For "is this one fused solid?" assert \`watertight\` on a geometry unit that exports a
single solid — a fused solid is closed-manifold iff the boolean fuse succeeded. Do NOT
use \`connectedComponents\` for that intent (it answers "how many spatial chunks," not
"is the boolean fuse welded").`;

/**
 * Agent-facing note for the new GeoSpec-style parameter testing workflow.
 *
 * @public
 */
export const geospecParameterTestingCopy = `Parameter-aware GeoSpec tests are available for repeatable geometry checks outside the Tau UI.
Parameters are real test inputs: import the existing \`.tau/parameters/<entry>.json\` file through \`#params/*.json\`, resolve groups with \`geospec/model\` helpers, mutate values intentionally, render each case with \`loadModel\`, and assert the resulting geometry with \`expectGeo\`.

Do not import named \`values\` from JSON. Tau parameter files default-export the full file shape: \`activeGroup\`, \`order\`, and \`groups[groupName].values\`. Stored group values are overrides, so merge them with source \`defaultParams\` through \`parameterGroups(...)\` or \`params(...)\` before testing.

The \`#params/*.json\` import must be backed by project \`package.json\` imports: \`{ "type": "module", "imports": { "#params/*.json": "./.tau/parameters/*.json" } }\`.

\`\`\`ts
import { describe, expectGeo, it } from 'geospec';
import { loadModel, parameterGroups } from 'geospec/model';
import mainParams from '#params/main.ts.json' with { type: 'json' };

const groups = parameterGroups(mainParams, { defaults: defaultParams });

describe('parameter variants', () => {
  for (const group of groups) {
    it(\`should render \${group.name} with expected bounds\`, async () => {
      const model = await loadModel({
        file: 'main.ts',
        parameters: group.values,
        parameterSource: group,
      });

      expectGeo(model).toHaveBoundingBox({
        size: { x: group.values.base.width },
        tolerance: 1,
      });
    });
  }
});
\`\`\``;
