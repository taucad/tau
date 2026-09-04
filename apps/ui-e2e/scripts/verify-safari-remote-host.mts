#!/usr/bin/env node
/**
 * Verify the remote-host browser transport in branded Safari via safaridriver.
 *
 * Implements the Safari acceptance lane from
 * docs/research/tau-host-daemon-remote-kernel-implementation-charter.md.
 *
 * Required env vars:
 *   TAU_SAFARI_TEST_URL           Ready remote-host acceptance-page URL.
 *   TAU_EXPECTED_GLTF_SHA256      Expected GLB SHA-256 from the in-process baseline.
 * Optional env vars:
 *   SAFARIDRIVER_PORT                WebDriver port (default: 4444).
 *   TAU_SAFARI_ARTIFACT_DIR       Evidence directory (default: out/test-results/safari-host).
 *
 * Usage:
 *   TAU_SAFARI_TEST_URL='http://localhost:3011/__e2e/remote-host?url=...' \
 *   TAU_EXPECTED_GLTF_SHA256='<sha256>' \
 *   node apps/ui-e2e/scripts/verify-safari-remote-host.mts
 *
 * Exit codes:
 *   0  Success
 *   1  Validation failure
 *   2  Safari/WebDriver failure
 *   3  Missing safaridriver
 */
import { spawn } from 'node:child_process';
import { accessSync, constants, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const {
  TAU_SAFARI_TEST_URL: testUrl,
  TAU_EXPECTED_GLTF_SHA256: expectedHash,
  SAFARIDRIVER_PORT: driverPort,
  TAU_SAFARI_ARTIFACT_DIR: artifactPath,
} = process.env;
if (!testUrl || !expectedHash) {
  process.stderr.write('ERROR: set TAU_SAFARI_TEST_URL and TAU_EXPECTED_GLTF_SHA256\n');
  process.exit(1);
}
if (!URL.canParse(testUrl)) {
  process.stderr.write('ERROR: TAU_SAFARI_TEST_URL must be an absolute URL\n');
  process.exit(1);
}
if (!/^[a-f\d]{64}$/u.test(expectedHash)) {
  process.stderr.write('ERROR: TAU_EXPECTED_GLTF_SHA256 must be a lowercase SHA-256\n');
  process.exit(1);
}

const driverPath = '/usr/bin/safaridriver';
try {
  accessSync(driverPath, constants.X_OK);
} catch {
  process.stderr.write('ERROR: safaridriver is required\n');
  process.exit(3);
}

const port = Number(driverPort ?? '4444');
const artifactDirectory = resolve(artifactPath ?? 'out/test-results/safari-host');
const endpoint = `http://127.0.0.1:${String(port)}`;
const driver = spawn(driverPath, ['-p', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
let driverOutput = '';
driver.stdout.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
  driverOutput += Buffer.from(chunk).toString();
});
driver.stderr.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
  driverOutput += Buffer.from(chunk).toString();
});

const request = async <Value extends Record<string, unknown> | string>(
  path: string,
  body?: unknown,
  method = 'POST',
): Promise<Value> => {
  const init: RequestInit = { method };
  if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const response = await fetch(`${endpoint}${path}`, init);
  const payload = (await response.json()) as {
    readonly value?: Value | { readonly error?: string; readonly message?: string };
  };
  if (!response.ok || (payload.value && typeof payload.value === 'object' && 'error' in payload.value)) {
    throw new Error(JSON.stringify(payload.value ?? payload));
  }
  return payload.value as Value;
};

const waitForDriver = async (): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (driver.exitCode !== null) {
      throw new Error(driverOutput.trim() || `safaridriver exited with ${String(driver.exitCode)}`);
    }
    try {
      // oxlint-disable-next-line no-await-in-loop -- WebDriver readiness must be polled sequentially.
      await request('/status', undefined, 'GET');
      return;
    } catch {
      // oxlint-disable-next-line no-await-in-loop -- bounded polling delay.
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          resolve();
        }, 100);
      });
    }
  }
  throw new Error('Timed out waiting for safaridriver.');
};

let sessionId: string | undefined;
const main = async (): Promise<void> => {
  process.stdout.write('→ starting branded Safari acceptance\n');
  await waitForDriver();
  const session = await request<{ readonly sessionId: string }>('/session', {
    capabilities: { alwaysMatch: { browserName: 'safari' } },
  });
  sessionId = session.sessionId;
  await request(`/session/${sessionId}/url`, { url: testUrl });

  const deadline = Date.now() + 120_000;
  let evidence:
    | {
        readonly state: 'ready';
        readonly bytes: string;
        readonly hash: string;
        readonly text: string;
        readonly userAgent: string;
      }
    | { readonly state: 'error'; readonly message: string }
    | { readonly state: 'waiting' } = { state: 'waiting' };
  while (Date.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop -- page state must be sampled in order.
    evidence = await request(`/session/${sessionId}/execute/sync`, {
      script: `const result = document.querySelector('[data-testid="remote-host-result"]');
        const alert = document.querySelector('[role="alert"]');
        if (alert) return { state: 'error', message: alert.textContent || 'Remote compute failed' };
        if (!result) return { state: 'waiting' };
        return {
          state: 'ready',
          bytes: result.getAttribute('data-bytes'),
          hash: result.getAttribute('data-hash'),
          text: result.textContent,
          userAgent: navigator.userAgent,
        };`,
      args: [],
    });
    if (evidence.state !== 'waiting') {
      break;
    }
    // oxlint-disable-next-line no-await-in-loop -- bounded page-state polling delay.
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, 250);
    });
  }
  if (evidence.state !== 'ready') {
    throw new Error(evidence.state === 'error' ? evidence.message : 'Timed out waiting for remote compute.');
  }
  if (!evidence.userAgent.includes('Safari/') || evidence.userAgent.includes('Chrome/')) {
    throw new Error(`Expected branded Safari, received ${evidence.userAgent}`);
  }
  if (evidence.hash !== expectedHash || Number(evidence.bytes) <= 0) {
    throw new Error(`GLB evidence mismatch: ${evidence.bytes} bytes, SHA-256 ${evidence.hash}`);
  }

  const screenshot = await request<string>(`/session/${sessionId}/screenshot`, {});
  mkdirSync(artifactDirectory, { recursive: true });
  writeFileSync(resolve(artifactDirectory, 'remote-host-safari.png'), Buffer.from(screenshot, 'base64'));
  writeFileSync(
    resolve(artifactDirectory, 'remote-host-safari.json'),
    `${JSON.stringify({ ...evidence, url: testUrl }, null, 2)}\n`,
  );
  process.stdout.write(`✓ Safari remote compute verified (${evidence.bytes} bytes)\n`);
};

try {
  await main();
} catch (error) {
  process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n${driverOutput}`);
  process.exitCode = 2;
} finally {
  if (sessionId) {
    try {
      await request(`/session/${sessionId}`, undefined, 'DELETE');
    } catch {
      // The driver may already have ended the failed session.
    }
  }
  driver.kill('SIGTERM');
}
