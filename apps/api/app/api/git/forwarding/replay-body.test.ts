import { PassThrough } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { describe, expect, it } from 'vitest';
import { ReplayableBody } from '#api/git/forwarding/replay-body.js';

/** DC2: a body the first member refused is sent again, whole, to the next. */
describe('ReplayableBody (DC2 spill)', () => {
  const chunk = (fill: number, size = 1024): Uint8Array<ArrayBuffer> => new Uint8Array(size).fill(fill);

  it('should replay every byte taken by a first attempt that stopped mid-body, then the rest', async () => {
    const source = new PassThrough();
    const body = new ReplayableBody(source);
    for (let index = 0; index < 40; index += 1) {
      source.write(chunk(index));
    }
    /* The first attempt reads some of it and is then abandoned, as a refusal abandons it. */
    for (let index = 0; index < 5; index += 1) {
      body.stream.read(1024);
    }
    const replay = body.replay();
    expect(replay).toBeDefined();
    for (let index = 40; index < 60; index += 1) {
      source.write(chunk(index));
    }
    source.end();
    const replayed = await buffer(replay!);
    expect(new Uint8Array(replayed)).toEqual(
      new Uint8Array(Buffer.concat(Array.from({ length: 60 }, (_, index) => chunk(index)))),
    );
  });

  it('should replay a body the first attempt read to its end', async () => {
    const source = new PassThrough();
    const body = new ReplayableBody(source);
    source.end(chunk(7, 4096));
    expect(new Uint8Array(await buffer(body.stream))).toEqual(chunk(7, 4096));
    expect(new Uint8Array(await buffer(body.replay()!))).toEqual(chunk(7, 4096));
  });

  it('should refuse to replay a body past its bound', async () => {
    const source = new PassThrough();
    const body = new ReplayableBody(source, 2048);
    source.end(Buffer.concat([chunk(1), chunk(2), chunk(3)]));
    await buffer(body.stream);
    expect(body.replay()).toBeUndefined();
  });
});
