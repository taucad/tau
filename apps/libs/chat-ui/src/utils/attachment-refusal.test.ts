import { describe, expect, it } from 'vitest';
import { AttachmentRefusedError, attachmentRefusalCopy } from '#utils/attachment-refusal.js';

describe('attachmentRefusalCopy', () => {
  it.each([
    [{ reason: 'not-an-image' }, "Couldn't attach this file", 'Only images and PDFs can be attached.'],
    [
      { reason: 'unsupported-format', format: 'heic' },
      "Couldn't attach this image",
      "HEIC images can't be attached. Save it as JPEG or PNG and attach it again.",
    ],
    [
      { reason: 'unsupported-format', format: 'psd' },
      "Couldn't attach this image",
      "Photoshop (PSD) images can't be attached. Save it as JPEG or PNG and attach it again.",
    ],
    [
      { reason: 'animated', format: 'webp' },
      "Couldn't attach this image",
      "Animated WebP images can't be attached. Save one frame as PNG or JPEG and attach it again.",
    ],
    [
      { reason: 'too-many-pixels', format: 'png' },
      "Couldn't attach this image",
      'This PNG image is larger than 50 megapixels. Make it smaller and attach it again.',
    ],
    [{ reason: 'too-large' }, "Couldn't attach this file", "Files over 64 MB can't be attached."],
    [{ reason: 'too-large', format: 'pdf' }, "Couldn't attach this file", "PDFs over 16 MB can't be attached."],
    [
      { reason: 'unreadable', format: 'tiff' },
      "Couldn't attach this image",
      "This TIFF file is damaged or incomplete, so it couldn't be read.",
    ],
    [
      { reason: 'transcode-failed', format: 'avif' },
      "Couldn't attach this image",
      "Couldn't convert this AVIF image. Try again, or save it as JPEG and attach that.",
    ],
  ] as const)('should name the format and the next step for %o', (refusal, title, description) => {
    expect(attachmentRefusalCopy(refusal)).toEqual({ title, description });
  });

  it('should carry its copy on the error the image step rejects with', () => {
    const error = new AttachmentRefusedError({ reason: 'unsupported-format', format: 'bmp' });

    expect(error.message).toBe(error.copy.description);
    expect(error.refusal).toEqual({ reason: 'unsupported-format', format: 'bmp' });
  });
});
