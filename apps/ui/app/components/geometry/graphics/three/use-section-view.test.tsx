import { Profiler } from 'react';
import type { ReactNode } from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createActor, createAsyncLogic } from 'xstate';
import type { Actor } from 'xstate';
import type { RenderFrame } from '@taucad/spatial';
import { GraphicsProvider } from '#hooks/use-graphics.js';
import { graphicsMachine } from '#machines/graphics.machine.js';
import {
  resolveSectionViewRaycastClip,
  resolveSectionViewRenderPlane,
  useSectionViewFlags,
} from '#components/geometry/graphics/three/use-section-view.js';

const renderFrame: RenderFrame = { anchorFrameId: 'tau:root', originMeters: [0, 0, 0], metersPerRenderUnit: 1 };

const activeContext = {
  isSectionViewActive: true,
  selectedSectionViewId: 'xy',
  enableClippingMesh: true,
  availableSectionViews: [{ id: 'xy', normal: [0, 0, 1], constant: 0 }],
  sectionViewPivot: [0, 0, 0.25],
  sectionViewRotation: [0, 0, 0],
  sectionViewDirection: 1,
} satisfies Parameters<typeof resolveSectionViewRaycastClip>[0];

describe('resolveSectionViewRaycastClip', () => {
  it('should clip model raycasts with the plane through the pivot while an active cut cuts meshes', () => {
    const clip = resolveSectionViewRaycastClip(activeContext, renderFrame);

    expect(clip?.enabled).toBe(true);
    expect(clip?.planes).toHaveLength(1);
    const [plane] = clip!.planes;
    expect(plane!.distanceToPoint(new THREE.Vector3(0, 0, 0.25))).toBeCloseTo(0);
    expect(Math.abs(plane!.normal.z)).toBeCloseTo(1);
    expect(plane!.equals(resolveSectionViewRenderPlane(activeContext, renderFrame))).toBe(true);
  });

  it.each([
    ['the section view is off', { isSectionViewActive: false }],
    ['no plane is selected', { selectedSectionViewId: undefined }],
    ['mesh clipping is off', { enableClippingMesh: false }],
  ] as const)('should leave raycasts unclipped when %s', (_case, override) => {
    expect(resolveSectionViewRaycastClip({ ...activeContext, ...override }, renderFrame)).toBeUndefined();
  });
});

describe('useSectionViewFlags', () => {
  let actor: Actor<typeof graphicsMachine> | undefined;

  afterEach(() => {
    actor?.stop();
    actor = undefined;
  });

  it('should re-render its caller when the cut turns on or off, not when the cut moves', async () => {
    actor = createActor(
      graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
      { input: {} },
    ).start();
    actor.send({ type: 'sceneRadiusUpdated', radius: 0.1, centerMeters: [0, 0, 0] });
    actor.send({ type: 'setSectionViewActive', payload: true });
    actor.send({ type: 'selectSectionView', payload: 'xy' });

    const seen: Array<{ isActive: boolean; enableMesh: boolean }> = [];
    let commits = 0;
    const Probe = (): ReactNode => {
      seen.push(useSectionViewFlags());
      return undefined;
    };
    render(
      <GraphicsProvider graphicsRef={actor}>
        <Profiler
          id='flags'
          onRender={() => {
            commits += 1;
          }}
        >
          <Probe />
        </Profiler>
      </GraphicsProvider>,
    );
    await act(async () => undefined);
    const settled = commits;

    act(() => {
      for (const step of [0.01, 0.02, 0.03]) {
        actor!.send({ type: 'setSectionViewTranslation', payload: step });
      }
      actor!.send({ type: 'setSectionViewRotation', payload: [0.1, 0, 0] });
    });
    expect(actor.getSnapshot().context.sectionViewTranslation).toBeCloseTo(0.03);
    expect(commits).toBe(settled);

    act(() => {
      actor!.send({ type: 'setSectionViewActive', payload: false });
    });
    expect(commits).toBe(settled + 1);
    expect(seen.at(-1)).toEqual({ isActive: false, enableMesh: true });
  });
});
