/**
 * The media Tau stores and sends as a chat attachment, and the one way to name it: from the bytes (I1).
 *
 * A declared type, a file name or an extension can say anything; Anthropic
 * refuses PNG bytes declared `image/jpeg`, and a chat that stored them could
 * not be resumed. Every host labels attachment bytes with
 * {@link sniffAttachmentMediaType}, on intake and again on every read.
 */

import { detectImageFormat, imageFormats, probeImage } from '@taucad/utils/image-probe';
import { isAttachmentMediaType } from '@taucad/utils/attachment-media';
import type { AttachmentMediaType } from '@taucad/utils/attachment-media';
import type { ImageFormat, ImageProbe } from '@taucad/utils/image-probe';

const pdfSignature = [0x25, 0x50, 0x44, 0x46, 0x2d] as const; // `%PDF-`

/**
 * The attachment media type the bytes themselves say they are.
 *
 * Reads only signatures and headers. An image whose header does not parse, a
 * format Tau does not store (HEIC, AVIF, TIFF and the like) and anything that
 * is neither an image nor a PDF give `undefined`; the caller decides whether
 * to refuse or to keep a recorded label.
 *
 * @param bytes - The decoded attachment payload, whatever type it was declared as.
 * @returns The stored media type the bytes hold, or `undefined`.
 * @public
 */
export const sniffAttachmentMediaType = (bytes: Uint8Array<ArrayBuffer>): AttachmentMediaType | undefined => {
  if (pdfSignature.every((byte, index) => bytes[index] === byte)) {
    return 'application/pdf';
  }
  const probe = probeImage(bytes);
  const mediaType = probe === undefined ? undefined : imageFormats[probe.format].mediaType;
  return mediaType !== undefined && isAttachmentMediaType(mediaType) ? mediaType : undefined;
};

const mebibyte = 1024 * 1024;

/**
 * The storage policy's limits. `maxEdge` and `maxBytes` are what a stored image may be without conversion and what a
 * conversion must produce; `maxInputBytes`, `maxPixels` and `maxDocumentBytes` refuse oversized input before any
 * decoder runs. The transcoder enforces the input limits again: these copies only fail fast.
 *
 * @public
 */
export const attachmentImageLimits = {
  /** Longest side, in pixels, of a stored image. */
  maxEdge: 1568,
  /** Bytes of a stored image. */
  maxBytes: mebibyte,
  /** Bytes of an image accepted for conversion. */
  maxInputBytes: 64 * mebibyte,
  /** Decoded pixels (width × height, from the header) of an image accepted for conversion. */
  maxPixels: 50_000_000,
  /** Bytes of a stored PDF. */
  maxDocumentBytes: 16 * mebibyte,
} as const;

/**
 * The colour transparent pixels are composited onto before a JPEG encode.
 *
 * @public
 */
export const attachmentImageBackground = '#FFFFFF';

/**
 * One conversion request, shaped after the runtime client's
 * `transcode({ from, to, files, options })`, so a host passes a thin wrapper over its own client.
 *
 * @public
 */
export type AttachmentTranscodeInput = {
  /** The probed source format, one the caller listed in `transcodeSources`. */
  readonly from: ImageFormat;
  /** The target format: always `jpeg`. */
  readonly to: 'jpeg';
  /** The one source file. */
  readonly files: readonly [
    { readonly name: string; readonly mimeType: string; readonly bytes: Uint8Array<ArrayBuffer> },
  ];
  /** The edge options the stored image must satisfy. */
  readonly options: {
    readonly maxEdge: number;
    readonly maxBytes: number;
    readonly background: string;
  };
};

/**
 * Converts one image and resolves to the converted bytes. Rejects on any failure; the caller's host discards its
 * runtime client after a rejection.
 *
 * @public
 */
export type AttachmentTranscodePort = (input: AttachmentTranscodeInput) => Promise<Uint8Array<ArrayBuffer>>;

/**
 * What to normalise, and what this host can convert.
 *
 * @public
 */
export type NormalizeImageAttachmentInput = {
  /** The attachment's bytes, whatever they were declared or named as. */
  readonly bytes: Uint8Array<ArrayBuffer>;
  /** Converts an image to JPEG through the host's runtime client. Without it nothing is converted. */
  readonly transcode?: AttachmentTranscodePort;
  /**
   * The source formats this host has an edge to `jpeg` for, as derived from its registered transcoders. A format
   * outside the list is refused by name, whether or not a port is given.
   */
  readonly transcodeSources?: readonly string[];
};

/**
 * Why an attachment was refused.
 *
 * - `not-an-image`: the bytes are neither a recognised image nor a PDF.
 * - `unreadable`: the signature names an image format but its header is truncated or malformed.
 * - `unsupported-format`: an image format this host cannot convert.
 * - `animated`: an animated WebP, which no decoder here reads.
 * - `too-large`: more bytes than {@link attachmentImageLimits} admits.
 * - `too-many-pixels`: a header larger than `maxPixels`.
 * - `transcode-failed`: the port rejected, or returned bytes that are not a stored image within the limits.
 *
 * @public
 */
export type AttachmentRefusalReason =
  | 'not-an-image'
  | 'unreadable'
  | 'unsupported-format'
  | 'animated'
  | 'too-large'
  | 'too-many-pixels'
  | 'transcode-failed';

/**
 * The outcome of {@link normalizeImageAttachment}: bytes to store under a media type read from them, or a refusal.
 *
 * @public
 */
export type NormalizedImageAttachment =
  | {
      readonly status: 'stored';
      /** The media type the stored bytes hold, read from them (I1). */
      readonly mediaType: AttachmentMediaType;
      /** The bytes to store: the input buffer itself when nothing was converted. */
      readonly bytes: Uint8Array<ArrayBuffer>;
      /** The probed format of the input, or `pdf`. */
      readonly format: ImageFormat | 'pdf';
      /** Whether the bytes came from the transcode port. */
      readonly converted: boolean;
    }
  | {
      readonly status: 'refused';
      readonly reason: AttachmentRefusalReason;
      /** The probed (or signature) format of the input, when one was recognised. */
      readonly format?: ImageFormat | 'pdf';
      /** A sentence that names the format and the limit, for logs and refusal copy. */
      readonly message: string;
      /** The port's rejection, for `transcode-failed`. */
      readonly cause?: unknown;
    };

type Refusal = Extract<NormalizedImageAttachment, { status: 'refused' }>;

const formatName = (format: ImageFormat | 'pdf'): string => (format === 'pdf' ? 'PDF' : format.toUpperCase());

const refuse = (
  reason: AttachmentRefusalReason,
  message: string,
  facts: { readonly format?: ImageFormat | 'pdf'; readonly cause?: unknown } = {},
): Refusal => ({
  status: 'refused',
  reason,
  message,
  ...(facts.format === undefined ? {} : { format: facts.format }),
  ...(facts.cause === undefined ? {} : { cause: facts.cause }),
});

/** Formats a provider reads as they are, when within the size limits. */
const passThroughFormats: ReadonlySet<ImageFormat> = new Set(['jpeg', 'png', 'webp']);

const fitsStored = (probe: ImageProbe, byteLength: number): boolean =>
  probe.width <= attachmentImageLimits.maxEdge &&
  probe.height <= attachmentImageLimits.maxEdge &&
  byteLength <= attachmentImageLimits.maxBytes;

const convert = async (
  probe: ImageProbe,
  bytes: Uint8Array<ArrayBuffer>,
  transcode: AttachmentTranscodePort,
): Promise<NormalizedImageAttachment> => {
  const { mediaType, extensions } = imageFormats[probe.format];
  let output: Uint8Array<ArrayBuffer>;
  try {
    output = await transcode({
      from: probe.format,
      to: 'jpeg',
      files: [{ name: `attachment.${extensions[0]}`, mimeType: mediaType, bytes }],
      options: {
        maxEdge: attachmentImageLimits.maxEdge,
        maxBytes: attachmentImageLimits.maxBytes,
        background: attachmentImageBackground,
      },
    });
  } catch (error) {
    return refuse('transcode-failed', `The ${formatName(probe.format)} image could not be converted to JPEG.`, {
      format: probe.format,
      cause: error,
    });
  }
  // The port's output is labelled and checked like any other bytes (I1).
  const converted = probeImage(output);
  if (
    converted === undefined ||
    !passThroughFormats.has(converted.format) ||
    converted.animated ||
    !fitsStored(converted, output.length)
  ) {
    return refuse(
      'transcode-failed',
      `Converting the ${formatName(probe.format)} image did not produce a JPEG within ${attachmentImageLimits.maxEdge} px and ${attachmentImageLimits.maxBytes} bytes.`,
      { format: probe.format },
    );
  }
  return {
    status: 'stored',
    mediaType: sniffAttachmentMediaType(output) ?? 'image/jpeg',
    bytes: output,
    format: probe.format,
    converted: true,
  };
};

/**
 * Decide what a host stores for an attachment's bytes: the one storage policy every host calls.
 *
 * - A PDF within 16 MiB is stored unchanged as a document.
 * - JPEG, PNG or static WebP with both sides within 1568 px and at most 1 MiB is stored unchanged (the same buffer),
 *   labelled from its bytes; the port is not called and no runtime starts (I6).
 * - Any other image whose format is in `transcodeSources` (an oversized canonical image, GIF, TIFF, AVIF and so on)
 *   is converted through the port to a JPEG within those limits, on a white matte.
 * - Everything else is refused with a reason and a message that names the format.
 *
 * Inputs over 64 MiB or whose header claims more than 50 megapixels are refused before the port is called; the
 * transcoder enforces both again (I5). Never throws: a port rejection becomes a `transcode-failed` refusal.
 *
 * @param input - The bytes, the host's transcode port and the formats it converts.
 * @returns The bytes to store and their media type, or a refusal.
 * @public
 * @example <caption>Normalise a dropped file through the host's runtime client</caption>
 * ```typescript
 * import { normalizeImageAttachment } from '@taucad/agent-host/wire';
 * import type { AttachmentTranscodePort } from '@taucad/agent-host/wire';
 *
 * declare const file: File;
 * declare const transcodeToJpeg: AttachmentTranscodePort;
 *
 * const outcome = await normalizeImageAttachment({
 *   bytes: new Uint8Array(await file.arrayBuffer()),
 *   transcode: transcodeToJpeg,
 *   transcodeSources: ['jpeg', 'png', 'webp', 'gif', 'avif', 'bmp', 'tiff'],
 * });
 * if (outcome.status === 'refused') {
 *   console.warn(outcome.message);
 * }
 * ```
 */
export const normalizeImageAttachment = async (
  input: NormalizeImageAttachmentInput,
): Promise<NormalizedImageAttachment> => {
  const { bytes } = input;
  if (sniffAttachmentMediaType(bytes) === 'application/pdf') {
    return bytes.length <= attachmentImageLimits.maxDocumentBytes
      ? { status: 'stored', mediaType: 'application/pdf', bytes, format: 'pdf', converted: false }
      : refuse('too-large', `The PDF is larger than ${attachmentImageLimits.maxDocumentBytes} bytes.`, {
          format: 'pdf',
        });
  }
  const signature = detectImageFormat(bytes);
  if (signature === undefined) {
    return refuse('not-an-image', 'The file is not an image or a PDF.');
  }
  if (bytes.length > attachmentImageLimits.maxInputBytes) {
    return refuse(
      'too-large',
      `The ${formatName(signature)} image is larger than ${attachmentImageLimits.maxInputBytes} bytes.`,
      { format: signature },
    );
  }
  const probe = probeImage(bytes);
  if (probe === undefined) {
    return refuse('unreadable', `The ${formatName(signature)} image's header could not be read.`, {
      format: signature,
    });
  }
  if (probe.width * probe.height > attachmentImageLimits.maxPixels) {
    return refuse(
      'too-many-pixels',
      `The ${formatName(probe.format)} image is ${probe.width}×${probe.height}, more than ${attachmentImageLimits.maxPixels} pixels.`,
      { format: probe.format },
    );
  }
  if (probe.format === 'webp' && probe.animated) {
    return refuse('animated', 'Animated WebP images are not supported.', { format: probe.format });
  }
  if (passThroughFormats.has(probe.format) && fitsStored(probe, bytes.length)) {
    const mediaType = sniffAttachmentMediaType(bytes);
    if (mediaType !== undefined) {
      return { status: 'stored', mediaType, bytes, format: probe.format, converted: false };
    }
  }
  if (input.transcode !== undefined && (input.transcodeSources ?? []).includes(probe.format)) {
    return convert(probe, bytes, input.transcode);
  }
  return passThroughFormats.has(probe.format)
    ? refuse(
        'too-large',
        `The ${formatName(probe.format)} image is larger than ${attachmentImageLimits.maxEdge} px or ${attachmentImageLimits.maxBytes} bytes, and this host cannot convert ${formatName(probe.format)} images.`,
        { format: probe.format },
      )
    : refuse(
        'unsupported-format',
        `${formatName(probe.format)} images are not supported here. Export the image as JPEG or PNG and attach it again.`,
        { format: probe.format },
      );
};
