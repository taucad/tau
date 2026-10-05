import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { expect, it } from 'vitest';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import { createRuntimeClient } from '@taucad/runtime/client';
import { createFileSystemBridgePort, fromFileSystemBridge } from '@taucad/runtime/filesystem';
import { defineRuntime } from '@taucad/runtime/worker';
import { webSocketTransport } from '@taucad/runtime/transport/websocket';
import type { PublishedPartAsset } from '@taucad/runtime/types';
import { writeGlb } from '@taucad/geometry-core';
import { sha256Bytes } from '@taucad/utils/hash';
import { serveHostRuntime } from '#runtime-host.js';
import { createHostToolRegistry } from '#agent-tools.js';

const encoder = new TextEncoder();
const asset = async (path: string, bytes: Uint8Array<ArrayBuffer>): Promise<PublishedPartAsset> => ({
  path,
  // SAFETY: SHA-256 hashing produces the canonical digest represented by this asset brand.
  digest: `sha256:${await sha256Bytes(bytes)}` as PublishedPartAsset['digest'],
  byteLength: bytes.byteLength,
});

it('admits and projects actual pinned GLB through the authenticated host and agent tools without source kernels', async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-host-pinned-'));
  const display = writeGlb({
    nodes: [
      {
        name: 'triangle',
        extras: { tauComponentId: 'triangle-face' },
        primitives: [{ material: {}, mode: 4, positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]) }],
      },
    ],
  });
  const glb = await asset('triangle.glb', display);
  const record = encoder.encode(
    JSON.stringify({
      schemaVersion: 1,
      variants: {
        default: { source: { entry: 'deleted.shape', files: { 'deleted.shape': `sha256:${'0'.repeat(64)}` } }, glb },
      },
    }),
  );
  const reference = await asset('part.json', record);
  const rootBytes = encoder.encode(
    JSON.stringify({
      schemaVersion: 1,
      generation: 1,
      parts: { triangle: { path: reference.path, digest: reference.digest } },
      occurrences: [
        {
          id: 'placed',
          part: 'triangle',
          variant: 'default',
          transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.01, 0, 0, 1],
        },
      ],
    }),
  );
  const root = await asset('scene.json', rootBytes);
  await Promise.all([
    writeFile(join(workspaceRoot, 'triangle.glb'), display),
    writeFile(join(workspaceRoot, 'part.json'), record),
    writeFile(join(workspaceRoot, 'scene.json'), rootBytes),
  ]);
  const provider = new NodeFsProvider(workspaceRoot, { policy: tauPathPolicy });
  const token = 'host-pin-control-token'.repeat(2);
  const host = await serveHostRuntime({ runtime: defineRuntime({ kernels: [] }), authorizationToken: token });
  const client = createRuntimeClient({
    transport: webSocketTransport({
      url: host.url,
      fileSystem: fromFileSystemBridge(() => createFileSystemBridgePort(provider)),
      createSocket: (url) => new WebSocket(url, { headers: { authorization: `Bearer ${token}` } }),
    }),
  });
  try {
    const admitted = await client.openAssembly({ root });
    expect(admitted.admitted.publication.occurrences[0]?.id).toBe('placed');
    expect(await admitted.admitted.readAsset(glb.digest)).toEqual(display);
    const output = await client.exportPublished({ format: 'glb', publishedAssembly: { root } });
    expect(output.success).toBe(true);
    if (!output.success) {
      throw new Error('Expected admitted display projection.');
    }
    expect(output.files[0].mimeType).toBe('model/gltf-binary');
    expect(output.files[0].bytes).not.toEqual(display);
    const registry = createHostToolRegistry({
      workspaceRoot,
      filesystem: () => provider,
      runtimeClient: async () => client,
    });
    const exported = await registry.invoke({
      toolCallId: 'pin-export',
      toolName: 'export_model',
      input: { targetFile: 'scene.json', to: 'glb' },
      signal: new AbortController().signal,
    });
    expect(exported.isError).toBe(false);
    const verdict = await registry.invoke({
      toolCallId: 'pin-verdict',
      toolName: 'evaluate_model',
      input: { targetFile: 'scene.json' },
      signal: new AbortController().signal,
    });
    expect(verdict.isError).toBe(false);
    const invalidDisplay = writeGlb({
      nodes: [{ primitives: [{ material: {}, mode: 4, positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]) }] }],
    });
    const invalidGlb = await asset('invalid.glb', invalidDisplay);
    const invalidRecord = encoder.encode(
      JSON.stringify({
        schemaVersion: 1,
        variants: {
          default: {
            source: { entry: 'deleted.shape', files: { 'deleted.shape': `sha256:${'0'.repeat(64)}` } },
            glb: invalidGlb,
          },
        },
      }),
    );
    const invalidReference = await asset('invalid-part.json', invalidRecord);
    const invalidRootBytes = encoder.encode(
      JSON.stringify({
        schemaVersion: 1,
        generation: 1,
        parts: { triangle: { path: invalidReference.path, digest: invalidReference.digest } },
        occurrences: admitted.admitted.publication.occurrences,
      }),
    );
    await Promise.all([
      writeFile(join(workspaceRoot, 'invalid.glb'), invalidDisplay),
      writeFile(join(workspaceRoot, 'invalid-part.json'), invalidRecord),
      writeFile(join(workspaceRoot, 'invalid-scene.json'), invalidRootBytes),
    ]);
    await expect(client.openAssembly({ root: await asset('invalid-scene.json', invalidRootBytes) })).rejects.toThrow(
      'tauComponentId',
    );
    expect(await provider.readFile('scene.json')).toEqual(rootBytes);
  } finally {
    client.terminate();
    await host.close();
    provider.dispose();
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}, 15_000);
