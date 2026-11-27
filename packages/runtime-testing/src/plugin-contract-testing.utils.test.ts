import { describe, expect, it } from 'vitest';

import { assertPluginContractSurface } from '#plugin-contract-testing.utils.js';

const replicad = (): undefined => undefined;
const picogkBrowser = (): undefined => undefined;

describe('assertPluginContractSurface', () => {
  it('accepts an entry that re-exports the package-named factory under its name and as plugin', () => {
    expect(() => {
      assertPluginContractSurface({
        packageName: '@taucad/replicad',
        entry: { replicad, plugin: replicad, replicadKernel: () => undefined },
        implementation: { replicad },
      });
    }).not.toThrow();
  });

  it('derives the camelCase binding from a hyphenated package name', () => {
    expect(() => {
      assertPluginContractSurface({
        packageName: '@taucad/picogk-browser',
        entry: { picogkBrowser, plugin: picogkBrowser },
        implementation: { picogkBrowser },
      });
    }).not.toThrow();
  });

  it('rejects an implementation module without the package-named factory', () => {
    expect(() => {
      assertPluginContractSurface({
        packageName: '@taucad/replicad',
        entry: { plugin: replicad },
        implementation: { plugin: replicad },
      });
    }).toThrow("@taucad/replicad: the implementation module exports no 'replicad' plugin factory");
  });

  it('rejects an entry that omits the dynamic plugin export', () => {
    expect(() => {
      assertPluginContractSurface({
        packageName: '@taucad/replicad',
        entry: { replicad },
        implementation: { replicad },
      });
    }).toThrow("- the entry does not export 'plugin'; re-export 'replicad' as 'plugin'.");
  });

  it('rejects an entry that omits the package-named export', () => {
    expect(() => {
      assertPluginContractSurface({
        packageName: '@taucad/replicad',
        entry: { plugin: replicad },
        implementation: { replicad },
      });
    }).toThrow("- the entry does not export 'replicad'; re-export 'replicad' as 'replicad'.");
  });

  it('rejects an entry whose plugin export is another factory', () => {
    expect(() => {
      assertPluginContractSurface({
        packageName: '@taucad/replicad',
        entry: { replicad, plugin: () => undefined },
        implementation: { replicad },
      });
    }).toThrow("- the entry's 'plugin' is not the implementation module's 'replicad'.");
  });

  it('rejects a third name for the factory, including a default export', () => {
    expect(() => {
      assertPluginContractSurface({
        packageName: '@taucad/replicad',
        entry: { replicad, plugin: replicad, default: replicad },
        implementation: { replicad },
      });
    }).toThrow("- the entry also exports 'replicad' as 'default'; only 'replicad' and 'plugin' name it.");
  });
});
