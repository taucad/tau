// oxlint-disable-next-line eslint-plugin-import/no-named-as-default -- standard zod default import
import type z from 'zod';
import type { messageMetadataSchema, snapshotSchema } from '#schemas/metadata.schema.js';
import type { contextPayloadSchema, skillMetadataSchema } from '#schemas/context-payload.schema.js';

/**
 * Per-message metadata stamped onto `MyUIMessage` rows for UI display
 * (creation timestamp + lifecycle status). Per-turn agent config lives on
 * `body.agent`, not here.
 * @public
 */
export type MyMetadata = z.infer<typeof messageMetadataSchema>;

/**
 * Snapshot of the user's editor context at message submission time.
 * Provides the LLM with awareness of what the user is currently working on.
 * @public
 */
export type ChatSnapshot = z.infer<typeof snapshotSchema>;

/**
 * Client-assembled context payload carrying skills catalog and memory content.
 * Attached to message metadata so the API can inject into the system prompt without RPC.
 * @public
 */
export type ContextPayload = z.infer<typeof contextPayloadSchema>;

/** @public */
export type SkillMetadata = z.infer<typeof skillMetadataSchema>;
