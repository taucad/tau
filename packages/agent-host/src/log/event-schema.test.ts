import { describe, expect, it } from 'vitest';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import { fileRefBlockSchema, userProviderMessageSchema } from '#log/event-schema.js';

const hash = 'a'.repeat(64);

describe('fileRefBlockSchema', () => {
  it('should accept an image reference without a filename', () => {
    const block = { type: 'file-ref', path: `attachments/${hash}.png`, mimeType: 'image/png', byteLength: 12 };

    expect(fileRefBlockSchema.parse(block)).toEqual(block);
  });

  it('should accept a document reference carrying its filename', () => {
    const block = {
      type: 'file-ref',
      path: `attachments/${hash}.pdf`,
      mimeType: 'application/pdf',
      byteLength: 2048,
      filename: 'bracket-spec.pdf',
    };

    expect(fileRefBlockSchema.parse(block)).toEqual(block);
  });

  /* P29: a draft hydrated from a record holds a file part with no size at all,
     and that is the reload-then-send path this whole program exists for. The
     field is written when a producer genuinely has it and omitted otherwise —
     never fabricated, and never a reason to refuse the turn. */
  it('should accept a reference that names no byte length', () => {
    const block = { type: 'file-ref', path: `attachments/${hash}.png`, mimeType: 'image/png' };

    expect(fileRefBlockSchema.parse(block)).toEqual(block);
  });

  it.each([
    ['a data URL', { path: 'data:image/png;base64,AAAA' }],
    ['an absolute path', { path: `/attachments/${hash}.png` }],
    ['a traversal', { path: `attachments/../${hash}.png` }],
    ['a short hash', { path: `attachments/${'a'.repeat(63)}.png` }],
    ['an uppercase hash', { path: `attachments/${'A'.repeat(64)}.png` }],
    ['an unsupported extension', { path: `attachments/${hash}.svg` }],
    ['a nested directory', { path: `attachments/nested/${hash}.png` }],
  ])('should reject %s as an attachment path', (_label, override) => {
    const block = { type: 'file-ref', path: `attachments/${hash}.png`, mimeType: 'image/png', byteLength: 12 };

    expect(fileRefBlockSchema.safeParse({ ...block, ...override }).success).toBe(false);
  });

  it.each([
    ['a negative byte length', { byteLength: -1 }],
    ['a fractional byte length', { byteLength: 1.5 }],
    ['a missing media type', { mimeType: undefined }],
    ['an empty media type', { mimeType: '' }],
    ['an unknown key', { data: 'AAAA' }],
    ['a wrong block type', { type: 'image' }],
  ])('should reject %s', (_label, override) => {
    const block = { type: 'file-ref', path: `attachments/${hash}.png`, mimeType: 'image/png', byteLength: 12 };

    expect(fileRefBlockSchema.safeParse({ ...block, ...override }).success).toBe(false);
  });
});

describe('userProviderMessageSchema', () => {
  it('should accept a user message carrying both the reference and the legacy inline arms', () => {
    const message = {
      id: 'user-1',
      role: 'user',
      content: [
        { type: 'text', text: 'Read these.' },
        {
          type: 'file-ref',
          path: `attachments/${hash}.pdf`,
          mimeType: 'application/pdf',
          byteLength: 9,
          filename: 's.pdf',
        },
        { type: 'image', mimeType: 'image/png', data: 'AAAA' },
      ],
    };

    expect(userProviderMessageSchema.parse(message)).toEqual(message);
  });
});
