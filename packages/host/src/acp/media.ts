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
 * readable exactly as before (D14).
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import type { ExternalAgentLogEvent, JsonObject, JsonValue } from '@taucad/agent-host';
import { isRecord } from '@taucad/utils/schema';

/** The media a `file-ref` path can name, by the extension its path carries. */
const attachmentExtensions: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
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
 * @returns A transform from appended events to the same events with media moved.
 */
export const createAcpMediaStore = (
  workspaceRoot: string,
  chatId: string,
): ((events: readonly ExternalAgentLogEvent[]) => Promise<readonly ExternalAgentLogEvent[]>) => {
  const directory = join(workspaceRoot, '.tau', 'chats', chatId, 'attachments');
  /* The durable `file-ref` block (agent-host's `FileRefContentBlock`, validated by its strict schema). */
  const stored = new Map<string, JsonObject & { readonly path: string }>();

  const store = async (media: NonNullable<ReturnType<typeof inlineMediaOf>>): Promise<JsonValue | undefined> => {
    const known = stored.get(media.data);
    const extension = attachmentExtensions[media.mimeType];
    if (known !== undefined || extension === undefined) {
      return known;
    }
    const bytes = Buffer.from(media.data, 'base64');
    // Buffer skips what is not base64; a payload that does not round-trip is not bytes this row can name.
    if (bytes.length === 0 || bytes.toString('base64') !== media.data) {
      return undefined;
    }
    const hash = createHash('sha256').update(bytes).digest('hex');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, `${hash}.${extension}`), bytes, { flag: 'wx' }).catch((error: unknown) => {
      // Content-addressed: an existing file already holds these bytes.
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    });
    const filename = filenameOf(media.uri);
    const reference = {
      type: 'file-ref',
      path: `attachments/${hash}.${extension}`,
      mimeType: media.mimeType,
      byteLength: bytes.length,
      ...(filename === undefined ? {} : { filename }),
    };
    stored.set(media.data, reference);
    return reference;
  };

  /* Sequential on purpose: a tool-output row names its rendered content before
   * its raw output, so the image is stored before the string repeating it is met.
   * Typed over `unknown`, not `JsonValue`: a row is JSON only once serialized — in memory
   * its provider metadata holds optional (`undefined`) fields and pi's `Usage` interface. */
  const walk = async (value: unknown): Promise<unknown> => {
    if (typeof value === 'string') {
      return stored.get(value)?.path ?? value;
    }
    if (Array.isArray(value)) {
      const items: unknown[] = [];
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
      // The walk only swaps media blocks for `file-ref` blocks the schema accepts and keeps every other field.
      // oxlint-disable-next-line no-await-in-loop -- rows are recorded in order, and so is the dedupe.
      moved.push((await walk(event)) as ExternalAgentLogEvent);
    }
    return moved;
  };
};
