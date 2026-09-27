import { Profiler } from 'react';
import type { ReactNode } from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createActor, createAsyncLogic } from 'xstate';
import type { Actor } from 'xstate';
import type { RenderFrame } from '@taucad/spatial';
import { GraphicsProvider, useGraphicsSelector, useSetRenderFrame } from '#hooks/use-graphics.js';
import { graphicsMachine } from '#machines/graphics.machine.js';
import { resolveSectionPieces, toRenderSectionPieces } from '#components/geometry/graphics/section-cuts.js';
import type { SectionCut, SectionPiece } from '#components/geometry/graphics/section-cuts.js';
import {
  resolveSectionViewRaycastClip,
  useLiveSectionCutSet,
  useSectionPieces,
  useSectionViewFlags,
} from '#components/geometry/graphics/three/use-section-view.js';
import { createRaycastClipTest } from '#components/geometry/graphics/three/utils/bvh-raycast.js';
import type { SectionCutSet } from '#components/geometry/graphics/three/utils/section-view-safe-snapshot.js';

const renderFrame: RenderFrame = { anchorFrameId: 'tau:root', originMeters: [0, 0, 0], metersPerRenderUnit: 1 };

/** Whether a raycast under `context`'s clip keeps the point at height `z` on the Z axis, in render units. */
const keepsHeight = (
  context: Parameters<typeof resolveSectionViewRaycastClip>[0],
  z: number,
  frame: RenderFrame = renderFrame,
): boolean =>
  createRaycastClipTest(resolveSectionViewRaycastClip(context, frame))?.(new THREE.Vector3(0, 0, z)) ?? true;

describe('resolveSectionViewRaycastClip', () => {
  const cut: SectionCut = { id: 'xy', kind: 'plane', plane: 'xy', offset: 0.25, isFlipped: false };
  let actor: Actor<typeof graphicsMachine> | undefined;

  afterEach(() => {
    actor?.stop();
    actor = undefined;
  });

  it('should clip model raycasts with the committed cuts in the render frame while Section is on', () => {
    const frame: RenderFrame = {
      anchorFrameId: 'tau:root',
      originMeters: [0.05, -0.02, 0.1],
      metersPerRenderUnit: 0.25,
    };
    const context = { isSectionViewActive: true, committedSectionCuts: [cut] };

    expect(resolveSectionViewRaycastClip(context, frame)).toEqual({
      enabled: true,
      pieces: toRenderSectionPieces(resolveSectionPieces([cut]), frame),
    });
    // The cut at 0.25 m stands (0.25 - 0.1) / 0.25 = 0.6 render units up.
    expect(keepsHeight(context, 0.59, frame)).toBe(true);
    expect(keepsHeight(context, 0.61, frame)).toBe(false);
  });

  it.each([
    ['Section is off', { isSectionViewActive: false, committedSectionCuts: [cut] }],
    ['no cut is committed', { isSectionViewActive: true, committedSectionCuts: [] }],
  ])('should leave raycasts unclipped when %s', (_case, context) => {
    expect(resolveSectionViewRaycastClip(context, renderFrame)).toBeUndefined();
  });

  it('should raycast against the committed cuts while the caps certify newer ones', () => {
    actor = createActor(
      graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
      { input: {} },
    ).start();
    actor.send({ type: 'sceneRadiusUpdated', radius: 0.1, centerMeters: [0, 0, 0] });
    actor.send({ type: 'addSectionCut', payload: { kind: 'plane', plane: 'xy' } });
    const context = (): Parameters<typeof resolveSectionViewRaycastClip>[0] => actor!.getSnapshot().context;
    const { sectionCuts } = actor.getSnapshot().context;
    expect(sectionCuts).toMatchObject([{ plane: 'xy', offset: 0, isFlipped: false }]);
    // Nothing is clipped until the caps certify the list.
    expect(keepsHeight(context(), 0.02)).toBe(true);

    actor.send({ type: 'setSectionCertification', payload: { status: 'exact', cuts: sectionCuts } });
    expect(keepsHeight(context(), 0.02)).toBe(false);

    // A drag step lifts the live cut over the point; raycasts keep the committed cut until the caps certify it.
    actor.send({ type: 'updateSectionCut', payload: { id: sectionCuts[0]!.id, patch: { offset: 0.05 } } });
    expect(keepsHeight(context(), 0.02)).toBe(false);

    actor.send({
      type: 'setSectionCertification',
      payload: { status: 'exact', cuts: actor.getSnapshot().context.sectionCuts },
    });
    expect(keepsHeight(context(), 0.02)).toBe(true);
  });
});

describe('useSectionViewFlags', () => {
  let actor: Actor<typeof graphicsMachine> | undefined;

  afterEach(() => {
    actor?.stop();
    actor = undefined;
  });

  it('should re-render its caller when Section turns on or off, not when a cut moves', async () => {
    actor = createActor(
      graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
      { input: {} },
    ).start();
    actor.send({ type: 'sceneRadiusUpdated', radius: 0.1, centerMeters: [0, 0, 0] });
    actor.send({ type: 'addSectionCut', payload: { kind: 'plane' } });
    const [cut] = actor.getSnapshot().context.sectionCuts;

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
    expect(seen.at(-1)).toEqual({ isActive: true, enableMesh: true });

    act(() => {
      for (const offset of [0.01, 0.02, 0.03]) {
        actor!.send({ type: 'updateSectionCut', payload: { id: cut!.id, patch: { offset } } });
      }
    });
    expect(actor.getSnapshot().context.sectionCuts[0]).toMatchObject({ offset: 0.03 });
    expect(commits).toBe(settled);

    act(() => {
      actor!.send({ type: 'setSectionViewActive', payload: false });
    });
    expect(commits).toBe(settled + 1);
    expect(seen.at(-1)).toEqual({ isActive: false, enableMesh: false });
  });
});

describe('useSectionPieces', () => {
  let actor: Actor<typeof graphicsMachine> | undefined;

  afterEach(() => {
    actor?.stop();
    actor = undefined;
  });

  it('should give the committed cut list in the render frame, and keep one list until the caps commit another', async () => {
    actor = createActor(
      graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
      { input: {} },
    ).start();
    actor.send({ type: 'sceneRadiusUpdated', radius: 0.1, centerMeters: [0, 0, 0] });

    const seen: Array<readonly SectionPiece[]> = [];
    const seenLive: SectionCutSet[] = [];
    let setRenderFrame: ((next: RenderFrame) => void) | undefined;
    const Probe = (): ReactNode => {
      // Re-renders on hover too, which the pieces do not depend on.
      useGraphicsSelector((state) => state.context.hoveredSectionCutId);
      seen.push(useSectionPieces());
      seenLive.push(useLiveSectionCutSet());
      setRenderFrame = useSetRenderFrame();
      return undefined;
    };
    render(
      <GraphicsProvider graphicsRef={actor}>
        <Probe />
      </GraphicsProvider>,
    );
    await act(async () => undefined);
    const off = seen.at(-1);
    const liveOff = seenLive.at(-1);
    expect(off).toEqual([]);
    expect(liveOff).toEqual({ cuts: [], pieces: [] });

    const scaledFrame: RenderFrame = {
      anchorFrameId: 'tau:root',
      originMeters: [0.05, -0.02, 0.1],
      metersPerRenderUnit: 0.25,
    };
    act(() => {
      setRenderFrame!(scaledFrame);
      actor!.send({ type: 'addSectionCut', payload: { kind: 'plane' } });
      actor!.send({ type: 'addSectionCut', payload: { kind: 'revolution' } });
    });
    const { sectionCuts } = actor.getSnapshot().context;
    const pieces = toRenderSectionPieces(resolveSectionPieces(sectionCuts), scaledFrame);
    expect(sectionCuts).toHaveLength(2);
    // The caps certify the live list; nothing is clipped until they commit it.
    expect(seenLive.at(-1)).toEqual({ cuts: sectionCuts, pieces });
    expect(seen.at(-1)).toBe(off);

    act(() => {
      actor!.send({ type: 'setSectionCertification', payload: { status: 'exact', cuts: sectionCuts } });
    });
    const on = seen.at(-1);
    expect(on).toEqual(pieces);
    expect(on).not.toEqual(resolveSectionPieces(sectionCuts));

    const renders = seen.length;
    const live = seenLive.at(-1);
    const certified = actor.getSnapshot();
    act(() => {
      actor!.send({ type: 'setSectionCertification', payload: { status: 'exact', cuts: sectionCuts } });
      actor!.send({ type: 'hoverSectionCut', payload: sectionCuts[0]!.id });
    });
    expect(seen.length).toBeGreaterThan(renders);
    expect(seen.at(-1)).toBe(on);
    expect(seenLive.at(-1)).toBe(live);
    expect(actor.getSnapshot().context.committedSectionCuts).toBe(certified.context.committedSectionCuts);

    // A refused list leaves the committed one clipped.
    act(() => {
      actor!.send({ type: 'removeSectionCut', payload: sectionCuts[1]!.id });
      actor!.send({ type: 'setSectionCertification', payload: { status: 'rejected', cuts: sectionCuts } });
    });
    expect(actor.getSnapshot().context.sectionCertification).toBe('rejected');
    expect(seen.at(-1)).toBe(on);

    act(() => {
      actor!.send({
        type: 'setSectionCertification',
        payload: { status: 'exact', cuts: actor!.getSnapshot().context.sectionCuts },
      });
    });
    expect(seen.at(-1)).toEqual(toRenderSectionPieces(resolveSectionPieces([sectionCuts[0]!]), scaledFrame));

    act(() => {
      actor!.send({ type: 'setSectionViewActive', payload: false });
    });
    expect(seen.at(-1)).toBe(off);
    expect(seenLive.at(-1)).toBe(liveOff);
  });

  it('should keep the snapshot when the caps report the certification it holds', () => {
    actor = createActor(
      graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }),
      { input: {} },
    ).start();
    actor.send({ type: 'sceneRadiusUpdated', radius: 0.1, centerMeters: [0, 0, 0] });
    actor.send({ type: 'addSectionCut', payload: { kind: 'plane' } });
    const { sectionCuts } = actor.getSnapshot().context;
    actor.send({ type: 'setSectionCertification', payload: { status: 'exact', cuts: sectionCuts } });
    const certified = actor.getSnapshot();

    actor.send({ type: 'setSectionCertification', payload: { status: 'exact', cuts: sectionCuts } });

    expect(actor.getSnapshot()).toBe(certified);
    expect(certified.context).toMatchObject({ committedSectionCuts: sectionCuts, sectionCertification: 'exact' });
  });
});
