import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { publicationApiCode } from '@taucad/types/constants';
import type { MultipartIteratorPart, MultipartRequest } from '#api/publications/publish-multipart.decorator.js';
import { collectPublishMultipart } from '#api/publications/publish-multipart.decorator.js';

function requestFromParts(parts: MultipartIteratorPart[]): MultipartRequest {
  return {
    parts: async function* iterateParts() {
      for (const part of parts) {
        yield part;
      }
    },
  } as unknown as MultipartRequest;
}

describe('collectPublishMultipart', () => {
  it('captures manifest field', async () => {
    const fromString = await collectPublishMultipart(
      requestFromParts([{ type: 'field', fieldname: 'manifest', value: '{"x":1}' }]),
    );
    expect(fromString.manifest).toBe('{"x":1}');
  });

  it('coerces non-string manifest field values to string', async () => {
    const oddField = {
      type: 'field',
      fieldname: 'manifest',
      value: 123,
    } as unknown as MultipartIteratorPart;

    const result = await collectPublishMultipart(requestFromParts([oddField]));
    expect(result.manifest).toBe('123');
  });

  it('collects file parts into a map', async () => {
    const bytes = new TextEncoder().encode('hi');
    const collected = await collectPublishMultipart(
      requestFromParts([
        {
          type: 'file',
          fieldname: 'main.ts',
          filename: 'main.ts',
          encoding: 'utf8',
          mimetype: 'text/plain',
          file: (async function* yieldOnce() {
            yield bytes;
          })(),
        },
      ]),
    );
    expect([...(collected.files.get('main.ts') ?? [])]).toEqual([...bytes]);
  });

  it('normalizes relative paths', async () => {
    const empty = new Uint8Array(0);
    const collected = await collectPublishMultipart(
      requestFromParts([
        {
          type: 'file',
          fieldname: '.\\foo\\bar.ts',
          filename: 'bar.ts',
          encoding: 'utf8',
          mimetype: 'text/plain',
          file: (async function* emptyFile() {
            yield empty;
          })(),
        },
        {
          type: 'file',
          fieldname: './baz.ts',
          filename: 'baz.ts',
          encoding: 'utf8',
          mimetype: 'text/plain',
          file: (async function* emptyFile() {
            yield empty;
          })(),
        },
      ]),
    );
    expect(collected.files.has('foo/bar.ts')).toBe(true);
    expect(collected.files.has('baz.ts')).toBe(true);
  });

  it('returns empty files map when multipart is empty', async () => {
    const collected = await collectPublishMultipart(requestFromParts([]));
    expect(collected.manifest).toBeUndefined();
    expect(collected.files.size).toBe(0);
  });

  it('throws PAYLOAD_TOO_LARGE before consuming all parts once the running total exceeds the cap', async () => {
    const consumed: string[] = [];
    const filePart = (name: string, size: number): MultipartIteratorPart => ({
      type: 'file',
      fieldname: name,
      filename: name,
      encoding: 'utf8',
      mimetype: 'application/octet-stream',
      file: (async function* yieldChunk() {
        consumed.push(name);
        yield new Uint8Array(size);
      })(),
    });

    // Cap of 10 bytes: first two 6-byte files (12 total) trip the limit; the third must never be read.
    await expect(
      collectPublishMultipart(requestFromParts([filePart('a', 6), filePart('b', 6), filePart('c', 6)]), 10),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof BadRequestException &&
        (error.getResponse() as { code?: string }).code === publicationApiCode.PAYLOAD_TOO_LARGE,
    );

    expect(consumed).not.toContain('c');
  });

  it('returns normally when the running total stays under the cap', async () => {
    const bytes = new TextEncoder().encode('hi');
    const collected = await collectPublishMultipart(
      requestFromParts([
        {
          type: 'file',
          fieldname: 'main.ts',
          filename: 'main.ts',
          encoding: 'utf8',
          mimetype: 'text/plain',
          file: (async function* yieldOnce() {
            yield bytes;
          })(),
        },
      ]),
      1024,
    );
    expect([...(collected.files.get('main.ts') ?? [])]).toEqual([...bytes]);
  });
});
