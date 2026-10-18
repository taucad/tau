import { unlink } from 'node:fs/promises';

import type { PythonSession } from '@taucad/python-kernel-core';
import type { ResidentCacheBinding, ResidentExportEntry } from '@taucad/runtime/kernel';
import { actionDigest } from '@taucad/cache-core';
import type { ActionDigest, ComputeAction } from '@taucad/cache-core';

import {
  build123dComputeClearSchema,
  build123dComputeDescriptorLimit,
  build123dComputeExportSchema,
  build123dComputeImportSchema,
} from '#build123d.protocol.js';

const brepMediaType = 'application/vnd.opencascade.brep';

/**
 * The worker's lineage cache as the runtime sees it.
 *
 * `contains` mirrors what the worker reported; the view is eventually consistent
 * and conservative, so an omission is a miss and never a false hit.
 */
type Build123dResidentBinding = ResidentCacheBinding & {
  /** Record identities the worker admitted during a build. */
  readonly track: (digests: readonly ActionDigest[]) => void;
  /** Record the worker-reported logical residency for the binding's statistics. */
  readonly observeResidentBytes: (bytes: number) => void;
};

/**
 * Bind the worker's lineage cache as the kernel-owned resident cache, over the bounded `compute.*` bundle protocol.
 * @param session - The Python session whose worker holds the cache.
 * @returns The resident binding one compute scope is opened against.
 */
export const createBuild123dResidentBinding = (session: PythonSession): Build123dResidentBinding => {
  const mirror = new Set<ActionDigest>();
  let evictions = 0;
  let omissions = 0;
  let residentBytes = 0;
  const control = new AbortController();
  return {
    contains: ({ digest }) => mirror.has(digest),
    track: (digests) => {
      for (const digest of digests) {
        mirror.add(digest);
      }
    },
    observeResidentBytes: (bytes) => {
      residentBytes = bytes;
    },
    importEntries: async ({ entries, signal }) => {
      const admitted = entries.slice(0, build123dComputeDescriptorLimit);
      if (admitted.length === 0) {
        return { imported: [], omitted: [] };
      }
      const bundle = await session.writeArtifact(
        new Uint8Array(Buffer.concat(admitted.map(({ bytes }) => Buffer.from(bytes)))),
        'compute-bundle.bin',
      );
      const result = await session
        .request({
          method: 'compute.import',
          params: {
            descriptors: admitted.map((entry) => ({
              action: entry.action,
              actionDigest: entry.actionDigest,
              contentDigest: entry.contentDigest,
              byteLength: entry.bytes.byteLength,
            })),
            bundle,
          },
          schema: build123dComputeImportSchema,
          signal,
        })
        .finally(async () => unlink(bundle.artifactPath).catch(() => undefined));
      for (const digest of result.imported) {
        mirror.add(actionDigest({ value: digest }));
      }
      omissions += result.omitted.length + (entries.length - admitted.length);
      return {
        imported: result.imported.map((digest) => actionDigest({ value: digest })),
        omitted: [
          ...result.omitted.map((digest) => actionDigest({ value: digest })),
          ...entries.slice(build123dComputeDescriptorLimit).map((entry) => entry.actionDigest),
        ],
      };
    },
    exportEntries: async ({ digests, signal }) => {
      const admitted = digests.slice(0, build123dComputeDescriptorLimit);
      if (admitted.length === 0) {
        return { entries: [], omitted: [] };
      }
      const result = await session.request({
        method: 'compute.export',
        params: { digests: admitted },
        schema: build123dComputeExportSchema,
        signal,
      });
      const omitted: ActionDigest[] = [
        ...result.omitted.map((digest) => actionDigest({ value: digest })),
        ...digests.slice(build123dComputeDescriptorLimit),
      ];
      if (!result.bundle) {
        return { entries: [], omitted };
      }
      const payload = await session.readArtifact(result.bundle);
      const entries: ResidentExportEntry[] = [];
      let offset = 0;
      for (const descriptor of result.descriptors) {
        const bytes = payload.slice(offset, offset + descriptor.byteLength);
        offset += descriptor.byteLength;
        if (bytes.byteLength !== descriptor.byteLength) {
          omitted.push(actionDigest({ value: descriptor.actionDigest }));
          continue;
        }
        entries.push({
          action: descriptor.action as unknown as ComputeAction,
          bytes: new Uint8Array(bytes),
          mediaType: brepMediaType,
          determinism: 'byte-exact',
        });
      }
      return { entries, omitted };
    },
    stats: () => ({
      entries: mirror.size,
      logicalBytes: residentBytes,
      encodedBytes: { status: 'unsupported' },
      evictions,
      omissions,
    }),
    clear: ({ generation }) => {
      // Fences the mirror synchronously; the worker clears at its next safe boundary.
      evictions += mirror.size;
      mirror.clear();
      session.background(
        session.request({
          method: 'compute.clear',
          params: { generation },
          schema: build123dComputeClearSchema,
          signal: control.signal,
        }),
      );
    },
  };
};
