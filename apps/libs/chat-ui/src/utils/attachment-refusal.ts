/**
 * What the composer says when it cannot attach a file: one title and one sentence that names the format and the next
 * step (UX policy Rules 9 and 11). Intake refusals (before the draft) and storage-policy refusals (in the draft's image
 * step) share the vocabulary of `AttachmentRefusalReason`, so both read the same.
 *
 * @module
 */

import { attachmentImageLimits } from '@taucad/agent-host/wire';
import type { AttachmentRefusalReason } from '@taucad/agent-host/wire';
import type { ImageFormat } from '@taucad/utils/image-probe';

/** A refusal, as either intake or the storage policy reports it. */
export type AttachmentRefusal = {
  readonly reason: AttachmentRefusalReason;
  readonly format?: ImageFormat | 'pdf';
};

/** A refusal's toast. */
export type AttachmentRefusalCopy = {
  readonly title: string;
  readonly description: string;
};

/** The name a person knows each format by. */
const formatNames: Readonly<Record<ImageFormat | 'pdf', string>> = {
  jpeg: 'JPEG',
  png: 'PNG',
  webp: 'WebP',
  gif: 'GIF',
  avif: 'AVIF',
  heic: 'HEIC',
  bmp: 'BMP',
  tiff: 'TIFF',
  psd: 'Photoshop (PSD)',
  pdf: 'PDF',
};

const megabytes = (bytes: number): number => Math.round(bytes / (1024 * 1024));

const pixelsInMillions = Math.round(attachmentImageLimits.maxPixels / 1_000_000);

/**
 * The toast for a file the composer could not attach.
 *
 * @param refusal - Why it was refused, and the format its bytes hold when known.
 * @returns A title and a description that names the format and what to do next.
 */
export const attachmentRefusalCopy = ({ reason, format }: AttachmentRefusal): AttachmentRefusalCopy => {
  const name = format === undefined ? undefined : formatNames[format];
  const named = name === undefined ? '' : ` ${name}`;
  const title = format === undefined || format === 'pdf' ? "Couldn't attach this file" : "Couldn't attach this image";
  switch (reason) {
    case 'not-an-image': {
      return { title, description: 'Only images and PDFs can be attached.' };
    }
    case 'unsupported-format': {
      return {
        title,
        description: `${name === undefined ? "This image's format" : `${name} images`} can't be attached. Save it as JPEG or PNG and attach it again.`,
      };
    }
    case 'unreadable': {
      return { title, description: `This${named} file is damaged or incomplete, so it couldn't be read.` };
    }
    case 'animated': {
      return {
        title,
        description: "Animated WebP images can't be attached. Save one frame as PNG or JPEG and attach it again.",
      };
    }
    case 'too-many-pixels': {
      return {
        title,
        description: `This${named} image is larger than ${pixelsInMillions} megapixels. Make it smaller and attach it again.`,
      };
    }
    case 'too-large': {
      return format === 'pdf'
        ? {
            title,
            description: `PDFs over ${megabytes(attachmentImageLimits.maxDocumentBytes)} MB can't be attached.`,
          }
        : {
            title,
            description: `Files over ${megabytes(attachmentImageLimits.maxInputBytes)} MB can't be attached.`,
          };
    }
    case 'transcode-failed': {
      return {
        title,
        description: `Couldn't convert this${named} image. Try again, or save it as JPEG and attach that.`,
      };
    }
  }
};

/**
 * The error the draft's image step rejects with when the storage policy refuses an image. The draft machine emits it
 * as `imageResizeFailed`, and the toast subscriber shows its copy.
 */
export class AttachmentRefusedError extends Error {
  public override readonly name = 'AttachmentRefusedError';
  public readonly refusal: AttachmentRefusal;
  public readonly copy: AttachmentRefusalCopy;

  public constructor(refusal: AttachmentRefusal) {
    const copy = attachmentRefusalCopy(refusal);
    super(copy.description);
    this.refusal = refusal;
    this.copy = copy;
  }
}
