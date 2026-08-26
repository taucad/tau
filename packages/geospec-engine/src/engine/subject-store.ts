/** Engine-owned opaque subject store for Contract B. @module */

import { assertGeoSpecJsonValue } from 'geospec/engine';
import type { GeoSpecSubjectReference } from 'geospec/engine';
import type { GeometryStats as PublicGeometryStats, GeometrySubject as PublicGeometrySubject } from 'geospec/mesh';
import type { GeometrySubject } from '#mesh/types.js';

type StoredSubject = GeometrySubject;

const subjects = new Map<string, StoredSubject>();
const identifiers = new WeakMap<StoredSubject, string>();
let nextSubject = 0;

/** Retain an engine subject and return its wire-safe opaque reference. */
export const retainEngineSubject = (subject: GeometrySubject | PublicGeometrySubject): GeoSpecSubjectReference => {
  if (subject.subjectId !== undefined) {
    const retained = subjects.get(subject.subjectId);
    if (retained !== undefined) {
      return {
        kind: 'geometry-subject-reference',
        subjectId: subject.subjectId,
        contentHash: retained.provenance.contentHash ?? 'sha256:unavailable',
      };
    }
  }
  const stats = (subject as Partial<GeometrySubject>).mesh?.stats as
    | Partial<GeometrySubject['mesh']['stats']>
    | undefined;
  if (typeof stats?.analyseConnectedComponents !== 'function' || typeof stats.analyseWatertight !== 'function') {
    throw new TypeError('Host model loaders must return a subject reference previously ingested by this engine.');
  }
  const stored = subject as GeometrySubject;
  const existing = identifiers.get(stored);
  if (existing !== undefined) {
    return {
      kind: 'geometry-subject-reference',
      subjectId: existing,
      contentHash: subject.provenance.contentHash ?? 'sha256:unavailable',
    };
  }

  nextSubject += 1;
  const contentHash = subject.provenance.contentHash ?? 'sha256:unavailable';
  const subjectId = `${contentHash}:${nextSubject}`;
  identifiers.set(stored, subjectId);
  subjects.set(subjectId, stored);
  stored.subjectId = subjectId;
  return { kind: 'geometry-subject-reference', subjectId, contentHash };
};

const publicStats = (stats: GeometrySubject['mesh']['stats']): PublicGeometryStats => ({
  vertexCount: stats.vertexCount,
  meshCount: stats.meshCount,
  triangleCount: stats.triangleCount,
  meshQuality: stats.meshQuality,
  watertight: stats.watertight,
  ...(stats.boundingBox === undefined ? {} : { boundingBox: stats.boundingBox }),
});

/** Return a detached, data-only subject reference for the substrate facade. */
export const exposeEngineSubject = (subject: GeometrySubject): PublicGeometrySubject => {
  const reference = retainEngineSubject(subject);
  const exposed = {
    kind: 'geometry-subject',
    subjectId: reference.subjectId,
    mesh: { format: subject.mesh.format, stats: publicStats(subject.mesh.stats) },
    ...(subject.step === undefined ? {} : { step: subject.step }),
    provenance: subject.provenance,
    capabilities: subject.capabilities,
    diagnostics: subject.diagnostics,
  };
  const detached: unknown = structuredClone(exposed);
  assertGeoSpecJsonValue(detached);
  return detached as unknown as PublicGeometrySubject;
};

/** Resolve an opaque handle entirely inside the engine. */
export const resolveEngineSubject = (subjectId: string): GeometrySubject | undefined => subjects.get(subjectId);

/** Resolve a public reference without accepting a live object from the caller. */
export const resolvePublicEngineSubject = (subject: PublicGeometrySubject): GeometrySubject | undefined =>
  subjects.get(subject.subjectId);

/** Release one subject and its native resources. Idempotent. */
export const releaseEngineSubject = (subjectId: string): boolean => {
  const subject = subjects.get(subjectId);
  if (subject === undefined) {
    return false;
  }
  subjects.delete(subjectId);
  identifiers.delete(subject);
  delete subject.subjectId;
  subject.nativeXde?.delete?.();
  return true;
};

/** Test-support reset. */
export const clearEngineSubjects = (): void => {
  for (const subjectId of subjects.keys()) {
    releaseEngineSubject(subjectId);
  }
  nextSubject = 0;
};
