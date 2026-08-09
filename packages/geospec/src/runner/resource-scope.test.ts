import { describe, expect, it, vi } from 'vitest';
import type { GeometrySubject } from '#mesh/types.js';
import { createGeoSpecResourceScopeProfile } from '#runner/profile.js';
import { createGeoSpecResourceScope } from '#runner/resource-scope.js';

describe('GeoSpec resource scope disposal', () => {
  it('should run every disposable even when one throws and rethrow the first error', async () => {
    const scope = createGeoSpecResourceScope();
    const calls: string[] = [];
    const failure = new Error('dispose #1 failed');

    // Registered first, so it disposes last under LIFO — the throw above it
    // must not prevent it from running.
    scope.register(() => {
      calls.push('third');
    });
    scope.register(() => {
      calls.push('second');
    });
    // Registered last, so it disposes first and throws — the rest must still run.
    scope.register(() => {
      calls.push('first');
      throw failure;
    });

    await expect(scope.dispose()).rejects.toBe(failure);

    // Every registered disposable ran despite the throw (LIFO order).
    expect(calls).toEqual(['first', 'second', 'third']);

    // A second dispose() is a no-op: nothing re-runs.
    calls.length = 0;
    await expect(scope.dispose()).resolves.toBeUndefined();
    expect(calls).toEqual([]);
  });
});

describe('GeoSpec resource scope native reader disposal', () => {
  it("should dispose a tracked subject's native XDE reader exactly once across scopes", async () => {
    const deleteSpy = vi.fn();
    // oxlint-disable-next-line typescript/consistent-type-assertions -- minimal internal-runner stub; only the fields resource-scope reads.
    const subject = { kind: 'geometry-subject', nativeXde: { delete: deleteSpy } } as unknown as GeometrySubject;

    const first = createGeoSpecResourceScope();
    first.trackSubject(subject);
    // Cache hits re-fire onLoadResolved with the same subject; re-tracking
    // must not register a second disposal.
    first.trackSubject(subject);
    expect(deleteSpy).not.toHaveBeenCalled();

    await first.dispose();
    expect(deleteSpy).toHaveBeenCalledTimes(1);

    // Deleting an Emscripten handle twice aborts the wasm: a second scope that
    // tracked the same subject must find the delete already performed.
    const second = createGeoSpecResourceScope();
    second.trackSubject(subject);
    await second.dispose();
    expect(deleteSpy).toHaveBeenCalledTimes(1);
  });

  it('should not register a disposal when the subject has no native reader', async () => {
    const profile = createGeoSpecResourceScopeProfile();
    const scope = createGeoSpecResourceScope({ profile });
    // oxlint-disable-next-line typescript/consistent-type-assertions -- minimal internal-runner stub; only the fields resource-scope reads.
    const subject = { kind: 'geometry-subject' } as unknown as GeometrySubject;

    scope.trackSubject(subject);

    expect(profile.trackedSubjects).toBe(1);
    expect(profile.registeredDisposables).toBe(0);
    await expect(scope.dispose()).resolves.toBeUndefined();
  });
});
