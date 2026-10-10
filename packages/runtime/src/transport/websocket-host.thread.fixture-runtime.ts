/**
 * Fixture runtime for the thread-per-connection tests: one kernel whose source
 * contents select its behaviour. It runs in a worker thread through
 * `websocket-host.thread.fixture.ts`, or in the host's own realm through the
 * in-realm `webSocketHost` worker factory.
 *
 * - `loop` spins forever, the hung model a terminable host must kill;
 * - `wait` writes `waiting.txt`, parks until the operation aborts, then writes `aborted.txt`;
 * - `compute` evaluates one value through the runtime's compute reuse service;
 * - anything else renders.
 *
 * Every rendering reports a token minted once per realm, the source it read and
 * the realm's `workerData`, so a test can tell which realm served it.
 *
 * @internal
 */

import { randomUUID } from 'node:crypto';
import { workerData } from 'node:worker_threads';
import type { CacheCodec } from '@taucad/cache-core';
import { defineKernelV2 as defineKernel } from '#types/runtime-kernel-v2.types.js';
import type { KernelServices } from '#types/runtime-kernel-v2.types.js';
import { defineRuntime } from '#worker/runtime-definition.js';

/** Minted once per realm. */
const realmToken = randomUUID();

/** What one fixture rendering reports. @internal */
export type ThreadFixtureReport = {
  readonly token: string;
  readonly source: string;
  readonly workerData: unknown;
  readonly compute?: { readonly source: 'cache' | 'computed'; readonly publication?: string };
};

const textCodec: CacheCodec<string> = {
  id: 'thread-fixture/text',
  version: '1',
  mediaType: 'text/plain',
  encode: ({ value }) => new TextEncoder().encode(value),
  decode: ({ bytes }) => new TextDecoder().decode(bytes),
};

const evaluateCompute = async (services: KernelServices): Promise<ThreadFixtureReport['compute']> => {
  if (services.compute.status !== 'on') {
    return undefined;
  }
  const result = await services.compute.evaluate({
    action: {
      schemaVersion: 1,
      namespace: 'thread-fixture',
      producer: { id: 'thread-fixture', version: '1', implementationAssets: [] },
      operation: 'echo',
      inputs: [],
      arguments: {},
      environment: {},
      codec: { id: textCodec.id, version: textCodec.version },
    },
    codec: textCodec,
    policy: 'best-effort',
    compute: async () => 'computed',
  });
  return result.source === 'cache'
    ? { source: 'cache' }
    : {
        source: 'computed',
        publication: result.publication.status === 'skipped' ? result.publication.reason : 'stored',
      };
};

const threadFixtureKernel = defineKernel({
  id: 'thread-fixture',
  extensions: ['fixture'],
  name: 'ThreadFixtureKernel',
  version: '1.0.0',
  cancellation: 'cooperative',
  views: { model: { title: 'Model', mimeType: 'model/gltf-binary' } },
  exports: {},
  async initialize() {
    return {};
  },
  async resolve({ entryPath }) {
    return { resolved: [entryPath], unresolved: [] };
  },
  async describe() {
    const schema = {
      $schema: 'https://json-structure.org/meta/extended/v0/#',
      $id: 'urn:taucad:test:thread-fixture-parameters',
      $uses: ['JSONSchemaUnits'],
      name: 'ThreadFixtureParameters',
      type: 'object',
    } as const;
    return { success: true, data: { parameters: { schema, defaults: {} } }, issues: [] };
  },
  async evaluate({ entryPath }, services) {
    const source = String(await services.filesystem.readFile(entryPath, 'utf8')).trim();
    if (source === 'loop') {
      // oxlint-disable-next-line no-constant-condition -- the hung model a terminable host must kill.
      while (true) {
        /* Never yields. */
      }
    }
    if (source === 'wait') {
      await services.filesystem.writeFile('waiting.txt', 'waiting');
      await new Promise<void>((resolve) => {
        services.signal.addEventListener('abort', () => {
          resolve();
        });
      });
      await services.filesystem.writeFile('aborted.txt', 'aborted');
      services.signal.throwIfAborted();
    }
    const compute = source === 'compute' ? await evaluateCompute(services) : undefined;
    return { handle: { source, compute }, views: ['model'] as const };
  },
  async render({ handle }) {
    const report: ThreadFixtureReport = {
      token: realmToken,
      source: handle.source,
      workerData: workerData ?? undefined,
      ...(handle.compute ? { compute: handle.compute } : {}),
    };
    return { content: new TextEncoder().encode(JSON.stringify(report)) };
  },
});

/** The fixture runtime both realms host. @internal */
export const threadFixtureRuntime = defineRuntime({ kernels: [threadFixtureKernel()] });
