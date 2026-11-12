import { mkdtemp, readFile, realpath, rm, symlink, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createShellCapture, decodeTail, inlineShares } from '#shell/shell-output.js';

let root = '';

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'tau-shell-output-')));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const chunks = (...parts: Array<string | Uint8Array<ArrayBuffer>>): AsyncIterable<Uint8Array<ArrayBuffer>> => ({
  async *[Symbol.asyncIterator]() {
    for (const part of parts) {
      yield typeof part === 'string' ? new TextEncoder().encode(part) : part;
    }
  },
});

describe('decodeTail', () => {
  it('drops the partial character a cut split, and only then', () => {
    const euro = new TextEncoder().encode('€uro'); // E2 82 AC 75 72 6F
    expect(decodeTail(euro.subarray(1), true)).toEqual({ text: 'uro', undecodable: false });
    expect(decodeTail(euro, false)).toEqual({ text: '€uro', undecodable: false });
  });

  it('marks invalid bytes undecodable instead of hiding them', () => {
    expect(decodeTail(new Uint8Array([0x61, 0xff, 0x62]), false)).toEqual({ text: 'a�b', undecodable: true });
  });
});

describe('inlineShares', () => {
  it('gives each stream half, and hands a short stream’s unused half to the other', () => {
    expect(inlineShares(10, 10, 100)).toEqual({ stdout: 10, stderr: 10 });
    expect(inlineShares(500, 10, 100)).toEqual({ stdout: 90, stderr: 10 });
    expect(inlineShares(10, 500, 100)).toEqual({ stdout: 10, stderr: 90 });
    expect(inlineShares(500, 500, 100)).toEqual({ stdout: 50, stderr: 50 });
  });
});

describe('createShellCapture', () => {
  it('keeps everything inline under the budget and writes no log', async () => {
    const capture = createShellCapture({ log: { root, name: 'a.log' }, inlineBytes: 16, retainedBytes: 64 });
    await Promise.all([capture.drain('stdout', chunks('hello\n')), capture.drain('stderr', chunks('warn\n'))]);
    const result = await capture.finish();
    expect(result).toEqual({
      stdout: { text: 'hello\n', bytes: 6, truncated: false, undecodable: false },
      stderr: { text: 'warn\n', bytes: 5, truncated: false, undecodable: false },
    });
    await expect(readFile(join(root, '.tau', 'offloaded-tool-results', 'shell', 'a.log'))).rejects.toThrow();
  });

  it('retains up to the limit, counts what it drops, and shows the tail inline', async () => {
    const capture = createShellCapture({ log: { root, name: 'b.log' }, inlineBytes: 8, retainedBytes: 20 });
    await capture.drain('stdout', chunks('0123456789', 'abcdefghij', 'KLMNOPQRST'));
    const result = await capture.finish();
    expect(result.stdout).toEqual({ text: 'MNOPQRST', bytes: 30, truncated: true, undecodable: false });
    expect(result.log).toEqual({
      status: 'saved',
      path: '.tau/offloaded-tool-results/shell/b.log',
      bytes: 20,
      discardedBytes: 10,
    });
    await expect(readFile(join(root, '.tau', 'offloaded-tool-results', 'shell', 'b.log'), 'utf8')).resolves.toBe(
      '0123456789abcdefghij',
    );
  });

  it('never follows a link planted where the log goes, and says the log is unavailable', async () => {
    await mkdir(join(root, '.tau', 'offloaded-tool-results'), { recursive: true });
    const elsewhere = await mkdtemp(join(tmpdir(), 'tau-shell-elsewhere-'));
    await symlink(elsewhere, join(root, '.tau', 'offloaded-tool-results', 'shell'));
    const capture = createShellCapture({ log: { root, name: 'c.log' }, inlineBytes: 4, retainedBytes: 64 });
    await capture.drain('stdout', chunks('0123456789'));
    const result = await capture.finish();
    expect(result.log).toMatchObject({ status: 'unavailable', discardedBytes: 0 });
    await expect(readFile(join(elsewhere, 'c.log'))).rejects.toThrow();
    await rm(elsewhere, { recursive: true, force: true });
  });
});
