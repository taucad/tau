import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import * as THREE from 'three';
import type { WebGLRenderer } from 'three';
import { advance, createRoot, extend } from '@react-three/fiber';
import { mock } from 'vitest-mock-extended';
import { createActor, createAsyncLogic } from 'xstate';
import { GraphicsProvider } from '#hooks/use-graphics.js';
import { graphicsMachine } from '#machines/graphics.machine.js';
import { SectionViewScene } from '#components/geometry/graphics/three/stage.js';
import { ThreeGraphicsBackendProvider } from '#components/geometry/graphics/three/three-graphics-backend-context.js';
import { getSectionClip } from '#components/geometry/graphics/three/materials/section-clip.js';
import { createSectionViewSafeSnapshotStore } from '#components/geometry/graphics/three/utils/section-view-safe-snapshot.js';

vi.mock('#hooks/use-theme.js', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Mirrors the production Theme values.
  Theme: { DARK: 'dark', LIGHT: 'light' },
  useTheme: () => ({ theme: 'light' }),
}));

vi.mock('#flags/use-feature.js', () => ({ useFeature: () => false }));

describe('SectionViewScene', () => {
  let unmount: (() => void) | undefined;

  beforeAll(() => {
    extend({ Group: THREE.Group });
  });

  afterEach(() => {
    unmount?.();
    unmount = undefined;
  });

  it('should clip the cuts the caps commit in the frame that commits them', async () => {
    const actor = createActor(
      graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
      { input: {} },
    ).start();
    actor.send({ type: 'sceneRadiusUpdated', radius: 1, centerMeters: [0, 0, 0] });
    actor.send({ type: 'addSectionCut', payload: { kind: 'plane', plane: 'xy' } });

    const canvas = document.createElement('canvas');
    document.body.append(canvas);
    const root = createRoot(canvas);
    const gl = mock<WebGLRenderer>();
    gl.domElement = canvas;
    await act(async () => {
      await root.configure({
        camera: new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 100),
        frameloop: 'never',
        gl,
        size: { height: 600, left: 0, top: 0, width: 800 },
      });
    });
    // Resolve the optional module before asserting the frame that certifies an active cut.
    await import('#components/geometry/graphics/three/react/section-contour-fill.js');
    const inner = new THREE.Group();
    inner.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial()));
    const innerRef = { current: inner };
    const snapshotRef = { current: createSectionViewSafeSnapshotStore() };
    let scene: THREE.Scene | undefined;
    await act(async () => {
      const store = root.render(
        <GraphicsProvider graphicsRef={actor}>
          <ThreeGraphicsBackendProvider value='webgl'>
            <SectionViewScene innerRef={innerRef} snapshotRef={snapshotRef}>
              <primitive object={inner} />
            </SectionViewScene>
          </ThreeGraphicsBackendProvider>
        </GraphicsProvider>,
      );
      scene = store.getState().scene;
    });
    unmount = () => {
      act(() => {
        root.unmount();
      });
      canvas.remove();
      actor.stop();
    };

    const clip = getSectionClip(scene!, 'webgl');
    const clipped = (): number[][] =>
      Array.from({ length: clip.settings.x }, (_, index) => clip.first[index]!.toArray());
    const committed = (): number[][] | undefined =>
      snapshotRef.current.committed?.cutSet.pieces.map(({ halfSpaces: [first] }) => [
        ...first!.normal,
        first!.constant,
      ]);

    // The frame runs inside `act` only so React does not warn; the clip writes during the frame, before `act` flushes.
    const frame = (): void => {
      act(() => {
        advance(performance.now());
      });
    };
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    frame();
    expect(committed()).toHaveLength(1);
    expect(clipped()).toEqual(committed());

    // A drag step: the caps certify the moved cut, and the clip removes it in that same frame.
    const [cut] = actor.getSnapshot().context.sectionCuts;
    await act(async () => {
      actor.send({ type: 'updateSectionCut', payload: { id: cut!.id, patch: { offset: 0.25 } } });
    });
    const before = clipped();

    frame();

    expect(clipped()).not.toEqual(before);
    expect(clipped()).toEqual(committed());
    expect(actor.getSnapshot().context.committedSectionCuts).toBe(actor.getSnapshot().context.sectionCuts);
  });
});
