/* eslint-disable @typescript-eslint/naming-convention -- provider wire keys use native snake_case. */
import type { Api } from '@earendil-works/pi-ai';
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
 * Build the `onPayload` step that turns document sentinels into provider blocks (D21).
 *
 * A standalone sentinel text block becomes the wire's native document block at the
 * same position, which keeps the prompt-cache prefix stable. A sentinel embedded in
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
    const visit = (value: unknown): unknown => {
      if (typeof value === 'string') {
        return rewriteText(value);
      }
      if (Array.isArray(value)) {
        for (const [index, item] of value.entries()) {
          value[index] = visit(item);
        }
        return value;
      }
      if (!zodUtility.isObject(value)) {
        return value;
      }
      const hash =
        textBlockTypes.has(value['type'] as string) && typeof value['text'] === 'string'
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
        value[key] = visit(item);
      }
      return value;
    };
    const result = visit(payload);
    return rewritten.any ? result : undefined;
  };
