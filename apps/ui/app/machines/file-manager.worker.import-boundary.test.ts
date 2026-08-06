// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const workerSource = readFileSync(fileURLToPath(new URL('file-manager.worker.ts', import.meta.url)), 'utf8');

describe('file-manager.worker api-extractor import boundary', () => {
  it('should import package-shaped kernel types from the dedicated subpath', () => {
    expect(workerSource).toContain('@taucad/api-extractor/kernel-types');
    expect(workerSource).toContain('kernelTypePackageMaps');
    expect(workerSource).not.toMatch(/\bkernelTypeMaps\b/);
    expect(workerSource).not.toMatch(/from ["']@taucad\/api-extractor["']/);
  });

  it('does not reference KCL markdown assets directly', () => {
    expect(workerSource).not.toContain('kcl-stdlib-compact.md');
    expect(workerSource).not.toContain('@taucad/api-extractor/kcl-reference');
  });

  it('mounts root and OPFS only through registry-owned providers', () => {
    expect(workerSource).not.toContain('FileSystemAccessProvider');
    expect(workerSource).not.toContain('navigator.storage.getDirectory');
    expect(workerSource).toContain('providerRegistry.getProvider(rootScope)');
    expect(workerSource).toContain("fileService.mount('/node_modules', { backend: 'opfs'");
  });
});
