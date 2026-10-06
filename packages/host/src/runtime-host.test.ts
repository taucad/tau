import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { expect, it } from 'vitest';
import { NodeFsChannel, NodeFsProviderClient } from '@taucad/filesystem/backend';
import { NodeFsAuthorityHost, NodeFsProvider, serveNodeFsProvider } from '@taucad/filesystem/backend/node';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import { createRuntimeClient } from '@taucad/runtime/client';
import { createFileSystemBridgePort, fromFileSystemBridge } from '@taucad/runtime/filesystem';
import { createRuntimeWorker, defineRuntime } from '@taucad/runtime/worker';
import { webSocketTransport } from '@taucad/runtime/transport/websocket';
import type { PublishedPartAsset, PublishedPartOccurrence } from '@taucad/runtime/types';
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
  await Promise.all([
    writeFile(join(workspaceRoot, 'triangle.glb'), display),
    writeFile(join(workspaceRoot, 'part.json'), record),
  ]);
  const provider = new NodeFsProvider(workspaceRoot, { policy: tauPathPolicy });
  const authorityRoot = await mkdtemp(join(tmpdir(), 'tau-host-authority-'));
  const authority = new NodeFsAuthorityHost({
    authorityDirectory: () => authorityRoot,
    authorityIdentity: () => workspaceRoot,
  });
  const { port1, port2 } = new MessageChannel();
  const stopAuthority = serveNodeFsProvider(port2, {
    policy: tauPathPolicy,
    allowRoot: (candidate) => candidate === workspaceRoot,
    authority,
  });
  const channel = new NodeFsChannel(port1);
  const publicationProvider = new NodeFsProviderClient(channel, workspaceRoot);
  const publisher = createRuntimeWorker({
    runtime: defineRuntime({ kernels: [] }),
    admitAssemblyDisplay: async () => undefined,
  });
  const publisherConnection = createFileSystemBridgePort(publicationProvider);
  const publishFixture = async ({
    authoredPath,
    publicationPath,
    part,
    occurrences,
  }: {
    authoredPath: string;
    publicationPath: string;
    part: PublishedPartAsset;
    occurrences: readonly PublishedPartOccurrence[];
  }) => {
    await writeFile(
      join(workspaceRoot, authoredPath),
      encoder.encode(
        JSON.stringify({
          schemaVersion: 1,
          parts: { triangle: { publishedPart: { path: part.path, digest: part.digest } } },
          occurrences,
        }),
      ),
    );
    const receipt = await publisher.publishAuthoredAssemblyRoot({
      authoredPath,
      publicationPath,
      directory: '',
    });
    if (receipt.outcome.status !== 'published') {
      throw new Error(`Fixture publication failed: ${receipt.outcome.status}`);
    }
    const rootBytes = await provider.readFile(publicationPath);
    await provider.unlink(authoredPath);
    return { root: receipt.outcome.root, rootBytes };
  };
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
    await publisher.initialize({
      callbacks: { onLog: () => undefined },
      transferables: { fileSystemPort: publisherConnection.port },
      options: {},
    });
    const { root, rootBytes } = await publishFixture({
      authoredPath: 'authored.json',
      publicationPath: 'scene.json',
      part: reference,
      occurrences: [
        {
          id: 'placed',
          part: 'triangle',
          variant: 'default',
          transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.01, 0, 0, 1],
        },
      ],
    });
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
    await Promise.all([
      writeFile(join(workspaceRoot, 'invalid.glb'), invalidDisplay),
      writeFile(join(workspaceRoot, 'invalid-part.json'), invalidRecord),
    ]);
    const invalid = await publishFixture({
      authoredPath: 'invalid-authored.json',
      publicationPath: 'invalid-scene.json',
      part: invalidReference,
      occurrences: admitted.admitted.publication.occurrences,
    });
    await expect(client.openAssembly({ root: invalid.root })).rejects.toThrow('tauComponentId');
    expect(await provider.readFile('scene.json')).toEqual(rootBytes);
  } finally {
    await publisher.cleanup();
    publisherConnection.dispose();
    channel.close();
    await stopAuthority();
    port2.close();
    client.terminate();
    await host.close();
    provider.dispose();
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(authorityRoot, { recursive: true, force: true });
  }
}, 15_000);
