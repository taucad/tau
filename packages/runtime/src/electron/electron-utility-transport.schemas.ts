/**
 * Zod schemas for {@link electronUtilityTransport} options.
 *
 * - `electronUtilityClientOptionsSchema` — supplied to {@link electronUtilityTransport}
 *   from the renderer; carries the renderer-received `MessagePort`
 *   that main shipped via `webContents.postMessage`.
 * Host options remain a standalone utility-process type.
 */

import type { RuntimeFileSystem } from '#filesystem/index.js';
import type { KernelRuntimeWorker } from '#worker-internals.js';
import { z } from 'zod';

/**
 * Renderer-side options. The `port` is the WHATWG `MessagePort` the
 * renderer received from main via `window.postMessage` relay (preload
 * forwards `event.ports[0]` from the IPC `runtime-port` channel).
 *
 * Validated as `z.custom<MessagePort>()` because MessagePort is not a
 * JSON-serializable shape; the schema exists only for type inference,
 * not runtime validation.
 */
export const electronUtilityClientOptionsSchema = z.object({
  port: z.custom<MessagePort>(
    (value) =>
      value !== null &&
      typeof value === 'object' &&
      typeof (value as { postMessage?: unknown }).postMessage === 'function',
    { message: 'port must be a MessagePort' },
  ),
});

/** Renderer-side validated options inferred from schema. */
export type ElectronUtilityTransportOptions = z.input<typeof electronUtilityClientOptionsSchema>;

/** Utility-process options owned by the standalone host factory. */
export type ElectronUtilityHostOptions = {
  readonly fileSystem: RuntimeFileSystem;
  readonly worker: KernelRuntimeWorker;
};
