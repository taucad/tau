import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { installGeoSpecVitest } from '#vitest/index.js';
// oxlint-disable-next-line no-restricted-imports, import/extensions -- Reserved host fixtures share private support outside the package build graph.
import { createSettlementClient, subject } from './fixture-support.js';

installGeoSpecVitest(createSettlementClient('isolation-b'));

it('worker isolation b uses its own engine', async () => {
  await expect(subject).toHaveVolume({ value: 1 });
  const output = process.env['GEOSPEC_S7_ISOLATION_OUTPUT'];
  if (output === undefined) {
    throw new TypeError('GEOSPEC_S7_ISOLATION_OUTPUT is required.');
  }
  writeFileSync(
    resolve(output, 'isolation-b.json'),
    `${JSON.stringify({ engineId: 'isolation-b', pid: process.pid, poolId: process.env['VITEST_POOL_ID'] })}\n`,
  );
});
