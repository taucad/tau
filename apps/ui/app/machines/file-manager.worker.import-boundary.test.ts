// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fileManagerWorkerName, homeBackendFromWorkerName } from '#machines/file-manager-worker-name.js';

const workerSource = readFileSync(fileURLToPath(new URL('file-manager.worker.ts', import.meta.url)), 'utf8');

describe('file-manager.worker api-extractor import boundary', () => {
  it('should import package-shaped kernel types from the dedicated subpath', () => {
    expect(workerSource).toContain('@taucad/api-extractor/kernel-types');
    expect(workerSource).toContain('kernelTypePackageMaps');
    expect(workerSource).not.toMatch(/\bkernelTypeMaps\b/);
    expect(workerSource).not.toMatch(/from ["']@taucad\/api-extractor["']/);
  });

  it('should not reference KCL markdown assets directly', () => {
    expect(workerSource).not.toContain('kcl-stdlib-compact.md');
    expect(workerSource).not.toContain('@taucad/api-extractor/kcl-reference');
  });

  it('mounts root and OPFS only through registry-owned providers', () => {
    expect(workerSource).not.toContain('FileSystemAccessProvider');
    expect(workerSource).not.toContain('navigator.storage.getDirectory');
    expect(workerSource).toContain('providerRegistry.getProvider(rootScope)');
    expect(workerSource).toContain(
      "fileService.mount('/node_modules', { backend: 'opfs', providerBasePath: 'tau-node-modules' })",
    );
  });

  // R3 — `/` is Home's root, so it must follow the profile's engine pin
  // instead of the IndexedDB literal it used to carry.
  it('roots / on the Home engine the host handed over', () => {
    expect(workerSource).toContain('homeBackendFromWorkerName(self.name)');
    expect(workerSource).toContain('return { backend: homeStorageBackend };');
    expect(workerSource).not.toContain("rootScope = { backend: 'indexeddb' }");
  });

  // Batch Q: the provider client crosses the port; the `node:fs` half never
  // enters this bundle. The host lives behind `@taucad/filesystem/backend/node`.
  it('reaches the node backend only through the injected port, never the host subpath', () => {
    expect(workerSource).toContain("data.type === 'nodeFsPort'");
    expect(workerSource).toContain('createNodeFsPort');
    expect(workerSource).not.toContain('@taucad/filesystem/backend/node');
    expect(workerSource).not.toMatch(/from ['"]node:/u);
  });
});

describe('file-manager worker name handoff', () => {
  it('round-trips the pinned engine between the FM machine and the worker', () => {
    expect(fileManagerWorkerName('opfs')).toBe('fm-root:opfs');
    expect(homeBackendFromWorkerName(fileManagerWorkerName('opfs'))).toBe('opfs');
    expect(homeBackendFromWorkerName(fileManagerWorkerName('indexeddb'))).toBe('indexeddb');
    expect(fileManagerWorkerName('node')).toBe('fm-root:node');
    expect(homeBackendFromWorkerName(fileManagerWorkerName('node'))).toBe('node');
  });

  it('falls back to IndexedDB for a worker whose name carries no engine', () => {
    expect(homeBackendFromWorkerName('fm-root')).toBe('indexeddb');
    expect(homeBackendFromWorkerName('')).toBe('indexeddb');
  });
});
