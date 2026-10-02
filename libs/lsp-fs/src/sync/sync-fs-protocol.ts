/**
 * Tier-2 synchronous filesystem bridge: {@link SharedArrayBuffer} slot layout + wire codes.
 * Mirrors the shape of VS Code's `@vscode/sync-api-common` ping-pong without pulling the dep.
 */

import { z } from 'zod';

/** Int32 indices for the request state vector (single in-flight sync op).
 *
 * @public
 */
export const slotIndex = { state: 0, requestId: 1, errorCode: 2, payloadLength: 3 } as const;

/** Length of the Int32 sync slot (`Int32Array(slotInt32Length)`).
 *
 * @public
 */
export const slotInt32Length = 4;

/** Slot state values (written with {@link Atomics.store} on index {@link slotIndex.state}).
 *
 * @public
 */
export const syncState = { idle: 0, pending: 1, ready: 2 } as const;

/** Result error class (written to {@link slotIndex.errorCode}).
 *
 * @public
 */
export const syncError = {
  ok: 0,
  notFound: 1,
  isDirectory: 2,
  tooLarge: 3,
  ioError: 4,
  aborted: 5,
  invalidRequest: 6,
  /** Path missing or wrong node kind for `fileExists` / `directoryExists` probes (vs. empty read payload). */
  absent: 7,
} as const;

/** Default bounded copy arena for a single cold read (4 MiB).
 *
 * @public
 */
export const defaultArenaBytes = 4 * 1024 * 1024;

/** @public */
export const syncFsOpSchema = z.enum(['readFile', 'fileExists', 'directoryExists', 'readdir', 'statMtimeVersion']);

/** Operations the FM sync server must implement.
 *
 * @public
 */
export type SyncFsOp = z.infer<typeof syncFsOpSchema>;

/** @public */
export type TauSyncFsInitMessage = Readonly<{
  type: 'tau:init';
  port: MessagePort;
  slotSab: SharedArrayBuffer;
  arenaSab: SharedArrayBuffer;
  filePoolBuffer?: SharedArrayBuffer;
  /** Worker absolute path prefix (same as {@link WorkspacePathResolver} root). */
  workspaceRootAbsolute: string;
}>;

/** @public */
export const tauSyncFsWireMessageSchema = z.object({
  tau: z.literal('sync-fs'),
  op: syncFsOpSchema,
  requestId: z.number(),
  path: z.string(),
});

/** @public */
export type TauSyncFsWireMessage = z.output<typeof tauSyncFsWireMessageSchema>;
