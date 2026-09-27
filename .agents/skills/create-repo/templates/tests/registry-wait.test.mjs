import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { waitForRegistry } from '../../scripts/registry-wait.mjs';

const manifest = {
  packages: [
    {
      name: 'example-linux',
      version: '1.0.0',
      filename: 'example-linux-1.0.0.tgz',
      integrity: 'sha512-linux',
    },
    { name: 'example', version: '1.0.0', filename: 'example-1.0.0.tgz', integrity: 'sha512-root' },
  ],
  version: '1.0.0',
};

const published = (integrity) => ({
  dist: { attestations: { url: 'https://registry.npmjs.org/-/npm/v1/attestations' }, integrity },
});

const harness = ({ view }) => {
  const logged = [];
  const sleeps = [];
  let clock = 0;
  return {
    logged,
    options: {
      log: (message) => logged.push(message),
      manifest,
      now: () => clock,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
        clock += milliseconds;
      },
      view,
    },
    sleeps,
  };
};

describe('bounded registry visibility wait', () => {
  it('should resolve once every package serves an integrity and an attestation', async () => {
    let attempt = 0;
    const { logged, options, sleeps } = harness({
      view: (name) => {
        attempt += 1;
        if (attempt < 4) return null;
        return published(name === 'example' ? 'sha512-root' : 'sha512-linux');
      },
    });

    await waitForRegistry(options);

    assert.deepEqual(sleeps, [30_000, 60_000]);
    assert.match(logged[0], /^attempt 1 after 0s: 0\/2 packages available$/u);
    assert.equal(logged.at(-1), 'all 2 packages are visible with matching integrity');
  });

  it('should reject when the registry serves a different integrity than the candidate', async () => {
    const { options } = harness({ view: () => published('sha512-tampered') });

    await assert.rejects(
      waitForRegistry(options),
      /example-linux@1\.0\.0: registry integrity sha512-tampered differs from the candidate sha512-linux/u,
    );
  });

  it('should keep waiting for a published package whose attestations are missing', async () => {
    const { options } = harness({
      view: (name) =>
        name === 'example' ? published('sha512-root') : { dist: { integrity: 'sha512-linux' } },
    });

    await assert.rejects(waitForRegistry(options), /unavailable: example-linux \(no attestations\)/u);
  });

  it('should double every wait up to the ceiling and stop at the deadline', async () => {
    const { options, sleeps } = harness({
      view: (name) => (name === 'example' ? published('sha512-root') : null),
    });

    await assert.rejects(
      waitForRegistry(options),
      /timed out after 30 minutes; unavailable: example-linux \(not published\)/u,
    );
    assert.deepEqual(sleeps, [30_000, 60_000, 120_000, 240_000, 300_000, 300_000, 300_000, 300_000, 150_000]);
    assert.equal(
      sleeps.reduce((total, wait) => total + wait, 0),
      30 * 60_000,
    );
  });
});
