import { assertPluginContractSurface } from '@taucad/runtime-testing';
import { describe, it } from 'vitest';

import * as entry from '#index.js';
import * as implementation from '#replicad.plugin.js';

describe('@taucad/replicad entry', () => {
  it('re-exports the package-named plugin factory under the dynamic plugin contract', () => {
    assertPluginContractSurface({ packageName: '@taucad/replicad', entry, implementation });
  });
});
