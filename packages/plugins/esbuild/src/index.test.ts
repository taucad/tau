import { assertPluginContractSurface } from '@taucad/runtime-testing';
import { describe, it } from 'vitest';

import * as entry from '#index.js';
import * as implementation from '#esbuild.plugin.js';

describe('@taucad/esbuild entry', () => {
  it('re-exports the package-named plugin factory under the dynamic plugin contract', () => {
    assertPluginContractSurface({ packageName: '@taucad/esbuild', entry, implementation });
  });
});
