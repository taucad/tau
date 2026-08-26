// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loader } from '#routes/api.github-stars/route.js';

vi.mock('#environment.config.js', () => ({
  getEnvironment: async () => ({}),
}));

type LoaderArgs = Parameters<typeof loader>[0];
// oxlint-disable-next-line typescript/consistent-type-assertions -- minimal loader stub; the loader ignores its args
const loaderArgs = { request: new Request('http://localhost/api/github-stars') } as LoaderArgs;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('github-stars loader', () => {
  it('should return the star count on a successful upstream response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ stargazers_count: 4242 }), { status: 200 }),
    );

    const response = await loader(loaderArgs);
    const body = (await response.json()) as { stars: number | undefined };

    expect(body.stars).toBe(4242);
  });

  it('should omit the star count when the upstream request fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('rate limited', { status: 403 }));

    const response = await loader(loaderArgs);
    const body = (await response.json()) as { stars: number | undefined };

    expect(body.stars).toBeUndefined();
  });

  it('should omit the star count when fetch throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

    const response = await loader(loaderArgs);
    const body = (await response.json()) as { stars: number | undefined };

    expect(body.stars).toBeUndefined();
  });
});
