/* eslint-disable @typescript-eslint/naming-convention -- provider wire keys use native snake_case. */
import type { Api, Context, ImageContent, TextContent } from '@earendil-works/pi-ai';
import { util as zodUtility } from 'zod';
import { documentSentinel } from '#harness/session-record.js';
import type { MaterializedDocument } from '#waist/ports.js';

/** The pi codecs Tau's gateway speaks. @internal */
export type DocumentWire = Extract<Api, 'anthropic-messages' | 'openai-completions' | 'openai-responses'>;

// Built from the one sentinel format rather than restated; neither half holds a
// regular-expression metacharacter.
const [sentinelOpening, sentinelClosing] = documentSentinel('\0').split('\0') as [string, string];
const standaloneSentinel = new RegExp(`^${sentinelOpening}([\\da-f]{64})${sentinelClosing}$`, 'u');
const embeddedSentinel = new RegExp(`${sentinelOpening}([\\da-f]{64})${sentinelClosing}`, 'gu');
const textBlockTypes = new Set(['text', 'input_text']);
// W11c admits exactly this media type and a 1–256 character name.
const pdfMediaType = 'application/pdf';
const maximumNameLength = 256;

const nameOf = (hash: string, document: MaterializedDocument): string =>
  document.filename !== undefined && document.filename.length <= maximumNameLength ? document.filename : `${hash}.pdf`;

const nativeBlock = ({
  wire,
  hash,
  document,
  cacheControl,
}: {
  readonly wire: DocumentWire;
  readonly hash: string;
  readonly document: MaterializedDocument;
  readonly cacheControl: unknown;
}): Record<string, unknown> => {
  if (document.mediaType !== pdfMediaType) {
    throw new TypeError(`${document.mediaType} documents are not supported by the Tau model gateway.`);
  }
  const name = nameOf(hash, document);
  const fileData = `data:${pdfMediaType};base64,${document.data}`;
  if (wire === 'anthropic-messages') {
    return {
      type: 'document',
      title: name,
      source: { type: 'base64', media_type: pdfMediaType, data: document.data },
      // Pi marks the last user block as the rolling cache breakpoint; it stays there (P33).
      ...(cacheControl === undefined ? {} : { cache_control: cacheControl }),
    };
  }
  if (wire === 'openai-responses') {
    return { type: 'input_file', filename: name, file_data: fileData };
  }
  return { type: 'file', file: { filename: name, file_data: fileData } };
};

/**
 * Base64 characters of attachment bytes one request may carry (R1). One maximal
 * PDF (16 MiB, 22,369,624 characters) fits with room for its turn inside the
 * gateway's 32 MB request bound.
 *
 * @internal
 */
export const attachmentBudgetCharacters = 24_000_000;

/**
 * Once attachments overflow the budget, the oldest are evicted until this share of the budget remains, in one batch.
 *
 * @internal
 */
export const attachmentBudgetFloor = 0.7;

type AttachmentSlot = Readonly<{ messageIndex: number; blockIndex: number; size: number; name: string | undefined }>;

/**
 * Keep the attachments a request can carry and name the rest (R1), evicting in batches (I1).
 *
 * Durable history names every attachment a chat ever held, so a long chat can outgrow any request bound. Attachments
 * are replayed oldest first: each image block, and each document sentinel with a side-table entry, is admitted, and
 * the first time the total overflows the budget the oldest admitted attachments are evicted until no more than
 * {@link attachmentBudgetFloor} of the budget remains. An evicted attachment becomes the text
 * `[attachment omitted: <name>]` (or `[attachment omitted]`). The decision is a function of the history alone, so a
 * replay or another device sends the same bytes, and between two overflows no attachment changes: the model loses
 * sight of old bytes the way it loses old turns to compaction, a batch at a time, instead of one rewrite per new
 * attachment. The newest attachment is kept unless it alone exceeds the budget.
 *
 * @internal
 * @param context - The request's pi context; it is not mutated.
 * @param documents - The request's side table, keyed by lowercase SHA-256 hex.
 * @param budget - The characters of base64 the request may carry.
 * @returns The fitted context and how many attachments were omitted.
 */
export const fitAttachmentBudget = (
  context: Context,
  documents: ReadonlyMap<string, MaterializedDocument> | undefined,
  budget: number = attachmentBudgetCharacters,
): { readonly context: Context; readonly omitted: number } => {
  const slots: AttachmentSlot[] = [];
  for (const [messageIndex, message] of context.messages.entries()) {
    if ((message.role !== 'user' && message.role !== 'toolResult') || typeof message.content === 'string') {
      continue;
    }
    for (const [blockIndex, block] of message.content.entries()) {
      if (block.type === 'image') {
        slots.push({ messageIndex, blockIndex, size: block.data.length, name: undefined });
        continue;
      }
      const hash = standaloneSentinel.exec(block.text)?.[1];
      const document = hash === undefined ? undefined : documents?.get(hash);
      if (document !== undefined) {
        slots.push({ messageIndex, blockIndex, size: document.data.length, name: document.filename });
      }
    }
  }
  const evicted = new Set<AttachmentSlot>();
  const admitted: AttachmentSlot[] = [];
  let total = 0;
  const floor = budget * attachmentBudgetFloor;
  for (const slot of slots) {
    admitted.push(slot);
    total += slot.size;
    if (total <= budget) {
      continue;
    }
    while (total > floor && admitted.length > 1) {
      const oldest = admitted.shift()!;
      evicted.add(oldest);
      total -= oldest.size;
    }
    if (total > budget) {
      evicted.add(admitted.shift()!);
      total = 0;
    }
  }
  if (evicted.size === 0) {
    return { context, omitted: 0 };
  }
  const byMessage = Map.groupBy(evicted, (slot) => slot.messageIndex);
  const messages = context.messages.map((message, messageIndex) => {
    const evictions = byMessage.get(messageIndex);
    if (
      evictions === undefined ||
      (message.role !== 'user' && message.role !== 'toolResult') ||
      typeof message.content === 'string'
    ) {
      return message;
    }
    const content = (message.content as ReadonlyArray<TextContent | ImageContent>).map(
      (block, blockIndex): TextContent | ImageContent => {
        const slot = evictions.find((candidate) => candidate.blockIndex === blockIndex);
        if (slot === undefined) {
          return block;
        }
        return {
          type: 'text',
          text: slot.name === undefined ? '[attachment omitted]' : `[attachment omitted: ${slot.name}]`,
        };
      },
    );
    return message.role === 'user' ? { ...message, content } : { ...message, content };
  });
  return { context: { ...context, messages }, omitted: evicted.size };
};

/**
 * Build the `onPayload` step that turns document sentinels into provider blocks (D21).
 *
 * A standalone sentinel text block in a user message becomes the wire's native
 * document block at the same position, which keeps the prompt-cache prefix stable. A sentinel embedded in
 * larger text — pi's compaction summariser serialises history to text — becomes
 * the neutral marker `[attached document: <name>]`, or `[attached document]` when
 * the side table does not name it (P32). The payload is rewritten in place.
 *
 * A request without a usable name falls back to `<hash>.pdf`, because the OpenAI
 * wires require one and the gateway bounds it at 256 characters.
 *
 * @internal
 * @param documents - The request's side table, keyed by lowercase SHA-256 hex.
 * @param wire - The pi codec that built the payload.
 * @returns A pi `onPayload` step: the payload when it changed, otherwise `undefined`.
 * @throws TypeError When a standalone sentinel has no side-table entry, a document
 * is not a PDF, or any sentinel sequence would remain in the payload.
 */
export const rewriteDocuments =
  (documents: ReadonlyMap<string, MaterializedDocument> | undefined, wire: DocumentWire) =>
  (payload: unknown): unknown => {
    // A holder, not a `let`: the visitors below set it, which narrowing cannot see.
    const rewritten = { any: false };
    const rewriteText = (text: string): string => {
      if (!text.includes(sentinelOpening)) {
        return text;
      }
      const replaced = text.replaceAll(embeddedSentinel, (_match, hash: string) => {
        const name = documents?.get(hash)?.filename;
        return name === undefined ? '[attached document]' : `[attached document: ${name}]`;
      });
      if (replaced.includes(sentinelOpening)) {
        throw new TypeError('Refusing the model request: a document sentinel would reach the provider.');
      }
      rewritten.any = true;
      return replaced;
    };
    // `role` is the enclosing message's: only a user's own block becomes a document; any other
    // role (a model echoing the sentinel) gets the neutral marker, which every wire accepts (G7).
    const visit = (value: unknown, role: unknown): unknown => {
      if (typeof value === 'string') {
        return rewriteText(value);
      }
      if (Array.isArray(value)) {
        for (const [index, item] of value.entries()) {
          value[index] = visit(item, role);
        }
        return value;
      }
      if (!zodUtility.isObject(value)) {
        return value;
      }
      const ownRole = typeof value['role'] === 'string' ? value['role'] : role;
      const hash =
        ownRole === 'user' && textBlockTypes.has(value['type'] as string) && typeof value['text'] === 'string'
          ? standaloneSentinel.exec(value['text'])?.[1]
          : undefined;
      if (hash !== undefined) {
        const document = documents?.get(hash);
        if (document === undefined) {
          throw new TypeError(
            `Refusing the model request: sentinel ${hash} names a document this request does not carry.`,
          );
        }
        rewritten.any = true;
        return nativeBlock({ wire, hash, document, cacheControl: value['cache_control'] });
      }
      for (const [key, item] of Object.entries(value)) {
        value[key] = visit(item, ownRole);
      }
      return value;
    };
    const result = visit(payload, undefined);
    return rewritten.any ? result : undefined;
  };
