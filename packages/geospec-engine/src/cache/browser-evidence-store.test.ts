import { afterEach, describe, expect, it } from 'vitest';
import { ensureNodeEvidenceStoreInstalled } from '#cache/browser-evidence-store.js';
import { getGeoSpecEvidenceStore, resetGeoSpecEvidenceStore } from '#cache/evidence-cache.js';

/**
 * The browser half of the `#cache/node-evidence-store.js` conditional import.
 * Node resolves the real store; a browser bundle resolves this module, which
 * exists so `node:fs` is unreachable from the neutral register entry.
 */
afterEach(() => {
  resetGeoSpecEvidenceStore();
});

describe('browser evidence store', () => {
  it('should install no store — a browser computes evidence directly', () => {
    resetGeoSpecEvidenceStore();

    ensureNodeEvidenceStoreInstalled();

    expect(getGeoSpecEvidenceStore()).toBeUndefined();
  });

  it('should stay idempotent, matching the node module it substitutes for', () => {
    ensureNodeEvidenceStoreInstalled();
    ensureNodeEvidenceStoreInstalled();

    expect(getGeoSpecEvidenceStore()).toBeUndefined();
  });
});
