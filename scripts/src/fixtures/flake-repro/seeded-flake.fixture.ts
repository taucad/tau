/*
 * A seeded flake for `flake-repro.test.ts`: fails when the attempt's seed (`TAU_FLAKE_REPRO_SEED`) draws under
 * `FLAKE_FIXTURE_RATE`. The `.fixture.ts` name keeps it out of every suite's default include; only
 * `vitest.config.ts` beside it selects it.
 */
import { expect, it } from 'vitest';

import { seededDraw } from '#fixtures/flake-repro/seeded-draw.js';

it('passes unless its seed draws under the rate', () => {
  const rate = Number(process.env['FLAKE_FIXTURE_RATE'] ?? '0');
  expect(seededDraw(Number(process.env['TAU_FLAKE_REPRO_SEED'] ?? '0'))).toBeGreaterThanOrEqual(rate);
});
