import { describe, expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { waitForRenderedGeometry } from '#support/headless-capture.js';

/**
 * The owned-project Preview at `/w/{workspace}/{project}/preview`.
 *
 * Builtin examples have no preview route of their own any more: 2ba77dbeaa ("Add provider-qualified project
 * sharing") removed `/examples/:id`, so the example is seeded as an owned project first. Preview itself is the
 * viewer and workbench Dockviews since #679, which retired the page's `3D model preview` image and its debug
 * bounding-box panel; the scene is read through the viewer's `TAU_DEBUG` bridge, which global-setup enables.
 */

type Bounds = Readonly<{ min: readonly [number, number, number]; max: readonly [number, number, number] }>;

type RenderedModel = Readonly<{
  components: number;
  meshes: number;
  /** The union of every component's triangle bounds, in metres. */
  size: readonly number[];
}>;

const seedExample = async (locator: string): Promise<string> => {
  await target.navigate(`/__e2e/example-fixture?locator=${locator}`);
  await target.expectUrl(/\/w\/[^/]+\/[^/?]+(?:\?.*)?$/u, 60_000);
  return new URL(await target.currentUrl()).pathname;
};

const readRenderedModel = async (): Promise<RenderedModel> =>
  target.evaluate(() => {
    const bridge = (
      globalThis as {
        __TAU_SECTION_VIEW_TEST__?: {
          getModelComponents(): ReadonlyArray<Readonly<{ id: string }>>;
          getRenderedModelComponentState(id: string): Readonly<{ meshCount: number }>;
          getRenderedModelComponentSurfaceBounds(id: string): Bounds | undefined;
        };
      }
    ).__TAU_SECTION_VIEW_TEST__;
    const components = bridge?.getModelComponents() ?? [];
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    let meshes = 0;
    for (const { id } of components) {
      meshes += bridge?.getRenderedModelComponentState(id).meshCount ?? 0;
      const bounds = bridge?.getRenderedModelComponentSurfaceBounds(id);
      for (const axis of [0, 1, 2] as const) {
        min[axis] = Math.min(min[axis]!, bounds?.min[axis] ?? Infinity);
        max[axis] = Math.max(max[axis]!, bounds?.max[axis] ?? -Infinity);
      }
    }
    return { components: components.length, meshes, size: max.map((value, axis) => value - min[axis]!) };
  });

describe('Build Preview', () => {
  test('renders a 3D model for the Hollow Box project', async () => {
    const projectPath = await seedExample('replicad.hollow-box');
    await target.navigate(`${projectPath}/preview`);

    await target.expectVisible(selectors.getByTestId('cad-viewer-canvas-region'), 45_000);
    await waitForRenderedGeometry('gltf');
    // Dockview keeps empty assertive live regions mounted; an error alert says something.
    await target.expectCount(selectors.getByRole('alert').filter({ hasText: /\S/u }), 0);
    await target.expectVisible(selectors.getByRole('heading', { level: 1, name: 'Hollow Box' }));

    const model = await readRenderedModel();
    expect(model.components).toBeGreaterThan(0);
    expect(model.meshes).toBeGreaterThan(0);
    // The example's defaults: 150 × 100 × 50 mm.
    const size = model.size.toSorted((a, b) => a - b);
    for (const [index, expected] of [0.05, 0.1, 0.15].entries()) {
      expect(size[index], `sorted model size ${JSON.stringify(size)}`).toBeCloseTo(expected, 3);
    }
  });

  test('shows loading state before model is ready', async () => {
    const projectPath = await seedExample('replicad.hollow-box');
    await target.navigate(`${projectPath}/preview`);
    const loading = selectors.getByRole('status', { name: /loading preview/i });
    const canvas = selectors.getByTestId('cad-viewer-canvas-region');
    await target.expectVisible(loading.or(canvas));
  });

  test('displays Project Not Found for a non-existent project', async () => {
    const projectPath = await seedExample('replicad.hollow-box');
    const workspacePath = projectPath.slice(0, projectPath.lastIndexOf('/'));
    await target.navigate(`${workspacePath}/does-not-exist/preview`);
    await target.expectVisible(selectors.getByText('Project Not Found', { exact: true }), 45_000);
    await target.expectHidden(selectors.getByTestId('cad-viewer-canvas-region'));
  });
});
