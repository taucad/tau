/* oxlint-disable no-restricted-imports -- Installed external-consumer acceptance imports its sibling harness directly. */
import { expect, test } from 'vitest';
import { loadInstalledCampaign, runVitestCampaign, runVitestContinuousCampaign } from './installed.mjs';

test('should enforce independent verdicts for the complete selected corpus through installed Vitest', async () => {
  const campaign = process.env.GEOSPEC_VITEST_CAMPAIGN;
  const output = campaign ? await runVitestContinuousCampaign(campaign, expect) : await runVitestCampaign(expect);
  let expectedRows;
  if (campaign === 'nominal') {
    expectedRows = 18;
  } else if (campaign === 'budget') {
    expectedRows = 12;
  } else {
    expectedRows = Number(loadInstalledCampaign().rows.length);
  }
  expect(output.rows).toHaveLength(expectedRows);
});
