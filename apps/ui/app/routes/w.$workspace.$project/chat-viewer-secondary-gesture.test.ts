import { describe, expect, it } from 'vitest';
import {
  attachViewerSecondaryGestureTarget,
  beginViewerSecondaryGesture,
  cancelViewerSecondaryGesture,
  completeViewerSecondaryGesture,
  idleViewerSecondaryGestureState,
  moveViewerSecondaryGesture,
} from '#routes/w.$workspace.$project/chat-viewer-secondary-gesture.js';

const target = {
  unitId: 'file:main.ts',
  componentId: 'component:logo',
};

describe('viewer secondary gesture reducer', () => {
  it('should open a menu for a right-click that stays within the click threshold', () => {
    const started = beginViewerSecondaryGesture({
      pointerId: 7,
      point: { clientX: 100, clientY: 120 },
    });
    const targeted = attachViewerSecondaryGestureTarget(started, target);

    const completion = completeViewerSecondaryGesture({
      state: targeted,
      pointerId: 7,
      point: { clientX: 102, clientY: 121 },
    });

    expect(completion).toEqual({
      state: idleViewerSecondaryGestureState,
      menu: {
        target,
        point: { clientX: 100, clientY: 120 },
      },
    });
  });

  it('should become camera pan after movement crosses the threshold', () => {
    const started = attachViewerSecondaryGestureTarget(
      beginViewerSecondaryGesture({
        pointerId: 7,
        point: { clientX: 100, clientY: 120 },
      }),
      target,
    );

    const moved = moveViewerSecondaryGesture({
      state: started,
      pointerId: 7,
      point: { clientX: 110, clientY: 120 },
    });
    const completion = completeViewerSecondaryGesture({
      state: moved,
      pointerId: 7,
      point: { clientX: 110, clientY: 120 },
    });

    expect(moved.status).toBe('cameraPan');
    expect(completion).toEqual({ state: idleViewerSecondaryGestureState });
  });

  it('should not open a menu when no component target is attached', () => {
    const started = beginViewerSecondaryGesture({
      pointerId: 7,
      point: { clientX: 100, clientY: 120 },
    });

    expect(
      completeViewerSecondaryGesture({
        state: started,
        pointerId: 7,
        point: { clientX: 100, clientY: 120 },
      }),
    ).toEqual({ state: idleViewerSecondaryGestureState });
  });

  it('should not open a menu for an explicitly suppressed secondary gesture', () => {
    const started = beginViewerSecondaryGesture({
      pointerId: 7,
      point: { clientX: 100, clientY: 120 },
      isSuppressed: true,
    });
    const targeted = attachViewerSecondaryGestureTarget(started, target);

    expect(
      completeViewerSecondaryGesture({
        state: targeted,
        pointerId: 7,
        point: { clientX: 100, clientY: 120 },
      }),
    ).toEqual({ state: idleViewerSecondaryGestureState });
  });

  it('should ignore pointer movement and completion from a different pointer id', () => {
    const started = beginViewerSecondaryGesture({
      pointerId: 7,
      point: { clientX: 100, clientY: 120 },
    });

    expect(
      moveViewerSecondaryGesture({
        state: started,
        pointerId: 8,
        point: { clientX: 140, clientY: 120 },
      }),
    ).toBe(started);
    expect(
      completeViewerSecondaryGesture({
        state: started,
        pointerId: 8,
        point: { clientX: 100, clientY: 120 },
      }),
    ).toEqual({ state: started });
  });

  it('should cancel the active gesture', () => {
    const started = beginViewerSecondaryGesture({
      pointerId: 7,
      point: { clientX: 100, clientY: 120 },
    });

    expect(cancelViewerSecondaryGesture(started, 7)).toBe(idleViewerSecondaryGestureState);
  });
});
