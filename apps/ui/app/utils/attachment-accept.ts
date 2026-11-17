/**
 * The composer picker's `accept` list: what Tau stores, plus every image format the conversion runtime has an edge
 * to `jpeg` for, each by media type and extension (I2). Both halves come from their one source: `attachmentMedia`
 * and `deriveTranscodeSources`.
 *
 * @module
 */

import { attachmentKind, supportedAttachmentMediaTypes } from '@taucad/chat-ui/utils/attachment.utils';
import { imageFormats } from '@taucad/utils/image-probe';
import type { ImageFormat } from '@taucad/utils/image-probe';

/** What the picker may offer. */
export type AttachmentAcceptInput = {
  /** The selected model reads images. */
  readonly images: boolean;
  /** The selected model reads PDFs. */
  readonly documents: boolean;
  /** The host's convertible formats: `deriveTranscodeSources(runtime, 'jpeg')` over its conversion runtime. */
  readonly transcodeSources: readonly string[];
  /**
   * Whether this is iOS WebKit, which hands the page a JPEG for a HEIC photo when the picker does not ask for HEIC
   * (review AR8). HEIC is left out there even where it converts; only the picker changes, not the conversion.
   */
  readonly isIos: boolean;
};

const isImageFormat = (format: string): format is ImageFormat => Object.hasOwn(imageFormats, format);

/**
 * Sources the runtime names that the image probe files under another format, by the media type a picker knows them
 * by. HEIF bytes probe as `heic`, whose entry already offers `.heif`, but a picker filters `image/heif` separately.
 */
const sourceMediaTypes: ReadonlyMap<string, string> = new Map([['heif', 'image/heif']]);

/** HEIC and HEIF, which iOS WebKit's picker converts to JPEG unless `accept` asks for them (review AR8). */
const heifSources: ReadonlySet<string> = new Set(['heic', 'heif']);

/**
 * Build the picker's `accept` attribute.
 *
 * @param input - What the model reads, what the host converts, and whether this is iOS WebKit.
 * @returns A comma-separated list of media types and `.extensions`.
 */
export const attachmentAccept = ({ images, documents, transcodeSources, isIos }: AttachmentAcceptInput): string => {
  const accepted = new Set<string>(
    supportedAttachmentMediaTypes.filter((mediaType) => (attachmentKind(mediaType) === 'image' ? images : documents)),
  );
  if (images) {
    for (const format of transcodeSources) {
      if (isIos && heifSources.has(format)) {
        continue;
      }
      if (!isImageFormat(format)) {
        const sourceMediaType = sourceMediaTypes.get(format);
        if (sourceMediaType !== undefined) {
          accepted.add(sourceMediaType);
        }
        continue;
      }
      const { mediaType, extensions } = imageFormats[format];
      if (!accepted.has(mediaType)) {
        accepted.add(mediaType);
        for (const extension of extensions) {
          accepted.add(`.${extension}`);
        }
      }
    }
  }
  return [...accepted].join(',');
};
