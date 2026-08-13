import { describe, expect, it, vi } from 'vitest';
import { createGeoSpecResourceScope, getGeoSpecResourceScopeFor } from '#runner/resource-scope.js';
import { createGeoSpecResourceScopeProfile, createGeoSpecRunProfile } from '#runner/profile.js';
import { exposeEngineSubject, resolveEngineSubject } from '#engine/subject-store.js';
import { loadMesh } from '#mesh/load-mesh.js';
import type { GeometrySubject } from '#mesh/types.js';

const subjectWithHandle = (deletes: { count: number }): GeometrySubject =>
  ({
    kind: 'geometry-subject',
    mesh: { format: 'mesh-buffer', stats: {} },
    provenance: { source: { kind: 'mesh-buffer', format: 'mesh-buffer' }, unit: 'mm', loader: 'in-memory' },
    capabilities: [],
    diagnostics: [],
    nativeXde: {
      delete: () => {
        deletes.count += 1;
      },
    },
  }) as unknown as GeometrySubject;

describe('resource scope', () => {
  it('should count tracked subjects and registered disposables', async () => {
    const profile = createGeoSpecResourceScopeProfile();
    const scope = createGeoSpecResourceScope({ profile });
    const deletes = { count: 0 };
    const subject = subjectWithHandle(deletes);

    expect(scope.trackSubject(subject)).toBe(subject);
    scope.register(() => undefined);
    expect(scope.disposed).toBe(false);

    await scope.dispose();

    expect(profile).toMatchObject({
      trackedSubjects: 1,
      registeredDisposables: 1,
      disposedScopes: 1,
      disposedResources: 1,
    });
    expect(deletes.count).toBe(1);
    expect(scope.disposed).toBe(true);
  });

  it('should track a subject once however often it is offered', async () => {
    const profile = createGeoSpecResourceScopeProfile();
    const scope = createGeoSpecResourceScope({ profile });
    const deletes = { count: 0 };
    const subject = subjectWithHandle(deletes);

    scope.trackSubject(subject);
    scope.trackSubject(subject);
    await scope.dispose();

    // Double-deleting an embind handle aborts the wasm instance (D-10).
    expect(profile.trackedSubjects).toBe(1);
    expect(deletes.count).toBe(1);
  });

  it('should dispose in reverse registration order and only once', async () => {
    const order: string[] = [];
    const scope = createGeoSpecResourceScope();
    scope.register(() => {
      order.push('first');
    });
    scope.register(async () => {
      order.push('second');
    });

    await scope.dispose();
    await scope.dispose();

    expect(order).toEqual(['second', 'first']);
  });

  it('should let a throwing disposer strand nothing behind it', async () => {
    const later = vi.fn();
    const scope = createGeoSpecResourceScope();
    scope.register(later);
    scope.register(() => {
      throw new Error('backend already gone');
    });

    await expect(scope.dispose()).resolves.toBeUndefined();
    expect(later).toHaveBeenCalledTimes(1);
  });

  it('should work without a profile and expose none', async () => {
    const scope = createGeoSpecResourceScope();
    expect(scope.profile).toBeUndefined();
    scope.trackSubject(subjectWithHandle({ count: 0 }));
    scope.register(() => undefined);
    await expect(scope.dispose()).resolves.toBeUndefined();
  });

  it('should tolerate a subject with no native read', async () => {
    const scope = createGeoSpecResourceScope();
    scope.trackSubject({ kind: 'geometry-subject' } as unknown as GeometrySubject);
    await expect(scope.dispose()).resolves.toBeUndefined();
  });

  it('should release retained Contract-B subjects with their native reads', async () => {
    const loaded = await loadMesh({
      source: { format: 'mesh-buffer', positions: [0, 0, 0, 1, 0, 0, 0, 1, 0] },
    });
    if (!loaded.success) {
      throw new Error(loaded.diagnostics.map(({ message }) => message).join('\n'));
    }
    const deleteNative = vi.fn();
    loaded.subject.nativeXde = { delete: deleteNative } as unknown as NonNullable<GeometrySubject['nativeXde']>;
    const exposed = exposeEngineSubject(loaded.subject);
    const scope = createGeoSpecResourceScope();

    scope.trackSubject(loaded.subject);
    await scope.dispose();

    expect(resolveEngineSubject(exposed.subjectId)).toBeUndefined();
    expect(deleteNative).toHaveBeenCalledOnce();
  });
});

describe('getGeoSpecResourceScopeFor', () => {
  it('should associate a tracked subject with its scope until disposal', async () => {
    const scope = createGeoSpecResourceScope();
    const subject = { kind: 'geometry-subject' } as unknown as GeometrySubject;

    expect(getGeoSpecResourceScopeFor(subject)).toBeUndefined();
    scope.trackSubject(subject);
    expect(getGeoSpecResourceScopeFor(subject)).toBe(scope);

    await scope.dispose();

    expect(getGeoSpecResourceScopeFor(subject)).toBeUndefined();
  });
});

describe('run profile', () => {
  it('should start every counter at zero', () => {
    expect(createGeoSpecRunProfile()).toEqual({
      aggregateModelLoadCache: { hits: 0, misses: 0, bypasses: 0, failures: 0 },
      moduleModelLoadCache: { hits: 0, misses: 0, bypasses: 0, failures: 0 },
      resourceScope: {
        trackedSubjects: 0,
        registeredDisposables: 0,
        disposedScopes: 0,
        disposedResources: 0,
        overlap: expect.objectContaining({ cacheCreations: 0, prefilterProven: 0 }) as unknown,
      },
    });
  });
});
