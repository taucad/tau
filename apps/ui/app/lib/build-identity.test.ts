import { afterEach, describe, expect, it, vi } from 'vitest';
import { readBuildId, readBuildIdentity } from '#lib/build-identity.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readBuildId', () => {
  it('should prefer the compiled-in build timestamp', () => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- the host contract names window.ENV and its keys.
    vi.stubGlobal('window', { ENV: { TAU_BUILD_ID: '1' } });

    expect(readBuildId()).toBe(tauBuildId);
  });
});

describe('readBuildIdentity', () => {
  it('should render the compiled-in build timestamp as text', () => {
    expect(readBuildIdentity()).toBe(String(tauBuildId));
  });
});
