import { assertPluginContractSurface } from '@taucad/runtime-testing';
import { describe, it } from 'vitest';

import * as entry from '#index.js';
import * as implementation from '#heif.plugin.js';

describe('@taucad/heif entry', () => {
  it('re-exports the package-named plugin factory under the dynamic plugin contract', () => {
    assertPluginContractSurface({ packageName: '@taucad/heif', entry, implementation });
  });
});
