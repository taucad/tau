import { describe, expect, it } from 'vitest';
import {
  attachmentCapBytes,
  attachmentFileName,
  attachmentKind,
  attachmentReferenceOf,
  attachmentUrl,
  isAttachmentUrl,
  isSupportedAttachmentMediaType,
  supportedAttachmentMediaTypes,
} from '#utils/attachment.utils.js';
import type { Attachment } from '#utils/attachment.utils.js';

const hash = 'a'.repeat(64);

const attachment = (mediaType: string): Attachment => ({ hash, mediaType, byteLength: 8 });

describe('attachment identity', () => {
  it('should declare exactly the five media types this wave stores', () => {
    expect([...supportedAttachmentMediaTypes].toSorted()).toEqual([
      'application/pdf',
      'image/gif',
      'image/jpeg',
      'image/png',
      'image/webp',
    ]);
  });

  it.each([
    ['image/jpeg', 'image', 'jpg'],
    ['image/png', 'image', 'png'],
    ['image/webp', 'image', 'webp'],
    ['image/gif', 'image', 'gif'],
    ['application/pdf', 'document', 'pdf'],
  ])('should map %s to kind %s and extension %s', (mediaType, kind, extension) => {
    expect(attachmentKind(mediaType)).toBe(kind);
    expect(attachmentFileName(attachment(mediaType))).toBe(`${hash}.${extension}`);
    expect(attachmentUrl(attachment(mediaType))).toBe(`attachments/${hash}.${extension}`);
    expect(isAttachmentUrl(attachmentUrl(attachment(mediaType)))).toBe(true);
    expect(isSupportedAttachmentMediaType(mediaType)).toBe(true);
  });

  it('should reject an unsupported media type rather than inventing an extension', () => {
    expect(isSupportedAttachmentMediaType('image/avif')).toBe(false);
    expect(() => attachmentFileName(attachment('image/avif'))).toThrow('Unsupported attachment type: image/avif');
  });

  it.each([
    ['a hash one character short', `attachments/${'a'.repeat(63)}.png`],
    ['uppercase hex', `attachments/${'A'.repeat(64)}.png`],
    ['a non-hex name', 'attachments/not-a-hash.png'],
    ['an extension outside the supported set', `attachments/${hash}.bin`],
    ['no extension', `attachments/${hash}`],
    ['a nested path', `attachments/nested/${hash}.png`],
    ['a leading slash', `/attachments/${hash}.png`],
    ['a directory prefix', `chats/attachments/${hash}.png`],
    ['a data URL', 'data:image/png;base64,AA=='],
    ['trailing content', `attachments/${hash}.png?v=1`],
  ])('should not treat %s as an attachment URL', (_name, url) => {
    expect(isAttachmentUrl(url)).toBe(false);
  });

  it('should cap images at 4 MiB and documents at 20 MiB', () => {
    expect(attachmentCapBytes('image')).toBe(4 * 1024 * 1024);
    expect(attachmentCapBytes('document')).toBe(20 * 1024 * 1024);
  });

  it('should read the reference a file part names back into the attachment it came from', () => {
    const url = attachmentUrl(attachment('application/pdf'));
    expect(attachmentReferenceOf({ url, mediaType: 'application/pdf', filename: 'spec.pdf' })).toEqual({
      hash,
      mediaType: 'application/pdf',
      filename: 'spec.pdf',
    });
    expect(attachmentReferenceOf({ url: 'data:image/png;base64,AA==', mediaType: 'image/png' })).toBeUndefined();
  });
});
