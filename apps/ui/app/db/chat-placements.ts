/**
 * This device's placement for each chat, by project (cross-device chat handoff, XD2).
 *
 * A chat record keeps intent and never a device-relative host; a device's non-default choice for a chat — `origin` on
 * a daemon-served page, or a `loopback:` daemon — is its entry in the project's placements record
 * (`composerRecordPaths.placements`). Every reader and writer goes through here.
 */

import type { TauAgentHostId } from '@taucad/chat';

import { composerRecordPaths, createComposerRecordStore } from '#db/composer-record-store.js';
import type { ComposerRecordClient } from '#db/composer-record-store.js';

/**
 * Every chat's placement in one project. An absent, unreadable or failing record reads as none, so each chat takes
 * this device's default placement.
 *
 * @param client - The worker filesystem client.
 * @param projectId - The project.
 * @returns Each chat id → its placement.
 * @public
 */
export const readChatPlacements = async (
  client: ComposerRecordClient,
  projectId: string,
): Promise<Readonly<Record<string, TauAgentHostId>>> => {
  try {
    const result = await createComposerRecordStore(client, composerRecordPaths.placements(projectId)).read();
    return result.status === 'valid' ? (result.record.placements ?? {}) : {};
  } catch {
    return {};
  }
};

/** How long one read of a project's placements serves every chat that asks, in milliseconds. */
const placementReadReuse = 1000;

/*
 * Each project's placements as last read, by client, so one pass over a project's chats reads its record once. Every
 * write here forgets the project's read, whichever caller wrote: this module is the one write path.
 */
const placementReads = new WeakMap<
  ComposerRecordClient,
  Map<string, Readonly<{ at: number; read: Promise<Readonly<Record<string, TauAgentHostId>>> }>>
>();

/**
 * {@link readChatPlacements}, shared by every chat a pass asks about for `placementReadReuse`, and read again after
 * any placement write.
 *
 * @param client - The worker filesystem client.
 * @param projectId - The project.
 * @returns Each chat id → its placement.
 * @public
 */
export const readChatPlacementsShared = async (
  client: ComposerRecordClient,
  projectId: string,
): Promise<Readonly<Record<string, TauAgentHostId>>> => {
  let reads = placementReads.get(client);
  if (reads === undefined) {
    reads = new Map();
    placementReads.set(client, reads);
  }
  const cached = reads.get(projectId);
  if (cached !== undefined && Date.now() - cached.at < placementReadReuse) {
    return cached.read;
  }
  const read = readChatPlacements(client, projectId);
  reads.set(projectId, { at: Date.now(), read });
  return read;
};

/**
 * One chat's placement on this device, or `undefined` for this device's default.
 *
 * @param client - The worker filesystem client.
 * @param projectId - The chat's project.
 * @param chatId - The chat.
 * @returns Its placement.
 * @public
 */
export const readChatPlacement = async (
  client: ComposerRecordClient,
  projectId: string,
  chatId: string,
): Promise<TauAgentHostId | undefined> => {
  const placements = await readChatPlacements(client, projectId);
  return placements[chatId];
};

/**
 * Keep, or clear, one chat's placement on this device: one field-scoped read-modify-write of its project's
 * placements record, skipped when the record already says the same or there is no record to clear. Never throws.
 *
 * @param input - The client, the chat, and its placement (`undefined` clears it).
 * @returns `true` once the record holds the placement, `false` when it could not be written.
 * @public
 */
export const writeChatPlacement = async ({
  client,
  projectId,
  chatId,
  placement,
}: Readonly<{
  client: ComposerRecordClient;
  projectId: string;
  chatId: string;
  placement: TauAgentHostId | undefined;
}>): Promise<boolean> => {
  const store = createComposerRecordStore(client, composerRecordPaths.placements(projectId));
  /* Whatever this write does, the next read reads the record again. */
  placementReads.get(client)?.delete(projectId);
  try {
    const current = await store.read();
    if (current.status === 'valid' && current.record.placements?.[chatId] === placement) {
      return true;
    }
    /* Nothing to clear where no record exists: no empty record is written. */
    if (current.status === 'absent' && placement === undefined) {
      return true;
    }
    await store.patch({ placements: { [chatId]: placement ?? false } });
    placementReads.get(client)?.delete(projectId);
    return true;
  } catch {
    return false;
  }
};
