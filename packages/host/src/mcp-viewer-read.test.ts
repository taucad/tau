import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readModelRange, snapshotModelFile } from '#mcp-viewer-read.js';

describe('readModelRange', () => {
  let directory: string;
  let path: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'tau-viewer-read-'));
    path = join(directory, 'model.glb');
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('should read only the range asked for, and clamp it to the file', async () => {
    const bytes = Buffer.from(Array.from({ length: 1000 }, (_, index) => index % 251));
    await writeFile(path, bytes);
    const { identity } = (await snapshotModelFile(path))!;

    const middle = await readModelRange({ absolutePath: path, identity, offset: 100, length: 50 });
    expect(middle).toEqual({
      offset: 100,
      byteLength: 50,
      totalBytes: 1000,
      data: bytes.subarray(100, 150).toString('base64'),
    });
    const tail = await readModelRange({ absolutePath: path, identity, offset: 990, length: 50 });
    expect(tail).toMatchObject({ offset: 990, byteLength: 10 });
  });

  it('should gzip a slice that shrinks, and leave one that does not', async () => {
    const repeated = Buffer.alloc(64 * 1024, 7);
    await writeFile(path, repeated);
    const { identity } = (await snapshotModelFile(path))!;
    const packed = await readModelRange({
      absolutePath: path,
      identity,
      offset: 0,
      length: 65_536,
      encodings: ['gzip'],
    });
    expect(packed).toMatchObject({ encoding: 'gzip', byteLength: 65_536 });
    expect(gunzipSync(Buffer.from((packed as { data: string }).data, 'base64'))).toEqual(repeated);

    const noise = Buffer.from(Array.from({ length: 4096 }, () => Math.floor(Math.random() * 256)));
    await writeFile(path, noise);
    const fresh = (await snapshotModelFile(path))!.identity;
    const raw = await readModelRange({
      absolutePath: path,
      identity: fresh,
      offset: 0,
      length: 4096,
      encodings: ['gzip'],
    });
    expect(raw).not.toHaveProperty('encoding');
    expect(Buffer.from((raw as { data: string }).data, 'base64')).toEqual(noise);
  });

  it('should refuse a range once the file is no longer the one shown', async () => {
    await writeFile(path, Buffer.alloc(100, 1));
    const { identity } = (await snapshotModelFile(path))!;
    await writeFile(path, Buffer.alloc(100, 2));
    await utimes(path, new Date(), new Date(Date.now() + 5000));

    expect(await readModelRange({ absolutePath: path, identity, offset: 0, length: 10 })).toEqual({
      refused: 'changed',
    });
    await rm(path);
    expect(await readModelRange({ absolutePath: path, identity, offset: 0, length: 10 })).toEqual({
      refused: 'missing',
    });
  });
});
