import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  createViewportGizmoInteractionLock,
  useViewportGizmoInteractionLock,
  ViewportGizmoInteractionLockProvider,
} from '#graphics/three/controls/viewport-gizmo-interaction-lock.jsx';
import type { ViewportGizmoInteractionLock } from '#graphics/three/controls/viewport-gizmo-interaction-lock.jsx';

describe('ViewportGizmoInteractionLock', () => {
  it('keeps the lock active until every overlapping interaction ends', () => {
    const lock = createViewportGizmoInteractionLock();
    const endFirst = lock.begin('first');
    const endSecond = lock.begin('second');

    expect(lock.isActive()).toBe(true);
    expect(lock.activeRef.current).toBe(true);

    endFirst();

    expect(lock.isActive()).toBe(true);
    expect(lock.activeRef.current).toBe(true);

    endSecond();
    endSecond();

    expect(lock.isActive()).toBe(false);
    expect(lock.activeRef.current).toBe(false);
  });

  it('provides a stable lock instance across provider rerenders', () => {
    const seenLocks: ViewportGizmoInteractionLock[] = [];

    function Probe(): undefined {
      seenLocks.push(useViewportGizmoInteractionLock());
      return undefined;
    }

    const { rerender } = render(
      <ViewportGizmoInteractionLockProvider>
        <Probe />
      </ViewportGizmoInteractionLockProvider>,
    );
    rerender(
      <ViewportGizmoInteractionLockProvider>
        <Probe />
      </ViewportGizmoInteractionLockProvider>,
    );

    expect(seenLocks).toHaveLength(2);
    expect(seenLocks[0]).toBe(seenLocks[1]);
  });

  it('provides the given lock, and a nested provider reuses the enclosing lock', () => {
    const given = createViewportGizmoInteractionLock();
    const seenLocks: ViewportGizmoInteractionLock[] = [];

    function Probe(): undefined {
      seenLocks.push(useViewportGizmoInteractionLock());
      return undefined;
    }

    render(
      <ViewportGizmoInteractionLockProvider lock={given}>
        <Probe />
        <ViewportGizmoInteractionLockProvider>
          <Probe />
        </ViewportGizmoInteractionLockProvider>
      </ViewportGizmoInteractionLockProvider>,
    );

    expect(seenLocks).toEqual([given, given]);
    expect(seenLocks[1]).toBe(given);
  });
});
