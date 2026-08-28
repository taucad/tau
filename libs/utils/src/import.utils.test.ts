import { describe, expect, it } from 'vitest';
import { getCdnCachePath, getNodeModulesPath, isNodeModulesPath, resolveImportPath } from '#import.utils.js';

describe('resolveImportPath', () => {
  it.each([
    ['./helper.ts', 'main.ts', 'helper.ts'],
    ['./helper.ts', 'src/main.ts', 'src/helper.ts'],
    ['../shared/helper.ts', 'src/nested/main.ts', 'src/shared/helper.ts'],
    ['/shared/helper.ts', 'src/main.ts', 'shared/helper.ts'],
  ])('resolves %s from %s', (specifier, importer, expected) => {
    expect(resolveImportPath(specifier, importer)).toBe(expected);
  });

  it('rejects traversal above the virtual root', () => {
    expect(() => resolveImportPath('../../secret.ts', 'src/main.ts')).toThrow('escapes');
  });
});

describe('project-local package cache paths', () => {
  it('builds unscoped, scoped, and nested package paths inside root node_modules', () => {
    expect(getNodeModulesPath('@scope/pkg')).toBe('/node_modules/@scope/pkg');
    expect(getCdnCachePath('lodash')).toBe('/node_modules/lodash/index.js');
    expect(getCdnCachePath('@scope/pkg', 'dist/index')).toBe('/node_modules/@scope/pkg/dist/index.js');
  });

  it.each([
    ['../escape', undefined],
    ['/absolute', undefined],
    ['pkg/extra', undefined],
    ['pkg', '../escape'],
    ['pkg', '%2e%2e/escape'],
    ['pkg', '/absolute'],
    ['pkg', String.raw`nested\escape`],
    ['pkg', 'nested//escape'],
    ['pkg\u0000', undefined],
  ])('rejects invalid package input %j / %j', (name, subpath) => {
    expect(() => getCdnCachePath(name, subpath)).toThrow(TypeError);
  });

  it('classifies only root node_modules and its descendants', () => {
    expect(isNodeModulesPath('/node_modules')).toBe(true);
    expect(isNodeModulesPath('/node_modules/pkg/index.js')).toBe(true);
    expect(isNodeModulesPath('/src/node_modules/pkg/index.js')).toBe(false);
    expect(isNodeModulesPath('node_modules/pkg/index.js')).toBe(false);
  });
});
