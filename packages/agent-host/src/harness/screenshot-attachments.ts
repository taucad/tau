/**
 * Screenshot captures as chat attachments (D-UI-04).
 *
 * A `screenshot` result arrives with each view as a base64 `data:` URL: one
 * lossless 1600² view is megabytes, and the durable row is copied into the
 * worker log, its replay cache, the page's projection and the session
 * recorder. The bytes are written once beside the chat as
 * `attachments/<sha256>.<ext>` and the row keeps only that reference; a model
 * request restores the `data:` URL transiently, as a `file-ref` is restored.
 *
 * @module
 */
import { base64ToUint8Array } from 'uint8array-extras';
import { util as zodUtility } from 'zod';
import { encodeBase64 } from '#harness/base64.js';
import { attachmentPathPattern } from '#log/event-schema.js';
import type { JsonObject, JsonValue, ProviderMessage } from '#log/event-types.js';

const dataUrlPattern = /^data:(image\/(?:png|webp));base64,(.+)$/u;

const extensionOf: Readonly<Record<string, string>> = { 'image/png': 'png', 'image/webp': 'webp' };

const sha256Hex = async (bytes: Uint8Array<ArrayBuffer>): Promise<string> =>
  Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');

type ToolOutputMessage = Extract<ProviderMessage, { role: 'tool-output' }>;

type Screenshot = {
  readonly message: ToolOutputMessage;
  readonly result: JsonObject;
  readonly images: readonly JsonValue[];
};

/** The screenshot result a tool-output row carries, when it carries one. */
const screenshotOf = (message: ProviderMessage): Screenshot | undefined => {
  if (message.role !== 'tool-output' || !zodUtility.isObject(message.content) || Array.isArray(message.content)) {
    return undefined;
  }
  const result: JsonObject = message.content;
  const { images } = result;
  return Array.isArray(images) ? { message, result, images } : undefined;
};

/** A capture this host stored: an attachment path and no file of its own for an external agent to open. */
const isStoredImage = (image: JsonValue): image is JsonObject & { readonly path: string; readonly mimeType: string } =>
  zodUtility.isObject(image) &&
  typeof image['path'] === 'string' &&
  attachmentPathPattern.test(image['path']) &&
  typeof image['mimeType'] === 'string' &&
  image['dataUrl'] === undefined &&
  image['absolutePath'] === undefined;

/**
 * Whether a row holds a stored capture a model request must restore.
 *
 * @param message - A durable provider message.
 * @returns `true` for a screenshot result naming at least one stored capture.
 * @internal
 */
export const hasStoredScreenshot = (message: ProviderMessage): boolean =>
  screenshotOf(message)?.images.some((image) => isStoredImage(image)) ?? false;

const inlineCapture = (image: JsonValue): RegExpExecArray | undefined =>
  zodUtility.isObject(image) && typeof image['dataUrl'] === 'string'
    ? (dataUrlPattern.exec(image['dataUrl']) ?? undefined)
    : undefined;

/**
 * Write each inline capture of a screenshot result once and keep only its reference.
 *
 * A row with no inline capture is returned as it is. A capture whose write
 * fails stays inline: the row is never left naming bytes this device lacks.
 *
 * @param message - The row about to be appended.
 * @param write - Writes one attachment path of the owning chat.
 * @returns The row as it is to be stored.
 * @internal
 */
export const storeScreenshotImages = async (
  message: ProviderMessage,
  write: (path: string, bytes: Uint8Array<ArrayBuffer>) => Promise<void>,
): Promise<ProviderMessage> => {
  const screenshot = screenshotOf(message);
  if (screenshot === undefined || !screenshot.images.some((image) => inlineCapture(image) !== undefined)) {
    return message;
  }
  const images = await Promise.all(
    screenshot.images.map(async (image): Promise<JsonValue> => {
      const match = inlineCapture(image);
      if (match === undefined || !zodUtility.isObject(image)) {
        return image;
      }
      const mimeType = match[1]!;
      const bytes = base64ToUint8Array(match[2]!);
      const sha256 = await sha256Hex(bytes);
      const path = `attachments/${sha256}.${extensionOf[mimeType]!}`;
      try {
        await write(path, bytes);
      } catch (error) {
        console.warn(`Tau could not store a screenshot as ${path}; it stays inline.`, error);
        return image;
      }
      const { dataUrl: _inline, ...facts } = image;
      return { ...facts, path, mimeType, byteLength: bytes.byteLength, sha256 };
    }),
  );
  return { ...screenshot.message, content: { ...screenshot.result, images } };
};

/**
 * Restore each stored capture of a screenshot result as the `data:` URL a model reads.
 *
 * Returns a transient copy. A capture whose bytes are absent or unreadable is
 * omitted and its path reported in `absent`; it never throws.
 *
 * @param message - A row for which {@link hasStoredScreenshot} holds.
 * @param read - Reads one attachment path of the owning chat; may reject.
 * @param absent - Collects the paths whose bytes could not be read.
 * @returns The restored copy.
 * @internal
 */
export const restoreScreenshotImages = async (
  message: ProviderMessage,
  read: (path: string) => Promise<Uint8Array<ArrayBuffer> | undefined>,
  absent: string[],
): Promise<ProviderMessage> => {
  const screenshot = screenshotOf(message);
  if (screenshot === undefined) {
    return message;
  }
  const images = await Promise.all(
    screenshot.images.map(async (image): Promise<JsonValue[]> => {
      if (!isStoredImage(image)) {
        return [image];
      }
      const { path, mimeType, byteLength: _length, sha256: _hash, ...facts } = image;
      const bytes = await read(path).catch(() => undefined);
      if (bytes === undefined) {
        absent.push(path);
        return [];
      }
      return [{ ...facts, dataUrl: `data:${mimeType};base64,${encodeBase64(bytes)}` }];
    }),
  );
  return { ...screenshot.message, content: { ...screenshot.result, images: images.flat() } };
};
