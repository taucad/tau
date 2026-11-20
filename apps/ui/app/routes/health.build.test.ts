// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loader } from '#routes/health.build.js';

const callLoader = async (): Promise<Response> => {
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- minimal stub for loader signature
  const args = {} as Parameters<typeof loader>[0];
  return (await loader(args)) as Response;
};

describe('GET /health/build', () => {
  it('should publish the build id this server renders pages for', async () => {
    const response = await callLoader();

    expect(response.status).toBe(200);
    const body = (await response.json()) as { buildId: number };
    expect(body.buildId).toBe(tauBuildId);
  });

  it('should never be stored by the browser or the CDN, so it always names the live deploy', async () => {
    const response = await callLoader();

    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Netlify-CDN-Cache-Control')).toBe('no-store');
  });

  describe('the build floor (FP2)', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('should publish the operator’s TAU_MIN_BUILD_ID as minBuildId', async () => {
      vi.stubEnv('TAU_MIN_BUILD_ID', '1795000000000');
      const response = await callLoader();
      const body = (await response.json()) as { minBuildId?: number };
      expect(body.minBuildId).toBe(1_795_000_000_000);
    });

    it.each(['', 'not-a-number', '-5', '1.5'])('should publish no floor for TAU_MIN_BUILD_ID %j', async (value) => {
      vi.stubEnv('TAU_MIN_BUILD_ID', value);
      const response = await callLoader();
      const body = (await response.json()) as { minBuildId?: number };
      expect(body.minBuildId).toBeUndefined();
    });
  });
});
