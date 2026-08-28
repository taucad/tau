/**
 * Pins one {@link TransportPlugin} → many {@link RuntimeClient} lifetimes: each
 * client invokes {@link TransportPlugin.materialize} once during construction.
 *
 * Sequential clients sharing the same plugin reference reuse the wired options,
 * terminate always closes each materialised transport handle.
 *
 * @vitest-environment node
 */

import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createRuntimeClient, RuntimeConnectionError } from '#client/runtime-client.js';
import type { RuntimeClientOptionsWithTransport } from '#client/runtime-client.js';
import { fromMemoryFs } from '#filesystem/runtime-filesystem.js';
import { inProcessTransport } from '#transport/in-process-transport.js';
import { defineRuntime } from '#worker/runtime-definition.js';

describe('RuntimeClient TransportPlugin materialization', () => {
  it('materializes distinct transport handles across sequential clients that share one plugin reference', async () => {
    const mainPath = 'main.ts';
    const fs = fromMemoryFs({ [mainPath]: `export default () => true;\n` });
    const runtime = defineRuntime({});
    const plugin = inProcessTransport({ runtime, fileSystem: fs });

    expect(plugin.materialize()).not.toBe(plugin.materialize());

    const clientFirst = createRuntimeClient({
      transport: plugin,
    });

    await clientFirst.connect();

    clientFirst.terminate();

    const clientSecond = createRuntimeClient({
      transport: plugin,
    });

    await clientSecond.connect();
    clientSecond.terminate();
  });

  it('requires transport even when a runtime is supplied through an invalid cast', () => {
    const runtime = defineRuntime({});

    expect(() =>
      createRuntimeClient(
        // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- invalid runtime shape verifies the runtime guard.
        { runtime } as unknown as RuntimeClientOptionsWithTransport,
      ),
    ).toThrow('createRuntimeClient: `transport` is required.');
  });

  it('throws an actionable error when transport is omitted', () => {
    expect(() =>
      createRuntimeClient(
        // oxlint-disable-next-line ban-ts-comment -- invalid config verifies the runtime guard.
        // @ts-expect-error explicit transport is required.
        {},
      ),
    ).toThrow('createRuntimeClient: `transport` is required.');
  });

  it('passes validated runtime config through the in-process initialize path', async () => {
    const createRuntime = vi.fn((config: { readonly endpoint: string }) => {
      expect(config.endpoint).toBe('https://api.example.test');
      return {};
    });
    const runtime = defineRuntime({
      configSchema: z.object({ endpoint: z.url() }),
      createRuntime,
    });
    const fileSystem = fromMemoryFs();
    const client = createRuntimeClient({
      transport: inProcessTransport({ runtime, fileSystem }),
      config: async () => ({ endpoint: 'https://api.example.test' }),
    });

    await client.connect();

    expect(createRuntime).toHaveBeenCalledOnce();
    client.terminate();
  });

  it('rejects invalid runtime config during connect with a runtime-config cause', async () => {
    const createRuntime = vi.fn(() => ({}));
    const runtime = defineRuntime({
      configSchema: z.object({ endpoint: z.url() }),
      createRuntime,
    });
    const client = createRuntimeClient({
      transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs() }),
      config: { endpoint: 'not-a-url' },
    });

    const error = await client.connect().catch((error: unknown) => error);
    expect(error).toBeInstanceOf(RuntimeConnectionError);
    if (!(error instanceof RuntimeConnectionError)) {
      throw new Error('Expected RuntimeConnectionError');
    }
    expect(error.causeKind).toBe('runtime-config');
    expect(error.message).toContain('endpoint');
    expect(createRuntime).not.toHaveBeenCalled();
    client.terminate();
  });

  it('classifies rejected client config providers as runtime-config failures', async () => {
    const runtime = defineRuntime({
      configSchema: z.object({ endpoint: z.url() }),
      createRuntime: vi.fn(() => ({})),
    });
    const client = createRuntimeClient({
      transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs() }),
      config: async () => {
        throw new Error('config loader unavailable');
      },
    });

    const error = await client.connect().catch((error: unknown) => error);
    expect(error).toBeInstanceOf(RuntimeConnectionError);
    if (!(error instanceof RuntimeConnectionError)) {
      throw new Error('Expected RuntimeConnectionError');
    }
    expect(error.causeKind).toBe('runtime-config');
    expect(error.message).toBe('config loader unavailable');
    client.terminate();
  });
});
