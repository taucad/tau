import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { WebGPUBackend, WebGPURenderer } from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { resolveSectionPieces } from '#graphics/section-cuts.js';
import type { SectionCut } from '#graphics/section-cuts.js';
import { createSectionClip, writeSectionClip } from '#graphics/three/materials/section-clip.js';
import { createRenderer } from '#graphics/three/renderer.js';
import { ensureBvh } from '#graphics/three/utils/bvh-cache.js';
import { raycastFirstVisibleMeshHit } from '#graphics/three/utils/bvh-raycast.js';
import type { RaycastClipState } from '#graphics/three/utils/bvh-raycast.js';
import { createModelGpuPicker } from '#graphics/three/utils/model-gpu-pick.js';
import type { ModelGpuPicker, ModelPickResult } from '#graphics/three/utils/model-gpu-pick.js';

/**
 * The GPU model pick on a real GPU, on both backends, against the trees: every pixel of the flanged housing and a box
 * in front of part of it, with and without a section cut, must name the mesh and the distance the BVH names, except
 * on silhouette pixels where rasterization and the exact ray may fall either side of an edge. A pick of a scene the
 * buffer does not show yet is pending and replays once when the pass lands.
 */

const width = 160;
const height = 120;
const fixture = new URL('fixtures/flanged-housing.glb', import.meta.url);
const setupTimeout = 120_000;

type Outcome = Readonly<{
  object: THREE.Object3D | undefined;
  distance: number;
}>;

type Comparison = Readonly<{
  objects: string[];
  hits: number;
  agreeing: number;
  /** Disagreeing pixels away from every silhouette: there must be none. */
  hard: Array<Readonly<{ column: number; row: number; gpu: string; cpu: string }>>;
  /** Disagreeing pixels on a silhouette, where either answer is right. */
  silhouette: number;
  largestDistanceError: number;
}>;

const loadHousing = async (): Promise<THREE.Mesh> => {
  const response = await fetch(fixture);
  expect(response.ok).toBe(true);
  const { scene } = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '');
  let mesh: THREE.Mesh | undefined;
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      mesh ??= object;
    }
  });
  expect(mesh).toBeDefined();
  const housing = mesh!;
  housing.removeFromParent();
  housing.position.set(0, 0, 0);
  housing.quaternion.identity();
  housing.scale.set(1, 1, 1);
  housing.updateMatrixWorld(true);
  return housing;
};

const pixelRay = (camera: THREE.Camera, column: number, row: number): THREE.Raycaster => {
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(((column + 0.5) / width) * 2 - 1, 1 - ((row + 0.5) / height) * 2), camera);
  return raycaster;
};

const describeOutcome = ({ object, distance }: Outcome): string =>
  object ? `${object.name || object.uuid.slice(0, 8)}@${distance.toFixed(5)}` : 'miss';

describe.each(['webgl', 'webgpu', 'nodegl'] as const)('model GPU pick on %s', (backend) => {
  const disposables: Array<{ dispose: () => void }> = [];
  let renderer: Awaited<ReturnType<typeof createRenderer>>;
  let picker: ModelGpuPicker;
  let meshes: THREE.Mesh[];
  let camera: THREE.PerspectiveCamera;
  let radius: number;
  let center: THREE.Vector3;
  const clip = createSectionClip(backend === 'webgl' ? 'webgl' : 'webgpu');
  const landed = vi.fn();

  const frame = (): void => {
    for (const mesh of meshes) {
      mesh.updateMatrixWorld(true);
    }
    picker.frame({ camera, width, height, meshes });
  };

  const gpuOutcome = (result: ModelPickResult): Outcome => {
    if (result.status === 'hit') {
      return {
        object: result.intersection.object,
        distance: result.intersection.distance,
      };
    }
    if (result.status === 'miss') {
      return { object: undefined, distance: Number.POSITIVE_INFINITY };
    }
    throw new Error(`The pick answered ${result.status} for a current buffer.`);
  };

  /** Every pixel picked on the GPU and raycast through the trees, then compared. */
  const compare = async (clipping: RaycastClipState | undefined): Promise<Comparison> => {
    const tolerance = radius * 1e-3;
    const cpu: Outcome[] = [];
    const gpu: Outcome[] = [];
    // Traverse independent 64px blocks so the oracle does not require a full-frame cache.
    for (let top = 0; top < height; top += 64) {
      for (let left = 0; left < width; left += 64) {
        picker.pick(pixelRay(camera, Math.min(width - 1, left + 32), Math.min(height - 1, top + 32)));
        // oxlint-disable-next-line no-await-in-loop -- Read each independent region before checking every original pixel.
        await picker.refresh();
        for (let row = top; row < Math.min(height, top + 64); row++) {
          for (let column = left; column < Math.min(width, left + 64); column++) {
            const raycaster = pixelRay(camera, column, row);
            const pick = raycastFirstVisibleMeshHit({
              raycaster,
              meshes,
              clipping,
            });
            expect(pick.pending).toBe(false);
            cpu[row * width + column] = {
              object: pick.hit?.object,
              distance: pick.hit?.distance ?? Number.POSITIVE_INFINITY,
            };
            let answer = picker.pick(raycaster);
            if (answer.status === 'pending') {
              // oxlint-disable-next-line no-await-in-loop -- A block crossing the cached boundary must remain answerable.
              await picker.refresh();
              answer = picker.pick(raycaster);
            }
            gpu[row * width + column] = gpuOutcome(answer);
          }
        }
      }
    }
    const at = (column: number, row: number): Outcome | undefined =>
      column < 0 || column >= width || row < 0 || row >= height ? undefined : cpu[row * width + column];
    /** A pixel next to a change of mesh, of hit and miss, or of depth (an occluding edge or a cut face). */
    const isSilhouette = (column: number, row: number): boolean => {
      const here = at(column, row)!;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const there = at(column + dx, row + dy);
          if (!there) {
            continue;
          }
          if (there.object !== here.object) {
            return true;
          }
          if (here.object && Math.abs(there.distance - here.distance) > radius * 0.02) {
            return true;
          }
        }
      }
      return false;
    };
    let hits = 0;
    let agreeing = 0;
    let silhouette = 0;
    let largestDistanceError = 0;
    const hard: Array<Comparison['hard'][number]> = [];
    for (let row = 0; row < height; row++) {
      for (let column = 0; column < width; column++) {
        const index = row * width + column;
        const expected = cpu[index]!;
        const actual = gpu[index]!;
        if (expected.object) {
          hits++;
        }
        const isAgreeing =
          expected.object === actual.object &&
          (!expected.object || Math.abs(expected.distance - actual.distance) <= tolerance);
        if (isAgreeing) {
          agreeing++;
          if (expected.object) {
            largestDistanceError = Math.max(largestDistanceError, Math.abs(expected.distance - actual.distance));
          }
        } else if (isSilhouette(column, row)) {
          silhouette++;
        } else {
          hard.push({
            column,
            row,
            gpu: describeOutcome(actual),
            cpu: describeOutcome(expected),
          });
        }
      }
    }
    return {
      objects: [...new Set(gpu.map(({ object }) => object?.name ?? 'miss'))].sort(),
      hits,
      agreeing,
      hard,
      silhouette,
      largestDistanceError,
    };
  };

  beforeAll(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    renderer = await createRenderer(
      backend === 'nodegl' ? 'showcase' : 'viewport',
      backend === 'webgpu' ? 'webgpu' : 'webgl',
      canvas,
    );
    disposables.push(renderer);
    if (backend === 'webgpu' && !(renderer instanceof WebGPURenderer && renderer.backend instanceof WebGPUBackend)) {
      throw new Error(
        'No WebGPU adapter, so three fell back to WebGL 2. Launch Chromium with one, for example --use-webgpu-adapter=swiftshader.',
      );
    }

    const housing = await loadHousing();
    housing.name = 'housing';
    housing.geometry.computeBoundingBox();
    const bounds = housing.geometry.boundingBox!;
    center = bounds.getCenter(new THREE.Vector3());
    radius = bounds.getSize(new THREE.Vector3()).length() / 2;
    // A box in front of the housing's lower left, so two meshes overlap and a nearer one must win.
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(radius * 0.5, radius * 0.5, radius * 0.5),
      new THREE.MeshBasicMaterial(),
    );
    box.name = 'box';
    box.position.copy(center).add(new THREE.Vector3(-radius * 0.4, -radius * 0.4, radius * 0.9));
    box.updateMatrixWorld(true);
    meshes = [housing, box];
    disposables.push(housing.geometry, box.geometry, box.material);
    for (const mesh of meshes) {
      // oxlint-disable-next-line no-await-in-loop -- each tree is awaited once before any comparison.
      await ensureBvh(mesh.geometry);
    }

    camera = new THREE.PerspectiveCamera(40, width / height, radius * 0.05, radius * 20);
    camera.position.copy(center).add(new THREE.Vector3(0.6, 0.5, 1).normalize().multiplyScalar(radius * 3.2));
    camera.lookAt(center);
    camera.updateMatrixWorld();
    // The viewport draws the camera before the pick does, settling any projection its renderer adjusts. It draws into
    // a target: a headless WebGPU canvas outside the document loses its device when presented.
    if (renderer instanceof THREE.WebGLRenderer) {
      const warmUp = new THREE.WebGLRenderTarget(width, height);
      disposables.push(warmUp);
      renderer.setRenderTarget(warmUp);
      renderer.render(new THREE.Scene(), camera);
      renderer.setRenderTarget(null);
    } else {
      const warmUp = new THREE.RenderTarget(width, height);
      disposables.push(warmUp);
      renderer.setRenderTarget(warmUp);
      renderer.render(new THREE.Scene(), camera);
      renderer.setRenderTarget(null);
    }

    writeSectionClip(clip, []);
    picker = createModelGpuPicker({
      renderer,
      sectionClip: clip,
      onLanded: landed,
      settleMilliseconds: 50,
    });
    expect(picker.supported).toBe(true);
    disposables.push(picker);
  }, setupTimeout);

  afterAll(() => {
    for (const resource of disposables.splice(0).reverse()) {
      resource.dispose();
    }
  });

  it('should name the mesh and the distance the BVH names, away from silhouettes', async () => {
    frame();
    await picker.refresh();
    const result = await compare(undefined);
    expect(result.hard).toEqual([]);
    expect(result.hits).toBeGreaterThan((width * height) / 8);
    expect(result.silhouette).toBeLessThan(result.hits / 10);
    expect(result.largestDistanceError).toBeLessThan(radius * 1e-3);
    expect(result.objects).toEqual(['box', 'housing', 'miss']);
  });

  it('should pick what the section cut leaves, through what it removes', async () => {
    // Removes everything above the housing's middle, opening it towards the camera.
    const cut: SectionCut = {
      id: 'cut',
      kind: 'plane',
      plane: 'xy',
      offset: center.z,
      isFlipped: false,
    };
    const pieces = resolveSectionPieces([cut]);
    frame();
    await picker.refresh();
    const before = await compare(undefined);

    writeSectionClip(clip, pieces);
    frame();
    await picker.refresh();
    const clipped = await compare({ enabled: true, pieces });
    writeSectionClip(clip, []);

    expect(clipped.hard).toEqual([]);
    expect(clipped.silhouette).toBeLessThan(clipped.hits / 8);
    expect(clipped.hits).toBeGreaterThan(0);
    // The cut changed what the pick names: a buffer drawn without the clip would disagree with the trees here.
    expect(clipped.hits).not.toBe(before.hits);
  });

  it('should answer pending for a scene the buffer does not show, then replay once when the pass lands', async () => {
    frame();
    const ray = pixelRay(camera, width / 2, height / 2);
    picker.pick(ray);
    await picker.refresh();
    expect(picker.pick(ray).status).toBe('hit');

    landed.mockClear();
    const moved = camera.position.clone();
    camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.2);
    camera.lookAt(center);
    camera.updateMatrixWorld();
    frame();
    // The new view is not drawn yet: neither a hit nor a miss, however often it is asked.
    const asked = pixelRay(camera, width / 2, height / 2);
    expect(picker.pick(asked).status).toBe('pending');
    expect(picker.pick(asked).status).toBe('pending');
    // Still once the camera settles, the pass is drawn on its own and lands.
    frame();
    await vi.waitFor(
      () => {
        expect(landed).toHaveBeenCalledTimes(1);
      },
      { timeout: 5000, interval: 20 },
    );
    expect(picker.pick(asked).status).not.toBe('pending');
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });
    expect(landed).toHaveBeenCalledTimes(1);

    camera.position.copy(moved);
    camera.lookAt(center);
    camera.updateMatrixWorld();
  });
});
