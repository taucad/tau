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
 * Includes examples for mesh checks, assembly overlap, and physical
 * measurements that every mesh-capable kernel can run.
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

  it('should render an explicit parameter variant', async () => {
    const width = 120;
    const height = 40;
    const model = await loadModel({
      file: '<file>',
      parameters: { width, height },
    });
    expectGeo(model).toHaveBoundingBox({
      size: { x: width, z: height },
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

  it('should have no physical component interference', async () => {
    const model = await loadModel({ file: '<file>' });
    expectGeo(model).toHaveNoComponentInterference({ tolerance: 0.1 });
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
  it('should load valid STEP/BRep evidence', async () => {
    const model = await loadModel({ file: '<file>', format: 'step' });
    expectGeo(model).toBeValidBrep();
    expectGeo(model).toHaveTopologyCounts({
      faces: { greaterThan: 0 },
      solids: { greaterThanOrEqual: 1 },
    });
  });

  it('should expose exact face and hole features', async () => {
    const model = await loadModel({ file: '<file>', format: 'step' });
    expectGeo(model).toHavePlanarFace({
      normal: { x: 0, y: 0, z: 1 },
      offset: 20,
      area: { greaterThan: 5_000 },
      tolerance: 0.05,
    });
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

  it('should expose manufacturing features', async () => {
    const model = await loadModel({ file: '<file>', format: 'step' });
    expectGeo(model).toHaveChamferFeature({
      distance: 2,
      selection: 'outer top perimeter',
      tolerance: 0.05,
    });
    expectGeo(model).toHaveMinimumWallThickness({
      value: { greaterThanOrEqual: 2 },
      tolerance: 0.05,
    });
  });

  it('should have a named, non-interfering assembly structure', async () => {
    const model = await loadModel({ file: '<file>', format: 'step' });
    expectGeo(model).toHaveStepUnits({ unit: 'mm' });
    // The AP242 exporter emits a root assembly product above the named
    // components, so count is componentNames.length + 1.
    expectGeo(model).toHaveProductStructure({
      names: ['Housing', 'Shaft', 'Cap'],
      count: 4,
    });
    expectGeo(model).toHaveNoComponentInterference({
      tolerance: 0.05,
      allowances: [
        { kind: 'intentionalInterference', left: /shaft/i, right: /cap/i, maxVolume: 5, reason: 'press fit' },
      ],
    });
    expectGeo(model).toHaveSpatialRelationships({
      relationships: [
        {
          id: 'shaft rides coaxially in the housing bore',
          kind: 'coaxial',
          subject: { kind: 'interface', name: 'journal', of: 'Shaft' },
          target: { kind: 'interface', name: 'bore', of: 'Housing' },
          tolerance: 0.05,
        },
      ],
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

const universalAvailableChecksCopy = `Available checks (each answers one distinct geometry question):
\`loadModel\` returns an opaque \`GeometrySubject\`: do not read \`model.boundingBox.bounds\`,
call \`model.volume()\`, or inspect subject fields. Assert through \`expectGeo(model)\` so
GeoSpec records structured diagnostics.
- boundingBox          — "Is the model the right SIZE / POSITION?" Per-axis opt-in for
                         size and center; \`tolerance\` is per-axis tolerance in mm.
- connectedComponents  — "How many SPATIALLY-DISJOINT CHUNKS does the geometry contain?"
                         Pure-geometry spatial welding. \`tolerance\` (mm, default 0.1) is
                         the maximum weld gap that still counts as "connected."
                         Use \`count: 1\` for "the assembly
                         is one cohesive thing"; raise tolerance if parts visibly touch
                         but the test still reports >1.
- watertight           — "Is each geometry unit's surface CLOSED (strict manifold topology)?"
                         Requires zero irregular edges after spatial welding; slicer
                         acceptance/repair is a different question. The canonical
                         "did the boolean fuse succeed" guardrail. Assert
                         per geometry unit (e.g. \`lib/<part>.ts\`) so each part is verified
                         independently of how they are returned from \`main()\`.
- surfaceArea / volume / centerOfMass / mass — "Does the model have the expected
                         physical measurements?" Use these for scale, balance, material
                         estimates, and regression checks.
- componentInterference — "Do separate assembly components occupy the same solid volume?"
                         Use \`toHaveNoComponentInterference({ tolerance: 0.1 })\`. GeoSpec
                         uses native exact solid intersection of mesh evidence; tangent
                         contact and correctly meshed gears pass. Narrow to specific pairs
                         with \`pairs: [{ left: /housing/i, right: /planet gear/i }]\`, and
                         permit deliberate press-fits with \`allowances: [{ kind:
                         'intentionalInterference', left: /pin/i, right: /bore/i, maxVolume:
                         5, reason: 'press fit' }]\` instead of dropping the global check.
- chamferDistance      — "How close is this geometry to a reference geometry?" Use
                         \`toHaveChamferDistanceTo\` for sampled shape comparison.`;

const brepAvailableChecksCopy = `BRep/STEP matchers require exact BRep evidence: load with \`loadModel({ file, format: 'step' })\`.
On a mesh-only subject (no \`format: 'step'\`) they report unsupported diagnostics — e.g.
\`toBeValidBrep\` fails with "requires BRep validity evidence." This applies to ALL of:
- validBrep / topologyCounts / stepUnits / productStructure
                       — "Is the exported STEP a valid solid with the expected topology,
                         units, and named product structure?" Use \`toBeValidBrep()\`,
                         \`toHaveTopologyCounts({ solids, faces, ... })\`, \`toHaveStepUnits({
                         unit: 'mm' })\`, and \`toHaveProductStructure({ names, count })\`. The
                         AP242 exporter emits a root assembly product above the named
                         components, so \`count = names.length + 1\`.
- planarFace / cylindricalFace / circularHole / circularHolePattern / chamferFeature /
  filletFeature / minimumWallThickness
                       — "Does the model expose the expected exact feature?"
- spatialRelationships — "Do components sit in the intended geometric relationship?"
                         Use \`toHaveSpatialRelationships({ relationships: [{ kind, subject,
                         target, tolerance }] })\` with \`kind\` one of contact | clearance |
                         coaxial | concentric | coplanar | parallel | perpendicular | angle |
                         containment | insertion | interference, and \`subject\`/\`target\`
                         selectors like \`{ kind: 'interface', name, of: '<Component>' }\`.`;

const fusedSolidGuidanceCopy = `For "is this one fused solid?" assert \`watertight\` on a geometry unit that exports a
single solid — a fused solid is closed-manifold iff the boolean fuse succeeded. Do NOT
use \`connectedComponents\` for that intent (it answers "how many spatial chunks," not
"is the boolean fuse welded").`;

/**
 * Renders the single-sourced "Available checks" blurb for a kernel profile.
 *
 * @param options - Capability switches for the active kernel.
 * @returns Agent-facing check vocabulary copy.
 * @public
 */
export const renderAvailableChecksCopy = (options: RenderCanonicalExampleOptions = {}): string =>
  [
    universalAvailableChecksCopy,
    options.includeBrepFeatures ? brepAvailableChecksCopy : undefined,
    fusedSolidGuidanceCopy,
  ]
    .filter(Boolean)
    .join('\n');

/**
 * Single-sourced "Available checks" blurb including BRep checks. Use
 * {@link renderAvailableChecksCopy} when rendering kernel-specific prompts.
 *
 * @public
 */
export const availableChecksCopy = renderAvailableChecksCopy({ includeBrepFeatures: true });
