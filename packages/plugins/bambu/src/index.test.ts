import { assertPluginContractSurface } from '@taucad/runtime-testing';
import { describe, it } from 'vitest';

import * as entry from '#index.js';
import * as implementation from '#bambu.plugin.js';

describe('@taucad/bambu entry', () => {
  it('re-exports the package-named plugin factory under the dynamic plugin contract', () => {
    assertPluginContractSurface({ packageName: '@taucad/bambu', entry, implementation });
  });
});
