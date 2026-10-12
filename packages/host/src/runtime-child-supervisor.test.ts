import { createServer } from 'node:http';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { startRuntimeChild } from '#runtime-child-supervisor.js';

const proofSchema = z.object({
  filesystem: z.literal(true),
  childProcess: z.literal(true),
  worker: z.literal(true),
  addon: z.literal(true),
  wasi: z.literal(true),
  inspector: z.literal(true),
  temporaryDirectoryReadable: z.literal(true),
  temporaryDirectory: z.string(),
  environmentSecretAbsent: z.literal(true),
  network: z.literal(true),
  arbitraryNetworkAllowed: z.literal(true),
});

let temporaryDirectory: string | undefined;

afterEach(async () => {
  delete process.env['TAU_HOST_TEST_SECRET'];
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { recursive: true });
    temporaryDirectory = undefined;
  }
});

describe('runtime child permission boundary', () => {
  it('denies host capabilities, strips secrets, reads back its own temp files, and pins unrestricted network egress', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'tau-host-permissions-'));
    const proofPath = join(temporaryDirectory, 'proof.json');
    const server = createServer((_request, response) => {
      response.end('ok');
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected a TCP permission-test server.');
    }
    process.env['TAU_HOST_TEST_SECRET'] = 'must-not-reach-child';
    const modulePath = fileURLToPath(new URL('fixtures/permission-proof-child.mjs', import.meta.url));

    const child = await startRuntimeChild({
      modulePath,
      args: [proofPath, `http://127.0.0.1:${String(address.port)}`],
    });
    const { temporaryDirectory: childTemporaryDirectory, ...proof } = proofSchema.parse(
      JSON.parse(await readFile(proofPath, 'utf8')),
    );

    expect(proof).toEqual({
      filesystem: true,
      childProcess: true,
      worker: true,
      addon: true,
      wasi: true,
      inspector: true,
      temporaryDirectoryReadable: true,
      environmentSecretAbsent: true,
      network: true,
      arbitraryNetworkAllowed: true,
    });
    expect(childTemporaryDirectory.startsWith(join(tmpdir(), 'tau-runtime-child-'))).toBe(true);
    await child.close();
    await child.closed;
    await expect(access(childTemporaryDirectory)).rejects.toThrow(/ENOENT/u);
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });
});

describe('runtime child control frames', () => {
  it('delivers frames posted after the child is ready', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'tau-host-post-'));
    const outputPath = join(temporaryDirectory, 'messages.jsonl');
    const modulePath = fileURLToPath(new URL('fixtures/message-echo-child.mjs', import.meta.url));
    const child = await startRuntimeChild({ modulePath, args: [outputPath] });

    child.post({ type: 'zoo-proxy-credential', url: 'wss://api.example.test/v1/kernels/zoo', token: 'zt1.a.b' });
    child.post({ type: 'zoo-proxy-credential', url: 'wss://api.example.test/v1/kernels/zoo' });
    const readLines = async (): Promise<string[]> => {
      const text = await readFile(outputPath, 'utf8').catch(() => '');
      return text.trim().split('\n');
    };
    await expect.poll(async () => readLines()).toHaveLength(2);

    const lines = await readLines();
    expect(lines.map((line) => JSON.parse(line) as unknown)).toEqual([
      { type: 'zoo-proxy-credential', url: 'wss://api.example.test/v1/kernels/zoo', token: 'zt1.a.b' },
      { type: 'zoo-proxy-credential', url: 'wss://api.example.test/v1/kernels/zoo' },
    ]);
    await child.close();
  });
});
