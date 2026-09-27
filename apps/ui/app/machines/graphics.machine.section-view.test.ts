import { createActor, createAsyncLogic } from 'xstate';
import type { SnapshotFrom } from 'xstate';
import { describe, expect, it } from 'vitest';
import type { GraphicsInput } from '#machines/graphics.machine.js';
import { graphicsMachine } from '#machines/graphics.machine.js';

const createGraphicsActor = (input: GraphicsInput) =>
  createActor(graphicsMachine.provide({ actors: { probeWebGpu: createAsyncLogic({ run: async () => false }) } }), {
    input,
  });

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** An active cut on the XZ plane through a geometry centred at [1, 2, 3] m, recording every published snapshot. */
const startXzCut = () => {
  const actor = createGraphicsActor({});
  actor.start();
  actor.send({ type: 'sceneRadiusUpdated', radius: 0.1, centerMeters: [1, 2, 3] });
  actor.send({ type: 'setSectionViewActive', payload: true });
  actor.send({ type: 'selectSectionView', payload: 'xz' });
  const published: Array<SnapshotFrom<typeof graphicsMachine>> = [];
  const subscription = actor.subscribe((snapshot) => {
    published.push(snapshot);
  });
  return { actor, published, subscription };
};

describe('graphics machine durable section view (E2)', () => {
  it('should restore a seeded cut into the active section-view state without re-deriving it', () => {
    const actor = createGraphicsActor({
      sectionView: { active: true, plane: 'xz', pivot: [1, 2, 3], rotation: [0, 0.5, 0], direction: -1 },
      sectionDisplay: { clipLines: false, clipMesh: true, planeName: 'cartesian' },
    });
    actor.start();
    try {
      const snapshot = actor.getSnapshot();
      expect(snapshot.matches({ operational: { 'section-view': 'active' } })).toBe(true);
      expect(snapshot.context.isSectionViewActive).toBe(true);
      expect(snapshot.context.selectedSectionViewId).toBe('xz');
      // The pivot and rotation are the person's, not values re-derived from the geometry centre.
      expect(snapshot.context.sectionViewPivot).toEqual([1, 2, 3]);
      expect(snapshot.context.sectionViewRotation).toEqual([0, 0.5, 0]);
      expect(snapshot.context.sectionViewDirection).toBe(-1);
      // Derived from the seeded pivot, never persisted.
      expect(snapshot.context.sectionViewTranslation).toBe(2);
      expect(snapshot.context.enableClippingLines).toBe(false);
      expect(snapshot.context.enableClippingMesh).toBe(true);
      expect(snapshot.context.planeName).toBe('cartesian');
    } finally {
      actor.stop();
    }
  });

  it('should open the plane selectors when the seeded cut names no plane', () => {
    const actor = createGraphicsActor({
      sectionView: { active: true, pivot: [0, 0, 0], rotation: [0, 0, 0], direction: 1 },
    });
    actor.start();
    try {
      expect(actor.getSnapshot().matches({ operational: { 'section-view': 'pending' } })).toBe(true);
      expect(actor.getSnapshot().context.isSectionViewActive).toBe(true);
    } finally {
      actor.stop();
    }
  });

  it('should stay ready with an inactive seed and keep the display preferences', () => {
    const actor = createGraphicsActor({
      sectionView: { active: false, plane: 'xy', pivot: [1, 2, 3], rotation: [0, 0, 0], direction: 1 },
      sectionDisplay: { clipLines: true, clipMesh: false, planeName: 'face' },
    });
    actor.start();
    try {
      expect(actor.getSnapshot().matches({ operational: 'ready' })).toBe(true);
      expect(actor.getSnapshot().context.isSectionViewActive).toBe(false);
      expect(actor.getSnapshot().context.enableClippingMesh).toBe(false);
    } finally {
      actor.stop();
    }
  });

  it('should use the inactive defaults when a record carries no section view', () => {
    const actor = createGraphicsActor({});
    actor.start();
    try {
      const snapshot = actor.getSnapshot();
      expect(snapshot.matches({ operational: 'ready' })).toBe(true);
      expect(snapshot.context.isSectionViewActive).toBe(false);
      expect(snapshot.context.selectedSectionViewId).toBeUndefined();
      expect(snapshot.context.enableClippingLines).toBe(true);
      expect(snapshot.context.enableClippingMesh).toBe(true);
      expect(snapshot.context.planeName).toBe('face');
    } finally {
      actor.stop();
    }
  });
});

/* XState notifies observers after every event, so "no change" means the same snapshot object: `useSelector`
 * bails out on snapshot identity, so no subscriber re-renders or re-runs its selector. */
describe('graphics machine section view steps', () => {
  it('should publish no new snapshot for a pivot step that repeats the stored pivot', () => {
    const { actor, published, subscription } = startXzCut();
    try {
      const before = actor.getSnapshot();
      expect(before.context.sectionViewPivot).toEqual([1, 2, 3]);

      actor.send({ type: 'setSectionViewPivot', payload: [1, 2, 3] });
      actor.send({ type: 'setSectionViewPivot', payload: [1, 2, 3] });

      expect(actor.getSnapshot()).toBe(before);
      expect(published.every((snapshot) => snapshot === before)).toBe(true);

      actor.send({ type: 'setSectionViewPivot', payload: [1, 2.5, 3] });

      expect(actor.getSnapshot()).not.toBe(before);
      expect(actor.getSnapshot().context.sectionViewPivot).toEqual([1, 2.5, 3]);
      expect(actor.getSnapshot().context.sectionViewTranslation).toBe(2.5);
    } finally {
      subscription.unsubscribe();
      actor.stop();
    }
  });

  it('should show a translation as soon as it applies and ignore the same translation repeated', () => {
    const { actor, published, subscription } = startXzCut();
    try {
      actor.send({ type: 'setSectionViewTranslation', payload: 2.5 });

      // The displayed value is the requested one, not the projection of the pivot the step started from.
      const moved = actor.getSnapshot();
      expect(moved.context.sectionViewPivot).toEqual([1, 2.5, 3]);
      expect(moved.context.sectionViewTranslation).toBe(2.5);

      published.length = 0;
      actor.send({ type: 'setSectionViewTranslation', payload: 2.5 });

      expect(actor.getSnapshot()).toBe(moved);
      expect(published.every((snapshot) => snapshot === moved)).toBe(true);

      actor.send({ type: 'setSectionViewTranslation', payload: 2.75 });

      expect(actor.getSnapshot().context.sectionViewPivot).toEqual([1, 2.75, 3]);
      expect(actor.getSnapshot().context.sectionViewTranslation).toBe(2.75);
    } finally {
      subscription.unsubscribe();
      actor.stop();
    }
  });

  it('should publish no new snapshot for a rotation step that rounds to the stored degrees', () => {
    const { actor, published, subscription } = startXzCut();
    try {
      actor.send({ type: 'setSectionViewRotation', payload: [toRadians(10), 0, 0] });
      const rotated = actor.getSnapshot();
      expect(rotated.context.sectionViewRotation).toEqual([toRadians(10), 0, 0]);

      published.length = 0;
      actor.send({ type: 'setSectionViewRotation', payload: [toRadians(10.2), 0, 0] });

      expect(actor.getSnapshot()).toBe(rotated);
      expect(published.every((snapshot) => snapshot === rotated)).toBe(true);

      actor.send({ type: 'setSectionViewRotation', payload: [toRadians(11), 0, 0] });

      expect(actor.getSnapshot().context.sectionViewRotation).toEqual([toRadians(11), 0, 0]);
      // Rotation leaves the pivot, and so the displayed translation, where it was.
      expect(actor.getSnapshot().context.sectionViewPivot).toBe(rotated.context.sectionViewPivot);
      expect(actor.getSnapshot().context.sectionViewTranslation).toBe(2);
    } finally {
      subscription.unsubscribe();
      actor.stop();
    }
  });

  it('should mark a pointer gesture as moved once, however many steps it reports', () => {
    const { actor, published, subscription } = startXzCut();
    try {
      actor.send({ type: 'markModelPointerGestureMoved' });
      const marked = actor.getSnapshot();
      expect(marked.context.suppressNextModelPointerClick).toBe(true);

      published.length = 0;
      actor.send({ type: 'markModelPointerGestureMoved' });

      expect(actor.getSnapshot()).toBe(marked);
      expect(published.every((snapshot) => snapshot === marked)).toBe(true);
    } finally {
      subscription.unsubscribe();
      actor.stop();
    }
  });
});
