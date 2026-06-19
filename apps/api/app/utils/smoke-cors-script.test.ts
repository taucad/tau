/* eslint-disable @typescript-eslint/naming-convention -- HTTP header names and shell env vars use TitleCase / SCREAMING_SNAKE_CASE on the wire */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * Co-located test for `scripts/src/smoke-cors.sh`.
 *
 * The script is post-deploy plumbing — it will be wired into
 * `.github/workflows/deploy.yml` (staging + Fly prod) post-deploy gates.
 * Without a test, the failure path (the only path that matters when chasing
 * a CORS misconfiguration) is unverified and the script could rot
 * silently. Per `docs/policy/testing-policy.md` §1: "if you remove the
 * function under test and the test still passes, the test is broken" — we
 * exercise the script as a black box against canned upstream responses.
 *
 * Lives in `apps/api` because that's where Tau's vitest workspace covers
 * Node-environment tests; the script itself stays in the repo-root
 * `scripts/src/` directory it shares with `wasm-experiment.sh` etc.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.resolve(__dirname, '../../../../scripts/src/smoke-cors.sh');

type CannedHeaders = Record<string, string>;

const startServer = async (headers: CannedHeaders): Promise<{ url: string; close: () => Promise<void> }> => {
  const server = createServer((_request: IncomingMessage, response: ServerResponse) => {
    for (const [name, value] of Object.entries(headers)) {
      response.setHeader(name, value);
    }
    response.statusCode = 200;
    response.end('ok');
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind smoke-cors test server');
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
};

const runScript = async (env: Record<string, string>): Promise<{ exitCode: number; stdout: string; stderr: string }> =>
  new Promise((resolve, reject) => {
    const child = spawn('bash', [scriptPath], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
      stdout += Buffer.from(chunk).toString('utf8');
    });
    child.stderr.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
      stderr += Buffer.from(chunk).toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ exitCode: code ?? -1, stdout, stderr });
    });
  });

describe('scripts/src/smoke-cors.sh', () => {
  let teardown: (() => Promise<void>) | undefined;

  beforeEach(() => {
    teardown = undefined;
  });

  afterEach(async () => {
    if (teardown) {
      await teardown();
    }
  });

  it('should exit 3 when API_URL or ORIGIN env vars are missing', async () => {
    const result = await runScript({});
    expect(result.exitCode).toBe(3);
    expect(result.stderr).toContain('API_URL and ORIGIN env vars are required');
  });

  it('should exit 0 when access-control-allow-origin and cross-origin-resource-policy match', async () => {
    const server = await startServer({
      'Access-Control-Allow-Origin': 'https://taucad.dev',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    teardown = server.close;

    const result = await runScript({
      API_URL: server.url,
      ORIGIN: 'https://taucad.dev',
      PROBE_PATH: '/',
    });

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('access-control-allow-origin: https://taucad.dev');
    expect(result.stdout).toContain('cross-origin-resource-policy: cross-origin');
  });

  it('should exit 1 when access-control-allow-origin is missing', async () => {
    const server = await startServer({
      // Cross-Origin-Resource-Policy is present but the ACAO header is not —
      // mirrors what api.taucad.dev returned for four months while it was
      // bound to the production app.
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    teardown = server.close;

    const result = await runScript({
      API_URL: server.url,
      ORIGIN: 'https://taucad.dev',
      PROBE_PATH: '/',
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('missing or wrong access-control-allow-origin');
    expect(result.stderr).toContain('Full response');
  });

  it('should exit 1 when cross-origin-resource-policy is missing', async () => {
    const server = await startServer({
      'Access-Control-Allow-Origin': 'https://taucad.dev',
    });
    teardown = server.close;

    const result = await runScript({
      API_URL: server.url,
      ORIGIN: 'https://taucad.dev',
      PROBE_PATH: '/',
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('missing or wrong cross-origin-resource-policy');
  });

  it('should respect EXPECTED_ACAO override', async () => {
    const server = await startServer({
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    teardown = server.close;

    const result = await runScript({
      API_URL: server.url,
      ORIGIN: 'https://anything.example',
      EXPECTED_ACAO: '*',
      PROBE_PATH: '/',
    });

    expect(result.exitCode).toBe(0);
  });

  it('should exit 2 when the API is unreachable', async () => {
    // Use an unbound port — kernel will refuse the connection immediately.
    const result = await runScript({
      API_URL: 'http://127.0.0.1:1',
      ORIGIN: 'https://taucad.dev',
      PROBE_PATH: '/',
    });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('curl failed to reach');
  });
});
