import { createActor, fromPromise } from 'xstate';
import { describe, expect, it } from 'vitest';
import type { GraphicsInput } from '#machines/graphics.machine.js';
import { graphicsMachine } from '#machines/graphics.machine.js';

const createGraphicsActor = (input: GraphicsInput) =>
  createActor(graphicsMachine.provide({ actors: { probeWebGpu: fromPromise(async () => false) } }), { input });

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
