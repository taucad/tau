/**
 * The neutral prerendered `/usage` document (B5 R2).
 *
 * Lives here rather than beside the route because C10-U5 owns only the route's
 * `meta` export; the invariants under test are the shell's, not the usage
 * view's.
 */
/* eslint-disable @typescript-eslint/naming-convention -- client environment keys are an external contract. */
import { expect, it, vi } from 'vitest';
import type * as EnvironmentConfig from '#environment.config.js';
import { loader, shouldRevalidate } from '#root.js';
import { meta } from '#routes/usage/route.js';

vi.mock('#environment.config.js', async (loadOriginal) => ({
  ...(await loadOriginal<typeof EnvironmentConfig>()),
  getClientEnvironment: async () => ({
    NODE_ENV: 'test',
    POSTHOG_API_HOST: 'https://analytics.test',
    POSTHOG_ASSET_HOST: 'assets.test',
    POSTHOG_UI_HOST: 'https://analytics.test',
    TAU_API_URL: 'https://api.test',
    TAU_DEBUG: false,
    TAU_FRONTEND_URL: 'https://tau.test',
    TAU_GIT_REMOTE_ALLOW_PRIVATE: false,
    TAU_WEBSOCKET_URL: 'wss://api.test',
  }),
}));

type LoaderArguments = Parameters<typeof loader>[0];

/** The root loader never reads its router context. */
const emptyContext = {};

const callLoader = async (cookie: string): ReturnType<typeof loader> => {
  const url = new URL('https://tau.new/usage');
  const loaderArguments: LoaderArguments = {
    request: new Request(url, { headers: { cookie } }),
    params: {},
    context: emptyContext,
    unstable_url: url,
    unstable_pattern: '/usage',
  };
  return loader(loaderArguments);
};

/** React Router's `MetaArgs` fixture is partial by design; this route reads none of it. */
const metaArguments: Parameters<typeof meta>[0] = {
  data: undefined,
  loaderData: undefined,
  params: {},
  location: { pathname: '/usage', search: '', hash: '', state: undefined, key: 'test', unstable_mask: undefined },
  matches: [],
};

it('marks the prerendered usage document noindex, nofollow', () => {
  const tags = meta(metaArguments);

  expect(tags).toStrictEqual(
    expect.arrayContaining([{ name: 'robots', content: 'noindex, nofollow' }, { title: 'Tau usage' }]),
  );
});

it('keeps request cookies out of loader data', async () => {
  const data = await callLoader('tau-cad-kernel=%22openscad%22; better-auth.session_token=synthetic-session-value');

  expect(data.consentStatus).toBe('unknown');
  expect(JSON.stringify(data)).not.toContain('synthetic-session-value');
  expect(JSON.stringify(data)).not.toContain('session_token');
  expect(JSON.stringify(data)).not.toContain('openscad');
});

it('never revalidates the root server loader for the offline shell route', () => {
  const revalidate = (pathname: string): boolean | undefined =>
    shouldRevalidate({
      nextUrl: new URL(`https://tau.new${pathname}`),
      defaultShouldRevalidate: true,
    } as Parameters<typeof shouldRevalidate>[0]);

  expect(revalidate('/usage?range=30d')).toBe(false);
  expect(revalidate('/usage/')).toBe(false);
  expect(revalidate('/projects')).toBe(true);
});
