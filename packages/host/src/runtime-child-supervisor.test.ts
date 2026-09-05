import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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
  it('denies host capabilities, strips secrets, and pins unrestricted network egress', async () => {
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
    const proof = proofSchema.parse(JSON.parse(await readFile(proofPath, 'utf8')));

    expect(proof).toEqual({
      filesystem: true,
      childProcess: true,
      worker: true,
      addon: true,
      wasi: true,
      inspector: true,
      environmentSecretAbsent: true,
      network: true,
      arbitraryNetworkAllowed: true,
    });
    await child.close();
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
