/**
 * `createRuntimeHost` — symmetric host-side entry point that mirrors
 * {@link createRuntimeClient}.
 *
 * Consumers compose a pre-built {@link RuntimeTransportHost} (returned
 * `electronUtilityHost({ fileSystem })`) and the runtime drives `open()` /
 * `close()` lifecycle. The runtime core stays wire-agnostic.
 */

import type { RuntimeHostConfig, RuntimeHostHandle } from '#host/runtime-host.types.js';

/**
 * Create a runtime host bound to the supplied transport.
 *
 * @param config - {@link RuntimeHostConfig}.
 * @returns A {@link RuntimeHostHandle} with `dispose()` for symmetric
 *   teardown.
 *
 * @public
 *
 * @example <caption>Dispose a runtime host created from a prebuilt transport</caption>
 * ```typescript
 * import { createRuntimeHost } from './create-runtime-host.js';
 * import type { RuntimeTransportHost } from '@taucad/runtime/transport';
 * import type { RuntimeProtocol } from '@taucad/runtime/types';
 *
 * declare const transport: RuntimeTransportHost<
 *   RuntimeProtocol,
 *   Readonly<Record<string, never>>,
 *   string
 * >;
 *
 * const host = createRuntimeHost({ transport });
 * host.dispose();
 * ```
 */
export function createRuntimeHost(config: RuntimeHostConfig): RuntimeHostHandle {
  const { transport } = config;
  let disposed = false;
  const { id } = transport;

  const startPromise = startTransport(transport);

  return {
    id,
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      void disposeTransport(startPromise, transport);
    },
  };
}

const startTransport = async (
  transport: RuntimeHostConfig['transport'],
): Promise<{ readonly ready: Awaited<ReturnType<RuntimeHostConfig['transport']['open']>> }> => {
  try {
    const ready = await transport.open();
    return { ready };
  } catch (error) {
    throw new Error(
      `createRuntimeHost: transport '${transport.id}' failed to start: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error instanceof Error ? error : undefined },
    );
  }
};

const disposeTransport = async (
  startPromise: ReturnType<typeof startTransport>,
  transport: RuntimeHostConfig['transport'],
): Promise<void> => {
  try {
    const { ready } = await startPromise;
    try {
      ready.channel.dispose();
    } catch {
      /* Best-effort */
    }
    try {
      await transport.close();
    } catch {
      /* Best-effort */
    }
  } catch {
    /* Startup failed — nothing to dispose */
  }
};
