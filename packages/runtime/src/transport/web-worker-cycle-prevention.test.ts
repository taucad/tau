/**
 * Structural cycle-prevention regression for the web-worker transport split.
 *
 * Per `docs/research/runtime-transport-authoring-simplification.md` (R1), the
 * web-worker transport is split into three files so that the chunk-emitter
 * file (`web-worker-client.ts`) is structurally outside the transitive graph
 * of the chunk it emits (`worker/web.ts`):
 *
 *   - `web-worker-host.ts`     ← host() factory only; NO `new URL` literals
 *   - `web-worker-client.ts`   ← client() factory; app code owns worker URLs
 *   - `web-worker-transport.ts`← thin composition via `defineRuntimeTransport`
 *   - `worker/web.ts`          ← bundled worker entry; static-imports the host only
 *
 * If any of these structural invariants regresses, Rolldown's `emitFile()`
 * deadlocks during `pnpm nx build ui` and the build hangs indefinitely.
 * This test pins the file shapes so the regression cannot land silently.
 *
 * @vitest-environment node
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const workerEntryPath = path.resolve(here, '../worker/web.ts');
const hostPath = path.resolve(here, 'web-worker-host.ts');
const clientPath = path.resolve(here, 'web-worker-client.ts');
const compositionPath = path.resolve(here, 'web-worker-transport.ts');

const read = (filePath: string): string => readFileSync(filePath, 'utf8');

/**
 * Strip block + line comments before matching. The structural contract
 * targets *code*, not prose — JSDoc examples are allowed to mention
 * `new URL(...)` literals when describing the chunk-emit pattern.
 */
const stripComments = (source: string): string =>
  source.replaceAll(/\/\*[\S\s]*?\*\//g, '').replaceAll(/(^|[^:])\/\/[^\n]*/g, '$1');

describe('web-worker transport split — cycle prevention (R1)', () => {
  it('`web-worker-host.ts` exports `webWorkerHost` and contains NO `new URL(` literals in code', () => {
    const source = stripComments(read(hostPath));
    expect(source).toMatch(/export const webWorkerHost\b/);
    expect(source).not.toMatch(/new URL\(/);
  });

  it('`web-worker-host.ts` does NOT import from the client file (severs cycle)', () => {
    const source = stripComments(read(hostPath));
    expect(source).not.toMatch(/from ["']#transport\/web-worker-client/);
  });

  it('`web-worker-client.ts` exports `webWorkerClient` and contains NO runtime-owned worker URL literal', () => {
    const source = stripComments(read(clientPath));
    expect(source).toMatch(/export const webWorkerClient\b/);
    expect(source).toMatch(/\bcreateWorker\b/);
    expect(source).toMatch(/\burl\b/);
    expect(source).not.toMatch(/new URL\(\s*["']\.\.\/worker\/web\.js["']\s*,\s*import\.meta\.url\s*\)/);
  });

  it('`web-worker-transport.ts` defines only the client via `defineRuntimeTransport`', () => {
    const source = read(compositionPath);
    expect(source).toMatch(/defineRuntimeTransport\(/);
    expect(source).toMatch(/client:\s*webWorkerClient/);
    expect(source).not.toMatch(/host:\s*webWorkerHost/);
    /* Composition file must not own a `new URL(` literal in code (chunk-emitter belongs in client only). */
    const stripped = stripComments(source);
    expect(stripped).not.toMatch(/new URL\(\s*["'][^"']*["']\s*,\s*import\.meta\.url/);
  });

  it('`worker/web.ts` STATIC-imports `webWorkerHost` and never reaches the transport composition or the client', () => {
    const source = stripComments(read(workerEntryPath));
    expect(source).toMatch(/import\s+{[^}]*\bwebWorkerHost\b[^}]*}\s+from\s+["']#transport\/web-worker-host/);
    /* No dynamic-import workaround — the structural split makes static safe. */
    expect(source).not.toMatch(/await\s+import\(\s*["']#transport\/web-worker-(client|transport)/);
    /* No static path back to the composition or the client file either. */
    expect(source).not.toMatch(/from\s+["']#transport\/web-worker-(client|transport)/);
  });
});
