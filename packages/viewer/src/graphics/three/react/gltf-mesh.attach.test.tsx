/*
 * G11b: the scene's ref callback under the real R3F reconciler. R3F rebuilds a primitive whose object changes and sets
 * its refs before it adds the new object to its parent; the mocked renderer of the other GltfMesh suites cannot show
 * that, so this suite mounts the callback with `createRoot`.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import * as ActualThree from 'three';
import { Group, PerspectiveCamera } from 'three';
import type { WebGLRenderer } from 'three';
import { createRoot, extend } from '@react-three/fiber';
import type { ReconcilerRoot } from '@react-three/fiber';
import { mock } from 'vitest-mock-extended';
import type { GeometryComponentManifest } from '@taucad/types';
import { createCallbackLogic } from 'xstate';
import { createPresentationAttach, createPresentationHostAttach } from '#graphics/three/react/gltf-mesh.jsx';
import type { PresentationHostCommand } from '#machines/presentation.machine.js';

const manifest = mock<GeometryComponentManifest>();

type Presentation = Parameters<typeof createPresentationAttach>[1] & { scene: Group };

const presentationOf = (revision: number, key: string, scene = new Group()): Presentation => ({
  revision,
  key,
  unitId: `unit:${key}`,
  manifest,
  scene,
});

const roots: Array<ReconcilerRoot<HTMLCanvasElement>> = [];

async function createTestRoot(): Promise<ReconcilerRoot<HTMLCanvasElement>> {
  const canvas = document.createElement('canvas');
  const root = createRoot(canvas);
  roots.push(root);
  const gl = mock<WebGLRenderer>();
  gl.domElement = canvas;
  // Unmount detaches the XR session listeners.
  gl.xr = mock<WebGLRenderer['xr']>();
  await act(async () => {
    await root.configure({
      camera: new PerspectiveCamera(),
      frameloop: 'never',
      gl,
      size: { height: 600, left: 0, top: 0, width: 800 },
    });
  });
  return root;
}

async function mountPrimitive(): Promise<{
  readonly show: (presentation: Presentation) => Promise<void>;
  readonly commits: Array<{ key: string; revision: number; attached: boolean }>;
}> {
  const root = await createTestRoot();
  const commits: Array<{ key: string; revision: number; attached: boolean }> = [];
  let shown: Presentation | undefined;
  const graphicsActor = {
    send: vi.fn((event: { type: string; key?: string; revision?: number }) => {
      commits.push({ key: event.key!, revision: event.revision!, attached: shown?.scene.parent !== null });
    }),
  };
  return {
    commits,
    async show(presentation) {
      shown = presentation;
      await act(async () => {
        root.render(
          <group>
            <primitive ref={createPresentationAttach(graphicsActor, presentation)} object={presentation.scene} />
          </group>,
        );
      });
    },
  };
}

beforeAll(() => {
  extend(ActualThree as unknown as Parameters<typeof extend>[0]);
});

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) {
      root.unmount();
    }
  });
});

describe('createPresentationAttach under R3F (G11b)', () => {
  it('should commit a new scene once, only after it is in the scene graph', async () => {
    const { show, commits } = await mountPrimitive();
    await show(presentationOf(1, 'a'));
    await show(presentationOf(2, 'b'));

    expect(commits).toEqual([
      { key: 'a', revision: 1, attached: true },
      { key: 'b', revision: 2, attached: true },
    ]);
  });

  it('should commit an in-place update, which keeps its scene, once', async () => {
    const { show, commits } = await mountPrimitive();
    const scene = new Group();
    await show(presentationOf(1, 'a', scene));
    await show(presentationOf(2, 'a', scene));

    expect(commits).toEqual([
      { key: 'a', revision: 1, attached: true },
      { key: 'a', revision: 2, attached: true },
    ]);
  });
});

describe('createPresentationHostAttach under R3F (G11b)', () => {
  const hostOf = (hostId: string) => ({
    hostId,
    logic: createCallbackLogic<PresentationHostCommand, undefined>(() => undefined),
  });

  it('should hand the host over when the group mounts, take it back when it leaves, and swap a replaced host', async () => {
    const root = await createTestRoot();
    const sent: string[] = [];
    const graphicsActor = {
      send: vi.fn((event: { type: string; hostId?: string }) => {
        sent.push(`${event.type} ${event.hostId}`);
      }),
    };
    const show = async (host: ReturnType<typeof hostOf> | undefined): Promise<void> => {
      await act(async () => {
        root.render(host ? <group ref={createPresentationHostAttach(graphicsActor, host)} /> : null);
      });
    };
    await show(hostOf('one'));
    await show(hostOf('two'));
    await show(undefined);

    expect(sent).toEqual([
      'presentationHostAttached one',
      'presentationHostDetached one',
      'presentationHostAttached two',
      'presentationHostDetached two',
    ]);
  });
});
