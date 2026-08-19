import { afterEach, describe, expect, it, vi } from 'vitest';

import { getIsolationStatus } from '#cross-origin-isolation/index.js';
import { detectMultiThreadSupport } from '#kernels/occt/oc-threading.js';

describe('detectMultiThreadSupport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('agrees with getIsolationStatus in the gated and ungated cases', () => {
    expect(getIsolationStatus()).toEqual({ crossOriginIsolated: true, sharedArrayBuffer: true });
    expect(detectMultiThreadSupport()).toEqual({ supported: true, reason: 'SAB available' });

    vi.stubGlobal('crossOriginIsolated', false);

    expect(getIsolationStatus()).toEqual({ crossOriginIsolated: false, sharedArrayBuffer: true, reason: 'no-coep' });
    expect(detectMultiThreadSupport()).toEqual({
      supported: false,
      reason: 'crossOriginIsolated=false (missing COOP/COEP headers)',
    });
  });
});
