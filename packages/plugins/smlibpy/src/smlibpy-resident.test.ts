// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { PythonRequest, PythonSession } from '@taucad/python-kernel-core';
import type { ComputeGeneration, ComputeStoreEntry } from '@taucad/runtime/kernel';
import { actionDigest, contentDigest } from '@taucad/cache-core';
import type { ComputeAction } from '@taucad/cache-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSmlibpyResidentBinding } from '#smlibpy-resident.js';
import { smlibpyComputeDescriptorLimit } from '#smlibpy.protocol.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const digest = actionDigest({ value: `sha256:${'a'.repeat(64)}` });
const other = actionDigest({ value: `sha256:${'b'.repeat(64)}` });
const truncated = actionDigest({ value: `sha256:${'d'.repeat(64)}` });
const content = contentDigest({ value: `sha256:${'c'.repeat(64)}` });
const action = {
  schemaVersion: 1,
  namespace: 'smlibpy.operation.v1',
  producer: { id: 'test', version: '1', implementationAssets: [digest] },
  operation: 'Solid.make_box',
  inputs: [{ kind: 'scene', role: 'source', digest: `sha256:${'c'.repeat(64)}` }],
  arguments: { length: 1 },
  environment: {},
  codec: { id: 'smlibpy.smb', version: '1' },
} as unknown as ComputeAction;
const entry = {
  action,
  actionDigest: digest,
  contentDigest: content,
  mediaType: 'application/vnd.smlib.smb',
  bytes: new Uint8Array([1, 2, 3]),
  determinism: 'byte-exact',
} satisfies ComputeStoreEntry;

/**
 * A session whose worker adopts every bundle slice that does not start with zero and answers each export from a
 * three-byte bundle; the artifacts it writes are real files in a private directory.
 * @returns The session double, its spies and its artifact directory.
 */
const fakeSession = () => {
  const artifacts = mkdtempSync(join(tmpdir(), 'tau-smlibpy-resident-test-'));
  roots.push(artifacts);
  const background: Array<Promise<unknown>> = [];
  const respond = async ({ method, params }: PythonRequest<unknown>): Promise<unknown> => {
    if (method === 'compute.import') {
      const { bundle, descriptors } = params as {
        bundle: { artifactPath: string };
        descriptors: Array<{ actionDigest: string; byteLength: number }>;
      };
      // The worker consumes the bundle, as `compute.import` does.
      const payload = readFileSync(bundle.artifactPath);
      rmSync(bundle.artifactPath);
      const imported: string[] = [];
      const omitted: string[] = [];
      let offset = 0;
      for (const descriptor of descriptors) {
        (payload[offset] === 0 ? omitted : imported).push(descriptor.actionDigest);
        offset += descriptor.byteLength;
      }
      return { imported, omitted };
    }
    if (method === 'compute.export') {
      const [first, ...rest] = (params as { digests: string[] }).digests;
      if (first === other) {
        return { descriptors: [], omitted: [first, ...rest] };
      }
      return {
        descriptors: [{ action, actionDigest: first, contentDigest: content, byteLength: first === truncated ? 4 : 3 }],
        omitted: rest,
        bundle: { artifactPath: join(artifacts, 'export.bin'), byteLength: 3 },
      };
    }
    return { generation: (params as { generation: number }).generation };
  };
  const request = vi.fn(async (call: PythonRequest<unknown>) => call.schema.parse(await respond(call)));
  const session = {
    request,
    async writeArtifact(payload: Uint8Array<ArrayBuffer>, suffix: string) {
      const artifactPath = join(artifacts, `bundle.${suffix}`);
      writeFileSync(artifactPath, payload);
      return { artifactPath, byteLength: payload.byteLength };
    },
    readArtifact: vi.fn(async () => new Uint8Array([7, 8, 9])),
    background: (operation: Promise<unknown>) => {
      background.push(operation);
    },
  } as unknown as PythonSession;
  return { session, request, artifacts, background };
};

const { signal } = new AbortController();

describe('createSmlibpyResidentBinding', () => {
  it('mirrors the worker lineage cache through the bounded bundle protocol', async () => {
    const { session, request, artifacts, background } = fakeSession();
    const binding = createSmlibpyResidentBinding(session);

    expect(binding.contains({ digest })).toBe(false);
    expect(await binding.importEntries({ entries: [], signal })).toEqual({ imported: [], omitted: [] });
    expect(await binding.exportEntries({ digests: [], signal })).toEqual({ entries: [], omitted: [] });
    expect(request).not.toHaveBeenCalled();

    const imported = await binding.importEntries({
      entries: [entry, { ...entry, actionDigest: other, bytes: new Uint8Array([0, 0, 0]) }],
      signal,
    });
    expect(imported).toEqual({ imported: [digest], omitted: [other] });
    expect(binding.contains({ digest })).toBe(true);
    expect(binding.contains({ digest: other })).toBe(false);
    // The worker consumed the bundle, so the binding's own removal finds nothing and is not an error.
    expect(existsSync(join(artifacts, 'bundle.compute-bundle.bin'))).toBe(false);

    const exported = await binding.exportEntries({ digests: [digest, other], signal });
    expect(exported).toEqual({
      entries: [
        {
          action,
          bytes: new Uint8Array([7, 8, 9]),
          mediaType: 'application/vnd.smlib.smb',
          determinism: 'equivalent',
        },
      ],
      omitted: [other],
    });
    expect(await binding.exportEntries({ digests: [other], signal })).toEqual({ entries: [], omitted: [other] });
    expect(await binding.exportEntries({ digests: [truncated], signal })).toEqual({
      entries: [],
      omitted: [truncated],
    });

    binding.track([other]);
    binding.observeResidentBytes(4096);
    expect(binding.stats()).toEqual({
      entries: 2,
      logicalBytes: 4096,
      encodedBytes: { status: 'unsupported' },
      evictions: 0,
      omissions: 1,
    });
    const overflow = await binding.importEntries({
      entries: [
        ...Array.from({ length: smlibpyComputeDescriptorLimit }, () => entry),
        { ...entry, actionDigest: other },
      ],
      signal,
    });
    expect(overflow.imported).toHaveLength(smlibpyComputeDescriptorLimit);
    expect(overflow.omitted).toEqual([other]);
    expect(binding.stats().omissions).toBe(2);

    binding.clear({ generation: 3 as unknown as ComputeGeneration });
    expect(binding.contains({ digest })).toBe(false);
    expect(binding.stats().evictions).toBe(2);
    await expect(Promise.all(background)).resolves.toEqual([{ generation: 3 }]);
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({ method: 'compute.clear', params: { generation: 3 } }),
    );
  });

  it('removes an unconsumed compute import bundle when the request fails', async () => {
    const { session, request, artifacts } = fakeSession();
    request.mockRejectedValueOnce(new Error('import failed'));
    const binding = createSmlibpyResidentBinding(session);

    await expect(binding.importEntries({ entries: [entry], signal })).rejects.toThrow('import failed');

    expect(existsSync(join(artifacts, 'bundle.compute-bundle.bin'))).toBe(false);
  });
});
