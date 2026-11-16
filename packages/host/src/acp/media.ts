/**
 * Agent media, moved out of the durable log and into the chat's attachments.
 *
 * ACP carries media inline: an image an agent generates, reads or captures
 * arrives as base64 on an assistant block, on a tool call's rendered content
 * and — for Codex's image generation — again as the call's raw output. Recorded
 * verbatim, one 1.6 MB render became 6.5 MB of log across three rows, each
 * re-sent to every client. The bytes belong where a user's own attachment
 * already lives: content-addressed under `.tau/chats/<chatId>/attachments`, one
 * file per payload, with every row naming it by a `file-ref`.
 *
 * Only what the attachment vocabulary can name is moved (the `file-ref` path
 * pattern's image and PDF types); audio and any other media stays inline,
 * readable exactly as before (D14). A host with a runtime transcoder first
 * converts an image the storage policy would (`normalizeImageAttachment`), so
 * an AVIF block is stored as JPEG rather than left inline.
 */

import { createHash } from 'node:crypto';
import { basename, join } from 'node:path';

import type { ExternalAgentLogEvent, JsonObject, JsonValue } from '@taucad/agent-host';
import { createNodeAttachmentReader } from '@taucad/agent-host/node';
import {
  attachmentExtensionOf,
  isAttachmentMediaType,
  normalizeImageAttachment,
  sniffAttachmentMediaType,
} from '@taucad/agent-host/wire';
import type { AttachmentTranscodePort } from '@taucad/agent-host/wire';
import { isRecord } from '@taucad/utils/schema';

import type { HostRuntimeClient } from '#agent-tools.js';

/** Milliseconds one conversion may take before it is abandoned (I5: the transcoder's 30 s limit). */
const transcodeTimeout = 30_000;

/**
 * The extension a chat attachment of this media type is written with: a stored type's from `attachmentMedia` (I2),
 * or `json` for a GeoSpec report, which only a writer saves and no `file-ref` names.
 *
 * @param mimeType - The media type the bytes are stored under.
 * @returns The extension, or `undefined` for a type no chat attachment may hold.
 */
const extensionOf = (mimeType: string): string | undefined => {
  if (isAttachmentMediaType(mimeType)) {
    return attachmentExtensionOf(mimeType);
  }
  return mimeType === 'application/json' ? 'json' : undefined;
};

/**
 * The media type to store bytes under: what the bytes are, or the declared type when no probe recognises them.
 *
 * @param bytes - The decoded payload.
 * @param declared - The media type the agent declared.
 * @returns The stored media type.
 */
const labelOf = (bytes: Uint8Array<ArrayBuffer>, declared: string): string =>
  sniffAttachmentMediaType(bytes) ?? declared;

/**
 * How a host converts agent media its chats cannot store as sent: a port over its runtime client's `transcode`, and
 * the formats that runtime's registered transcoders convert to `jpeg` (`deriveTranscodeSources(runtime, 'jpeg')`).
 *
 * @public
 */
export type AgentMediaTranscoding = {
  readonly transcode: AttachmentTranscodePort;
  readonly transcodeSources: readonly string[];
};

/**
 * Resolves the host's {@link AgentMediaTranscoding} on first need, or `undefined` when its runtime converts nothing.
 * Called only for an image the storage policy will not store unchanged, so canonical media never starts a runtime (I6).
 *
 * @public
 */
export type AgentMediaTranscoder = () => Promise<AgentMediaTranscoding | undefined>;

/**
 * A {@link AttachmentTranscodePort} over a host runtime client's `transcode` (I3), abandoned after 30 seconds.
 *
 * @param client - The runtime client whose registered transcoders convert the image.
 * @returns The port: resolves to the converted bytes, rejects on any failure.
 */
export const runtimeTranscodePort =
  (client: Pick<HostRuntimeClient, 'transcode'>): AttachmentTranscodePort =>
  async (input) => {
    const result = await client.transcode({
      from: input.from,
      to: input.to,
      files: input.files.map((file) => ({ name: file.name, mimeType: file.mimeType, bytes: file.bytes })),
      options: input.options,
      signal: AbortSignal.timeout(transcodeTimeout),
    });
    if (!result.success) {
      throw new Error(result.issues.map(({ message }) => message).join('; ') || 'The image could not be converted.');
    }
    const [file] = result.data;
    if (file === undefined) {
      throw new Error('The image conversion returned no file.');
    }
    return new Uint8Array(file.bytes);
  };

/**
 * The bytes to store for one decoded payload, and the media type they hold.
 *
 * Canonical media is stored unchanged without a runtime (I6). An image the storage policy would convert is
 * converted through the host's transcoder when it has one (`normalizeImageAttachment`, I3). Anything else, and any
 * image the policy refuses even with a port, keeps today's rule: labelled from its bytes (I1), stored when the
 * attachment vocabulary names it.
 *
 * @param bytes - The decoded payload.
 * @param declared - The media type the agent declared.
 * @param transcoder - The host's transcoder, if it has one.
 * @returns The bytes to store and their media type.
 */
const canonicalOf = async (
  bytes: Uint8Array<ArrayBuffer>,
  declared: string,
  transcoder: AgentMediaTranscoder | undefined,
): Promise<{ readonly bytes: Uint8Array<ArrayBuffer>; readonly mimeType: string; readonly converted: boolean }> => {
  const unchanged = { bytes, mimeType: labelOf(bytes, declared), converted: false };
  if (transcoder === undefined) {
    return unchanged;
  }
  const local = await normalizeImageAttachment({ bytes });
  if (local.status === 'stored') {
    return { bytes: local.bytes, mimeType: local.mediaType, converted: false };
  }
  if (local.format === 'pdf' || (local.reason !== 'unsupported-format' && local.reason !== 'too-large')) {
    return unchanged;
  }
  // A runtime that cannot start leaves the media as it was sent, never fails the append.
  const transcoding = await transcoder().catch(() => undefined);
  if (transcoding === undefined) {
    return unchanged;
  }
  const outcome = await normalizeImageAttachment({ bytes, ...transcoding });
  return outcome.status === 'stored'
    ? { bytes: outcome.bytes, mimeType: outcome.mediaType, converted: outcome.converted }
    : unchanged;
};

/** One stored attachment: its `attachments/<sha256>.<ext>` reference, the real file and its digest. */
type SavedChatAttachment = {
  readonly path: string;
  readonly absolutePath: string;
  readonly byteLength: number;
  readonly sha256: string;
};

/**
 * Write bytes to a chat's attachments under the extension of the media type they hold.
 *
 * @param input - The workspace root whose `.tau/chats` holds the chat, the chat, the bytes and the media type they hold.
 * @returns The stored attachment.
 */
const writeChatAttachment = async ({
  workspaceRoot,
  chatId,
  bytes,
  mimeType,
}: {
  readonly workspaceRoot: string;
  readonly chatId: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly mimeType: string;
}): Promise<SavedChatAttachment> => {
  if (!/^[\w-]+$/u.test(chatId)) {
    throw new Error('Chat attachment has an invalid chat id.');
  }
  const extension = extensionOf(mimeType);
  if (extension === undefined) {
    throw new Error(`Chat attachment media type ${mimeType} is unsupported.`);
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const path = `attachments/${sha256}.${extension}`;
  const absolutePath = join(workspaceRoot, '.tau', 'chats', chatId, path);
  // The chat store's own writer: one atomic, content-addressed Node writer for every chat attachment (D-UI-04).
  await createNodeAttachmentReader(workspaceRoot).write!(chatId, path, bytes);
  return { path, absolutePath, byteLength: bytes.length, sha256 };
};

/**
 * Decode canonical base64, or `undefined` for an empty or non-canonical payload.
 *
 * @param data - The base64 payload.
 * @returns The bytes.
 */
const decodeBase64 = (data: string): Uint8Array<ArrayBuffer> | undefined => {
  const bytes = Buffer.from(data, 'base64');
  return bytes.length === 0 || bytes.toString('base64') !== data ? undefined : new Uint8Array(bytes);
};

/**
 * Persist one attachment for a chat and return both the transcript and local paths.
 *
 * The bytes are published through the Node chat store's attachment writer, which the
 * agent host's own screenshot captures use too. Nothing is converted: the MCP endpoint files Tau's own PNG and WebP
 * screenshots, whose contract admits only those types, and GeoSpec reports.
 * @param input - Workspace, chat, MIME type and canonical base64 bytes.
 * @returns Content-addressed chat and local file references.
 */
export const saveChatAttachment = async (input: {
  readonly workspaceRoot: string;
  readonly chatId: string;
  readonly data: string;
  readonly mimeType: string;
}): Promise<SavedChatAttachment> => {
  const decoded = decodeBase64(input.data);
  if (decoded === undefined) {
    throw new Error('Chat attachment contains invalid base64 bytes.');
  }
  // The file is named for what the bytes are, not what the agent declared (I1).
  return writeChatAttachment({
    workspaceRoot: input.workspaceRoot,
    chatId: input.chatId,
    bytes: decoded,
    mimeType: labelOf(decoded, input.mimeType),
  });
};

/**
 * The inline payload an ACP or MCP block carries, if it is one this store moves.
 *
 * ACP and MCP spell an image the same way (`{type:'image', data, mimeType}`),
 * so one shape covers an assistant block, a tool call's content and an MCP
 * result nested in raw output. An embedded `resource` carries its bytes as `blob`.
 *
 * @param value - One JSON object from a durable row.
 * @returns Its base64 payload, media type and URI, or `undefined` for anything else.
 */
const inlineMediaOf = (
  value: Readonly<Record<string, unknown>>,
): { readonly data: string; readonly mimeType: string; readonly uri?: string } | undefined => {
  if (value['type'] === 'image' && typeof value['data'] === 'string' && typeof value['mimeType'] === 'string') {
    return {
      data: value['data'],
      mimeType: value['mimeType'],
      ...(typeof value['uri'] === 'string' ? { uri: value['uri'] } : {}),
    };
  }
  const resource = value['type'] === 'resource' && isRecord(value['resource']) ? value['resource'] : undefined;
  if (resource && typeof resource['blob'] === 'string' && typeof resource['mimeType'] === 'string') {
    return {
      data: resource['blob'],
      mimeType: resource['mimeType'],
      ...(typeof resource['uri'] === 'string' ? { uri: resource['uri'] } : {}),
    };
  }
  return undefined;
};

/**
 * The file name a URI's last path segment gives, for the reference's download name.
 *
 * @param uri - The URI the agent attached to the media, if any.
 * @returns The last path segment, or `undefined` when there is none.
 */
const filenameOf = (uri: string | undefined): string | undefined => {
  const name = uri === undefined ? '' : basename(uri.split(/[?#]/u)[0] ?? '');
  return name === '' ? undefined : name;
};

/**
 * One chat's media writer, applied to every durable append of an ACP turn.
 *
 * A payload seen once is remembered, so the envelope replacements that repeat
 * it cost a map lookup rather than another hash, and a raw-output string equal
 * to a moved payload becomes that attachment's path rather than a third copy.
 *
 * @param workspaceRoot - Absolute root whose `.tau/chats` holds the chat.
 * @param chatId - The chat the turn belongs to.
 * @param transcoder - The host's transcoder. With one, an image the storage policy converts (an AVIF, a GIF, an
 * oversized JPEG) is stored as the JPEG it converts to; without one, media is stored as sent, as before.
 * @returns A transform from appended events to the same events with media moved.
 */
export const createAcpMediaStore = (
  workspaceRoot: string,
  chatId: string,
  transcoder?: AgentMediaTranscoder,
): ((events: readonly ExternalAgentLogEvent[]) => Promise<readonly ExternalAgentLogEvent[]>) => {
  /* The durable `file-ref` block (agent-host's `FileRefContentBlock`, validated by its strict schema). */
  const stored = new Map<string, JsonObject & { readonly path: string }>();

  const store = async (media: NonNullable<ReturnType<typeof inlineMediaOf>>): Promise<JsonValue | undefined> => {
    const known = stored.get(media.data);
    if (known !== undefined) {
      return known;
    }
    const decoded = decodeBase64(media.data);
    if (decoded === undefined) {
      return undefined;
    }
    const { bytes, mimeType, converted } = await canonicalOf(decoded, media.mimeType, transcoder);
    if (!isAttachmentMediaType(mimeType)) {
      return undefined;
    }
    const saved = await writeChatAttachment({ workspaceRoot, chatId, bytes, mimeType });
    const named = filenameOf(media.uri);
    // A converted image downloads under the extension of what it now is.
    const filename =
      named === undefined || !converted
        ? named
        : `${named.replace(/\.[^.]*$/u, '')}.${attachmentExtensionOf(mimeType)}`;
    const reference = {
      type: 'file-ref',
      path: saved.path,
      mimeType,
      byteLength: saved.byteLength,
      ...(filename === undefined ? {} : { filename }),
    };
    stored.set(media.data, reference);
    return reference;
  };

  /* Sequential on purpose: a tool-output row names its rendered content before
   * its raw output, so the image is stored before the string repeating it is met.
   * `unknown`, not `JsonValue`: a log event's optional fields admit `undefined`,
   * and the walk keeps every value it does not replace exactly as it found it. */
  const walk = async (value: unknown): Promise<unknown> => {
    if (typeof value === 'string') {
      return stored.get(value)?.path ?? value;
    }
    if (Array.isArray(value)) {
      const items: unknown[] = [];
      // `Array.isArray` narrows to `any[]`; read the elements as `unknown`.
      for (const item of value as readonly unknown[]) {
        // oxlint-disable-next-line no-await-in-loop -- order is the dedupe (see above).
        items.push(await walk(item));
      }
      return items;
    }
    if (!isRecord(value)) {
      return value;
    }
    const media = inlineMediaOf(value);
    const reference = media === undefined ? undefined : await store(media);
    if (reference !== undefined) {
      return reference;
    }
    const entries: Array<[string, unknown]> = [];
    for (const [key, item] of Object.entries(value)) {
      // oxlint-disable-next-line no-await-in-loop -- order is the dedupe (see above).
      entries.push([key, await walk(item)]);
    }
    return Object.fromEntries(entries);
  };

  return async (events) => {
    const moved: ExternalAgentLogEvent[] = [];
    for (const event of events) {
      // The walk only swaps media blocks for the `file-ref` blocks the log accepts in their place.
      // oxlint-disable-next-line no-await-in-loop -- rows are recorded in order, and so is the dedupe.
      moved.push((await walk(event)) as ExternalAgentLogEvent);
    }
    return moved;
  };
};
