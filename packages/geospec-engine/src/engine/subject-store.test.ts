import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { isGeoSpecJsonValue } from 'geospec/engine';
import {
  clearEngineSubjects,
  exposeEngineSubject,
  releaseEngineSubject,
  resolveEngineSubject,
  retainEngineSubject,
} from '#engine/subject-store.js';
import { loadMesh } from '#mesh/load-mesh.js';
import type { GeometrySubject } from '#mesh/types.js';
import type { GeoSpecNativeXdeReadResult } from '#step/types.js';

const loadedSubject = async (): Promise<GeometrySubject> => {
  const loaded = await loadMesh({
    source: { format: 'mesh-buffer', positions: [0, 0, 0, 1, 0, 0, 0, 1, 0] },
  });
  if (!loaded.success) {
    throw new Error(loaded.diagnostics.map(({ message }) => message).join('\n'));
  }
  return loaded.subject;
};

afterEach(() => {
  clearEngineSubjects();
});

describe('engine subject store', () => {
  it('projects live engine subjects to detached JSON data plus an opaque ID', async () => {
    const subject = await loadedSubject();

    const exposed = exposeEngineSubject(subject);

    expect(isGeoSpecJsonValue(exposed)).toBe(true);
    expect(exposed.subjectId).toBeTypeOf('string');
    expect(exposed.mesh.stats).toStrictEqual({ vertexCount: 3, meshCount: 1, triangleCount: 1 });
    expect(resolveEngineSubject(exposed.subjectId)).toBe(subject);
  });

  it('rejects an arbitrary host object masquerading as a retained subject', () => {
    const forged = { kind: 'geometry-subject', subjectId: 'forged' } as unknown as Parameters<
      typeof exposeEngineSubject
    >[0];
    expect(() => exposeEngineSubject(forged)).toThrow(/previously ingested|reading 'stats'/u);
  });

  it('reuses both an attached subject ID and its weak identity', async () => {
    const subject = await loadedSubject();
    delete subject.provenance.contentHash;
    const first = retainEngineSubject(subject);
    expect(retainEngineSubject(subject)).toStrictEqual(first);

    delete subject.subjectId;
    expect(retainEngineSubject(subject)).toStrictEqual(first);
  });

  it('does not evaluate lazy mesh facets and releases native resources idempotently', async () => {
    const subject = await loadedSubject();
    const eagerFacet = (): never => {
      throw new Error('lazy mesh facet evaluated');
    };
    Object.defineProperties(subject.mesh.stats, {
      meshQuality: { get: eagerFacet },
      watertight: { get: eagerFacet },
      boundingBox: { get: eagerFacet },
    });
    const deleteNative = vi.fn();
    subject.nativeXde = mock<GeoSpecNativeXdeReadResult>({ delete: deleteNative });
    const exposed = exposeEngineSubject(subject);

    expect(exposed.mesh.stats).toStrictEqual({ vertexCount: 3, meshCount: 1, triangleCount: 1 });
    expect(releaseEngineSubject('missing')).toBe(false);
    expect(releaseEngineSubject(exposed.subjectId)).toBe(true);
    expect(releaseEngineSubject(exposed.subjectId)).toBe(false);
    expect(deleteNative).toHaveBeenCalledOnce();
  });
});
