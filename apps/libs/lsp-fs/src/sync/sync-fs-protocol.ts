/**
 * Tier-2 synchronous filesystem bridge: {@link SharedArrayBuffer} slot layout + wire codes.
 * Mirrors the shape of VS Code's `@vscode/sync-api-common` ping-pong without pulling the dep.
 */

import { z } from 'zod';
import {
  defaultSyncArenaBytes,
  syncChannelError,
  syncSlotIndex,
  syncSlotInt32Length,
  syncSlotState,
} from '@taucad/fs-bridge/sync';

/** Int32 indices for the request state vector. @public */
// oxlint-disable-next-line unicorn-js/prefer-export-from -- LSP keeps stable compatibility names.
export const slotIndex = syncSlotIndex;

/** Number of Int32 values in the shared request slot. @public */
// oxlint-disable-next-line unicorn-js/prefer-export-from -- LSP keeps stable compatibility names.
export const slotInt32Length = syncSlotInt32Length;

/** Shared request slot states. @public */
// oxlint-disable-next-line unicorn-js/prefer-export-from -- LSP keeps stable compatibility names.
export const syncState = syncSlotState;

/** Shared request result error codes. @public */
// oxlint-disable-next-line unicorn-js/prefer-export-from -- LSP keeps stable compatibility names.
export const syncError = syncChannelError;

/** Default LSP bounded-copy arena size. @public */
// oxlint-disable-next-line unicorn-js/prefer-export-from -- LSP keeps stable compatibility names.
export const defaultArenaBytes = defaultSyncArenaBytes;

/** @public */
export const syncFsOpSchema = z.enum([
  'readFile',
  'fileExists',
  'directoryExists',
  'listDirectories',
  'statMtimeVersion',
]);

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
