// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { jscadModelingTypes, kernelTypeMaps, manifoldTypes, opencascadeTypes, replicadTypes } from '#kernel-types.js';
import { kclStdlibReference } from '#kcl-reference.js';

describe('@taucad/api-extractor runtime subpaths', () => {
  it('kernel-types exposes parsed JSON type maps for all kernels', () => {
    expect(kernelTypeMaps).toHaveLength(4);
    expect(Object.keys(opencascadeTypes).length).toBeGreaterThan(0);
    expect(Object.keys(replicadTypes).length).toBeGreaterThan(0);
    expect(Object.keys(jscadModelingTypes).length).toBeGreaterThan(0);
    expect(Object.keys(manifoldTypes).length).toBeGreaterThan(0);
    expect(typeof Object.values(replicadTypes)[0]).toBe('string');
  });

  it('kcl-reference exposes bundled markdown text', () => {
    expect(typeof kclStdlibReference).toBe('string');
    expect(kclStdlibReference.length).toBeGreaterThan(100);
  });

  it('kernel-types module does not pull in KCL markdown assets', () => {
    const kernelTypesSource = readFileSync(fileURLToPath(new URL('kernel-types.ts', import.meta.url)), 'utf8');
    expect(kernelTypesSource).not.toContain('kcl-stdlib-compact.md');
    expect(kernelTypesSource).not.toContain('kcl-reference');
  });

  it('root entry stays type-only and does not bundle runtime assets', () => {
    const indexSource = readFileSync(fileURLToPath(new URL('index.ts', import.meta.url)), 'utf8');
    expect(indexSource).not.toMatch(/\?raw/);
    expect(indexSource).not.toContain('kernelTypeMaps');
    expect(indexSource).not.toContain('kclStdlibReference');
  });
});
