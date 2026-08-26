/**
 * Structural cycle-prevention regression for the node-worker transport split.
 *
 * Per `docs/research/runtime-transport-authoring-simplification.md` (R2),
 * the node-worker transport mirrors the R1 web-worker structural split:
 *
 *   - `node-worker-host.ts`     ← host() factory only; NO `new URL` literals
 *   - `node-worker-client.ts`   ← client() factory; consumes an application-owned URL
 *   - `node-worker-transport.ts`← thin client definition via `defineRuntimeTransport`
 * This test pins the one-way client/host dependency split and prevents a
 * library-owned worker URL from recreating the historical chunk graph cycle.
 *
 * @vitest-environment node
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const hostPath = path.resolve(here, 'node-worker-host.ts');
const clientPath = path.resolve(here, 'node-worker-client.ts');
const compositionPath = path.resolve(here, 'node-worker-transport.ts');

const read = (filePath: string): string => readFileSync(filePath, 'utf8');

/**
 * Strip block + line comments before matching. The structural contract
 * targets *code*, not prose — JSDoc examples are allowed to mention
 * `new URL(...)` literals when describing the chunk-emit pattern.
 */
const stripComments = (source: string): string =>
  source.replaceAll(/\/\*[\S\s]*?\*\//g, '').replaceAll(/(^|[^:])\/\/[^\n]*/g, '$1');

describe('node-worker transport split — cycle prevention (R2)', () => {
  it('`node-worker-host.ts` exports `nodeWorkerHost` and contains NO `new URL(` literals in code', () => {
    const source = stripComments(read(hostPath));
    expect(source).toMatch(/export const nodeWorkerHost\b/);
    expect(source).not.toMatch(/new URL\(/);
  });

  it('`node-worker-host.ts` does NOT import from the client file (severs cycle)', () => {
    const source = stripComments(read(hostPath));
    expect(source).not.toMatch(/from ["']#transport\/node-worker-client/);
  });

  it('`node-worker-client.ts` exports `nodeWorkerClient` without owning an executable worker URL', () => {
    const source = stripComments(read(clientPath));
    expect(source).toMatch(/export const nodeWorkerClient\b/);
    expect(source).not.toMatch(/new URL\(/);
    expect(source).not.toMatch(/options\.url\s*\?\?/);
  });

  it('`node-worker-transport.ts` defines only the client via `defineRuntimeTransport`', () => {
    const source = read(compositionPath);
    expect(source).toMatch(/defineRuntimeTransport\(/);
    expect(source).toMatch(/client:\s*nodeWorkerClient/);
    expect(source).not.toMatch(/host:\s*nodeWorkerHost/);
    /* Composition must not choose an executable worker location. */
    const stripped = stripComments(source);
    expect(stripped).not.toMatch(/new URL\(\s*["'][^"']*["']\s*,\s*import\.meta\.url/);
  });
});
