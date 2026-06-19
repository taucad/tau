/**
 * `electronUtilityTransport` — bundled Topology C transport (callable plugin).
 *
 * Consume the plugin directly on `createRuntimeClient`:
 *
 * ```typescript
 * import { createRuntimeClient } from '#index.js';
 * import { electronUtilityTransport } from '#electron/renderer.js';
 * import type { AnyRuntimeDefinition } from '#worker/index.js';
 *
 * const { port1 } = new MessageChannel();
 * const client = createRuntimeClient<AnyRuntimeDefinition>({
 *   transport: electronUtilityTransport({ port: port1 }),
 * });
 * ```
 *
 * **Utility-process host**: use standalone {@link electronUtilityHost}; the
 * `MessagePortMain` arrives via `process.parentPort` after main bridges the
 * channel.
 *
 * Architecture and wire constraints match
 * {@link electronUtilityClient} / {@link electronUtilityHost}.
 *
 * @public
 */

import { defineRuntimeTransport } from '#transport/index.js';

import { electronUtilityClient } from '#electron/electron-utility-client.js';
import { electronUtilityHost } from '#electron/electron-utility-host.js';
import {
  electronUtilityClientOptionsSchema,
  electronUtilityHostOptionsSchema,
} from '#electron/electron-utility-transport.schemas.js';

const electronUtilityId = 'electron-utility';

/** Bundled Electron utility-process transport plugin. */
export const electronUtilityTransport = defineRuntimeTransport({
  id: electronUtilityId,
  clientOptionsSchema: electronUtilityClientOptionsSchema,
  hostOptionsSchema: electronUtilityHostOptionsSchema,
  client: electronUtilityClient,
  host: electronUtilityHost,
});
