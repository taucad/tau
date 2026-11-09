/* eslint-disable @typescript-eslint/naming-convention -- provider wire keys use native snake_case. */
import type { Api, Context, ImageContent, TextContent } from '@earendil-works/pi-ai';
import { util as zodUtility } from 'zod';
import { documentSentinel } from '#harness/session-record.js';
import { attachmentPathPattern, fileRefBlockSchema } from '#log/event-schema.js';
import type { JsonObject, JsonValue, ProviderMessage } from '#log/event-types.js';
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

/**
 * Images one request may carry: the Anthropic Messages API refuses a request with more than 100 image blocks, and a
 * chat of screenshots outgrows that long before it outgrows the byte budget (R1).
 *
 * @internal
 */
export const attachmentImageLimit = 100;

/** One attachment in request order: its base64 size and whether it is an image. @internal */
export type AttachmentMeasure = Readonly<{ size: number; image: boolean }>;

/**
 * Which attachments of a request are evicted (I1): a function of their sizes and kinds alone.
 *
 * Attachments are admitted oldest first. The first time the admitted total overflows the byte budget, or the admitted
 * images outnumber the image limit, the oldest admitted attachments are evicted until no more than
 * {@link attachmentBudgetFloor} of the budget, and of the limit, remains, so between two overflows no attachment
 * changes. Over the image limit alone, only images are evicted. The newest attachment is kept unless it alone exceeds
 * the byte budget.
 *
 * @internal
 * @param measures - The attachments, oldest first.
 * @param bounds - The characters of base64 and the images the request may carry; the defaults above when absent.
 * @returns The indexes into `measures` of the evicted attachments.
 */
export const planAttachmentEvictions = (
  measures: readonly AttachmentMeasure[],
  bounds: Readonly<{ budget?: number | undefined; imageLimit?: number | undefined }> = {},
): ReadonlySet<number> => {
  const budget = bounds.budget ?? attachmentBudgetCharacters;
  const imageLimit = bounds.imageLimit ?? attachmentImageLimit;
  const evicted = new Set<number>();
  const admitted: number[] = [];
  /* Held in one object: the eviction below changes them, which a loop condition on bare bindings cannot see. */
  const held = { total: 0, images: 0 };
  const floor = { total: budget * attachmentBudgetFloor, images: Math.floor(imageLimit * attachmentBudgetFloor) };
  const evict = (position: number): void => {
    const [index] = admitted.splice(position, 1) as [number];
    evicted.add(index);
    held.total -= measures[index]!.size;
    held.images -= measures[index]!.image ? 1 : 0;
  };
  for (const [index, measure] of measures.entries()) {
    admitted.push(index);
    held.total += measure.size;
    held.images += measure.image ? 1 : 0;
    if (held.total <= budget && held.images <= imageLimit) {
      continue;
    }
    while ((held.total > floor.total || held.images > floor.images) && admitted.length > 1) {
      /* Over the bytes, the oldest of any kind goes; over the images alone, the oldest image: a document is not
       * evicted to make room for captures. */
      const position =
        held.total > floor.total ? 0 : admitted.findIndex((admittedIndex) => measures[admittedIndex]!.image);
      if (position === -1 || position === admitted.length - 1) {
        break;
      }
      evict(position);
    }
    if (held.total > budget) {
      evict(0);
    }
  }
  return evicted;
};

/** The text an evicted attachment leaves in its place. */
const omittedAttachmentText = (name: string | undefined): string =>
  name === undefined ? '[attachment omitted]' : `[attachment omitted: ${name}]`;

/** The base64 characters `byteLength` bytes encode to: what the bytes weigh on the wire. */
const base64Length = (byteLength: number): number => Math.ceil(byteLength / 3) * 4;

const inlineDataUrl = /^data:[^;,]+;base64,(.*)$/u;

/** One attachment a durable row names: a content block, or an image of a screenshot result. */
type DurableAttachment = Readonly<{ kind: 'block' | 'image'; index: number; measure: AttachmentMeasure }>;

/**
 * The attachments one durable row names, in content order, each sized from the row alone: a `file-ref` by its
 * recorded `byteLength` (0 when the writer recorded none), a stored capture by its `byteLength`, an inline image or
 * capture by its base64 length.
 */
const durableAttachmentsOf = (message: ProviderMessage): DurableAttachment[] => {
  if (message.role === 'tool-input') {
    return [];
  }
  const { content } = message;
  if (Array.isArray(content)) {
    return content.flatMap((block: JsonValue, index): DurableAttachment[] => {
      if (!zodUtility.isObject(block)) {
        return [];
      }
      if (block['type'] === 'image' && typeof block['data'] === 'string') {
        return [{ kind: 'block', index, measure: { size: block['data'].length, image: true } }];
      }
      if (block['type'] !== 'file-ref') {
        return [];
      }
      const parsed = fileRefBlockSchema.safeParse(block);
      if (!parsed.success) {
        return [];
      }
      const size = parsed.data.byteLength === undefined ? 0 : base64Length(parsed.data.byteLength);
      return [{ kind: 'block', index, measure: { size, image: parsed.data.mimeType.startsWith('image/') } }];
    });
  }
  if (!zodUtility.isObject(content)) {
    return [];
  }
  const result: JsonObject = content;
  const { images } = result;
  if (!Array.isArray(images)) {
    return [];
  }
  return images.flatMap((image, index): DurableAttachment[] => {
    if (!zodUtility.isObject(image)) {
      return [];
    }
    const inline = typeof image['dataUrl'] === 'string' ? inlineDataUrl.exec(image['dataUrl']) : null;
    if (inline !== null) {
      return [{ kind: 'image', index, measure: { size: inline[1]!.length, image: true } }];
    }
    if (typeof image['path'] === 'string' && attachmentPathPattern.test(image['path'])) {
      const size = typeof image['byteLength'] === 'number' ? base64Length(image['byteLength']) : 0;
      return [{ kind: 'image', index, measure: { size, image: true } }];
    }
    return [];
  });
};

/** The attachments of one durable row a request leaves out: content block indexes and screenshot image indexes. */
export type AttachmentOmission = Readonly<{ blocks: ReadonlySet<number>; images: ReadonlySet<number> }>;

/**
 * Which attachments of a durable history every request leaves out (I1 across devices).
 *
 * Decided from the rows alone, by {@link planAttachmentEvictions} over the sizes they record, before any byte is read:
 * a device that lacks an attachment's bytes, or has not received them yet, evicts the same attachments as a device
 * that has them, so the two send the same request bytes apart from the attachment itself. The transport's own fit
 * ({@link fitAttachmentBudget}) stays behind it as the bound on what is actually sent.
 *
 * @internal
 * @param history - The durable history, oldest first.
 * @param bounds - The characters of base64 and the images a request may carry; the defaults above when absent.
 * @returns The omissions, keyed by message id; a row with none is absent.
 */
export const planAttachmentOmissions = (
  history: readonly ProviderMessage[],
  bounds: Readonly<{ budget?: number | undefined; imageLimit?: number | undefined }> = {},
): ReadonlyMap<string, AttachmentOmission> => {
  const named = history.flatMap((message) =>
    durableAttachmentsOf(message).map((attachment) => ({ messageId: message.id, ...attachment })),
  );
  const evicted = planAttachmentEvictions(
    named.map((attachment) => attachment.measure),
    bounds,
  );
  const omissions = new Map<string, { blocks: Set<number>; images: Set<number> }>();
  for (const index of evicted) {
    const attachment = named[index]!;
    const omission = omissions.get(attachment.messageId) ?? { blocks: new Set<number>(), images: new Set<number>() };
    (attachment.kind === 'block' ? omission.blocks : omission.images).add(attachment.index);
    omissions.set(attachment.messageId, omission);
  }
  return omissions;
};

/**
 * A durable row with its evicted attachments left out, as a transient copy: an evicted content block becomes the
 * text `[attachment omitted: <name>]` (or `[attachment omitted]`), and an evicted screenshot image is dropped.
 *
 * @internal
 * @param message - The durable row; it is not mutated.
 * @param omission - What {@link planAttachmentOmissions} decided for it.
 * @returns The copy.
 */
export const omitAttachments = (message: ProviderMessage, omission: AttachmentOmission): ProviderMessage => {
  if (message.role === 'tool-input') {
    return message;
  }
  const { content } = message;
  if (Array.isArray(content)) {
    const blocks = content.map((block: JsonValue, index): JsonValue => {
      if (!omission.blocks.has(index) || !zodUtility.isObject(block)) {
        return block;
      }
      const name = typeof block['filename'] === 'string' ? block['filename'] : undefined;
      return { type: 'text', text: omittedAttachmentText(name) };
    });
    return { ...message, content: blocks };
  }
  if (!zodUtility.isObject(content)) {
    return message;
  }
  const result: JsonObject = content;
  const { images } = result;
  if (!Array.isArray(images)) {
    return message;
  }
  return { ...message, content: { ...result, images: images.filter((_, index) => !omission.images.has(index)) } };
};

type AttachmentSlot = Readonly<{
  messageIndex: number;
  blockIndex: number;
  size: number;
  image: boolean;
  name: string | undefined;
}>;

/**
 * Keep the attachments a request can carry and name the rest (R1), evicting in batches (I1).
 *
 * Durable history names every attachment a chat ever held, so a long chat can outgrow any request bound. Each image
 * block, and each document sentinel with a side-table entry, is measured in request order and
 * {@link planAttachmentEvictions} decides which are evicted: the oldest, in one batch, the first time the total
 * overflows the byte budget or the images outnumber the limit. An evicted attachment becomes the text
 * `[attachment omitted: <name>]` (or `[attachment omitted]`). The decision is a function of the history alone, so a
 * replay or another device sends the same bytes, and between two overflows no attachment changes: the model loses
 * sight of old bytes the way it loses old turns to compaction, a batch at a time, instead of one rewrite per new
 * attachment.
 *
 * @internal
 * @param context - The request's pi context; it is not mutated.
 * @param documents - The request's side table, keyed by lowercase SHA-256 hex.
 * @param bounds - The characters of base64 and the images the request may carry; the defaults above when absent.
 * @returns The fitted context and how many attachments were omitted.
 */
export const fitAttachmentBudget = (
  context: Context,
  documents: ReadonlyMap<string, MaterializedDocument> | undefined,
  bounds: Readonly<{ budget?: number | undefined; imageLimit?: number | undefined }> = {},
): { readonly context: Context; readonly omitted: number } => {
  const slots: AttachmentSlot[] = [];
  for (const [messageIndex, message] of context.messages.entries()) {
    if ((message.role !== 'user' && message.role !== 'toolResult') || typeof message.content === 'string') {
      continue;
    }
    for (const [blockIndex, block] of message.content.entries()) {
      if (block.type === 'image') {
        slots.push({ messageIndex, blockIndex, size: block.data.length, image: true, name: undefined });
        continue;
      }
      const hash = standaloneSentinel.exec(block.text)?.[1];
      const document = hash === undefined ? undefined : documents?.get(hash);
      if (document !== undefined) {
        slots.push({ messageIndex, blockIndex, size: document.data.length, image: false, name: document.filename });
      }
    }
  }
  const evictedIndexes = planAttachmentEvictions(slots, bounds);
  if (evictedIndexes.size === 0) {
    return { context, omitted: 0 };
  }
  const evicted = new Set([...evictedIndexes].map((index) => slots[index]!));
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
        return { type: 'text', text: omittedAttachmentText(slot.name) };
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
