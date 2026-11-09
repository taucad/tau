import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dialectFromAdvertisements } from '@taucad/api-git-core/advertisement';

/**
 * The git release the API image installs is the one whose advertisement dialect
 * `@taucad/api-git-core`'s byte-identity suite proves (`src/advertisement.test.ts`,
 * "the pinned git 2.39.5 advertisement"). The Dockerfile is this app's, so the
 * check lives here, where a change to it reruns the test.
 */
describe('the image git pin', () => {
  const receiveCapabilities =
    'report-status report-status-v2 delete-refs side-band-64k quiet atomic ofs-delta object-format=sha1 agent=git/2.39.5';
  const pinned = dialectFromAdvertisements({
    uploadPack: '0000',
    receivePack: `00b1${'0'.repeat(40)} capabilities^{}\0${receiveCapabilities}\n0000`,
  });

  it('should install the git release whose dialect the store proves', () => {
    const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');

    expect(dockerfile).toMatch(/^ARG GIT_VERSION=1:2\.39\.5-/mu);
    expect(pinned).toStrictEqual({ agent: 'git/2.39.5', capabilitiesWhenEmpty: false });
  });
});
