import { afterAll, beforeAll, expect, it } from 'vitest';

import { installGeoSpecVitest } from 'geospec/vitest';

// oxlint-disable-next-line no-restricted-imports -- The standalone installed harness is copied with its private support module.
import { createNativeFixture, GREEN_VOLUME } from './support.mjs';

const fixture = createNativeFixture('isolation-a');
installGeoSpecVitest(fixture.client);
beforeAll(fixture.open);
afterAll(fixture.close);

it('installed worker isolation a uses its own native engine', async () => {
  await expect(fixture.volumeSubject()).toHaveVolume(GREEN_VOLUME);
});
