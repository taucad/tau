/**
 * Per-occurrence tessellation, cached.
 *
 * Void and interference proofs need the triangles of *one*
 * occurrence, not the whole assembly. The kernel writes them into the same
 * retained buffer the whole-subject soup uses, so the copy-out is synchronous
 * and immediate — any interleaved native call would invalidate the pointer
 * (shared-heap invariant).
 *
 * Results persist in the `occurrence-mesh` family through the section codec:
 * a per-occurrence soup is exactly the kind of multi-megabyte payload that must
 * never round-trip JSON.
 *
 * @module
 */

import { copyTriangleSoup } from '#native/opencascade-module.js';
import { decodeSections, encodeSections, float32ToSection, sectionToFloat32 } from '#cache/section-codec.js';
import { readEvidenceBytes, writeEvidenceBytes } from '#cache/evidence-cache.js';
import { toMeshBufferPositions } from '#mesh/soup.js';
import type { OccurrenceMesh, OccurrenceMeshOptions } from '#mesh/types.js';
import type { GeoSpecNativeStepBackend, GeoSpecNativeXdeReadResult } from '#step/types.js';

/**
 * Fetchers bound to one retained read.
 *
 * @public
 */
export type OccurrenceMeshFetchers = {
  occurrenceMesh(occurrence: number, options?: OccurrenceMeshOptions): OccurrenceMesh | undefined;
};

/**
 * Options for {@link createOccurrenceMeshFetchers}.
 *
 * @public
 */
export type CreateOccurrenceMeshFetchersOptions = {
  native: GeoSpecNativeXdeReadResult;
  backend: GeoSpecNativeStepBackend;
  /** Subject content hash: the cache key's first component. */
  contentHash: string;
  /** Tessellation options passed to the kernel, verbatim. */
  optionsJson: string;
};

const decode = (bytes: Uint8Array<ArrayBuffer>): OccurrenceMesh | undefined => {
  const decoded = decodeSections(bytes);
  if (decoded?.sections.length !== 1) {
    return undefined;
  }
  const header = decoded.header as { triangleCount?: number };
  return { positions: sectionToFloat32(decoded.sections[0]!), triangleCount: header.triangleCount ?? 0 };
};

/**
 * Build the occurrence-mesh fetchers for one retained read.
 *
 * @param options - The read, its module, and the cache-key components.
 * @returns The fetchers.
 * @public
 */
export const createOccurrenceMeshFetchers = (options: CreateOccurrenceMeshFetchersOptions): OccurrenceMeshFetchers => {
  const { native, backend, contentHash, optionsJson } = options;
  // In-memory, per subject, alongside the persistent family. A void claim asks
  // for the same `(occurrence, deflection)` soup once per material per claim,
  // and a spec file makes several such claims: without this the warm path pays
  // a store read plus a full section decode every single time, and the
  // Barnes-Hut tree downstream is rebuilt because the buffer identity changed.
  // Result-identical by construction — the key is the persistent key.
  const resident = new Map<string, OccurrenceMesh | undefined>();

  const fetch = (key: Record<string, unknown>, tessellate: () => string): OccurrenceMesh | undefined => {
    const residentKey = JSON.stringify(key);
    if (resident.has(residentKey)) {
      return resident.get(residentKey);
    }
    const mesh = fetchUncached(key, tessellate);
    resident.set(residentKey, mesh);
    return mesh;
  };

  const fetchUncached = (key: Record<string, unknown>, tessellate: () => string): OccurrenceMesh | undefined => {
    const cached = readEvidenceBytes('occurrence-mesh', key);
    if (cached) {
      const decoded = decode(cached);
      if (decoded) {
        return decoded;
      }
    }
    const summary = JSON.parse(tessellate()) as { triangleCount?: number; error?: string };
    if (summary.error !== undefined) {
      // A failed tessellation is not evidence and is never stored (C5).
      return undefined;
    }
    const triangleCount = native.meshTriangleCount();
    const positions = toMeshBufferPositions(copyTriangleSoup(backend, native.meshTrianglePointer(), triangleCount));
    writeEvidenceBytes('occurrence-mesh', key, encodeSections({ triangleCount }, [float32ToSection(positions)]));
    return { positions, triangleCount };
  };

  /** The kernel options for this fetch: the load-time options, deflection-overridden. */
  const tessellationOptions = (options: OccurrenceMeshOptions | undefined): string =>
    JSON.stringify({
      ...(JSON.parse(optionsJson) as Record<string, unknown>),
      // An occurrence fetch IS the request to tessellate. The load-time `mesh`
      // flag decides only whether the READ meshes the whole root shape up
      // front; forwarding it here made every explicit per-occurrence request on
      // a `mesh: false` subject return an empty soup, because the kernel's
      // extractor returns immediately on `!options.mesh`. The whole v8 corpus
      // loads with `mesh: false`, while topological void proof requests these
      // occurrence soups lazily.
      mesh: true,
      ...(options?.deflection === undefined ? {} : { meshLinearTolerance: options.deflection }),
    });

  return {
    occurrenceMesh: (occurrence, options) => {
      const json = tessellationOptions(options);
      return fetch({ contentHash, occurrence, optionsJson: json }, () =>
        native.occurrenceMeshTriangles(occurrence, json),
      );
    },
  };
};
