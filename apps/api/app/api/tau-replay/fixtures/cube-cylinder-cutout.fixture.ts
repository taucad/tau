import type { ReplayFixture } from '#api/tau-replay/replay-fixture.schema.js';

/** The geospec unit test the assistant writes first. */
const mainGeospec = `import { describe, expectGeo, it } from 'geospec';
import { loadModel } from 'geospec/model';

describe('Cube with cylinder cutout', () => {
  it('should be watertight and have correct dimensions', async () => {
    const model = await loadModel({ file: 'main.scad' });
    expectGeo(model).toBeWatertight();
    expectGeo(model).toHaveBoundingBox({
      size: { x: 20, y: 20, z: 20 },
      center: { x: 0, y: 0, z: 0 },
      tolerance: 0.1,
    });
  });
});
`;

/** The OpenSCAD source the assistant writes second. */
const mainScad = `// Cube with cylinder cutout
$fa = 2;
$fs = 0.4;

cube_size = 20;
cylinder_radius = 5;

difference() {
    cube(cube_size, center = true);
    cylinder(h = cube_size + 2, r = cylinder_radius, center = true);
}
`;

const finalText = [
  'I have designed a parametric cube with a centered cylinder cutout.',
  '',
  '### Design Details',
  String.raw`- **Cube Size**: $20 \times 20 \times 20\text{ mm}$ (centered)`,
  String.raw`- **Cutout**: Cylinder with radius $5\text{ mm}$, passing fully through the Z-axis`,
  String.raw`- **Tessellation**: Adaptive ($fa = 2^\circ$, $fs = 0.4\text{ mm}$) for smooth circular faces`,
  '',
  'Both the geometry validation and the unit tests passed successfully.',
].join('\n');

/**
 * Replay of the "a cube with a cylinder cutout" chat (recorded from
 * google-gemini-3.5-flash). Reasoning + final text come from the project's
 * `.tau/transcripts` JSONL; tool-call args + `create_file` contents come from
 * the exported markdown transcript and the project files. Per-turn usage sums to
 * the recorded totals (25559 in / 1160 out) so the metering pipeline is exercised.
 *
 * The tool RESULTS are not scripted — the model ignores them; the real tools run
 * (headless memFs + kernel/graphics stubs in tests, or the live client in dev).
 */
export const cubeCylinderCutoutFixture: ReplayFixture = {
  id: 'cube-cylinder-cutout',
  sourceModel: 'google-gemini-3.5-flash',
  turns: [
    {
      // Discovery: inspect the empty project. Paths are project-root-absolute
      // (the virtual filesystem root is the project root).
      toolCalls: [
        { name: 'list_directory', args: { path: '/' } },
        { name: 'read_file', args: { targetFile: '/main.scad' } },
        { name: 'glob_search', args: { pattern: '**/*.geospec.ts', path: '/' } },
      ],
      usage: { inputTokens: 2000, outputTokens: 60 },
    },
    {
      reasoning:
        "**Designing geometric primitives**\n\nI'm focusing on defining the core geometric elements first. My immediate plan is to construct the basic cube shape. Once that's established, I'll proceed to design the cylinder, which is necessary for the subsequent cutout operation.",
      toolCalls: [
        { name: 'create_file', args: { targetFile: '/main.geospec.ts', content: mainGeospec } },
        { name: 'create_file', args: { targetFile: '/main.scad', content: mainScad } },
      ],
      usage: { inputTokens: 3500, outputTokens: 400 },
    },
    {
      toolCalls: [{ name: 'get_kernel_result', args: { targetFile: '/main.scad' } }],
      usage: { inputTokens: 3000, outputTokens: 20 },
    },
    {
      toolCalls: [{ name: 'test_model', args: {} }],
      usage: { inputTokens: 3200, outputTokens: 20 },
    },
    {
      toolCalls: [
        { name: 'screenshot', args: { mode: 'multi_angle', targetFile: '/main.scad' } },
        { name: 'screenshot', args: { mode: 'single', targetFile: '/main.scad' } },
      ],
      usage: { inputTokens: 3400, outputTokens: 40 },
    },
    {
      text: finalText,
      usage: { inputTokens: 10_459, outputTokens: 620 },
    },
  ],
};
