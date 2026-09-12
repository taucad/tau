/**
 * The neutral prerendered `/usage` document (B5 R2).
 *
 * Lives here rather than beside the route because C10-U5 owns only the route's
 * `meta` export; the invariants under test are the shell's, not the usage
 * view's.
 */
import { expect, it } from 'vitest';
import { loader, shouldRevalidate } from '#root.js';
import { meta } from '#routes/usage/route.js';

type LoaderArguments = Parameters<typeof loader>[0];

/** The root loader never reads its router context. */
const emptyContext = {};

const callLoader = async (cookie: string): ReturnType<typeof loader> => {
  const url = new URL('https://tau.new/usage');
  const loaderArguments: LoaderArguments = {
    request: new Request(url, { headers: { cookie } }),
    params: {},
    context: emptyContext,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- React Router's own unstable argument names.
    unstable_url: url,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- React Router's own unstable argument names.
    unstable_pattern: '/usage',
  };
  return loader(loaderArguments);
};

/** React Router's `MetaArgs` fixture is partial by design; this route reads none of it. */
const metaArguments: Parameters<typeof meta>[0] = {
  data: undefined,
  loaderData: undefined,
  params: {},
  // eslint-disable-next-line @typescript-eslint/naming-convention -- React Router's own unstable field name.
  location: { pathname: '/usage', search: '', hash: '', state: undefined, key: 'test', unstable_mask: undefined },
  matches: [],
};

it('marks the prerendered usage document noindex, nofollow', () => {
  const tags = meta(metaArguments);

  expect(tags).toStrictEqual(
    expect.arrayContaining([{ name: 'robots', content: 'noindex, nofollow' }, { title: 'Tau usage' }]),
  );
});

it('keeps a synthetic authentication cookie out of loader data while a preference survives', async () => {
  const data = await callLoader('tau-cad-kernel=%22openscad%22; better-auth.session_token=synthetic-session-value');

  expect(data.cookies).toStrictEqual({ 'tau-cad-kernel': '"openscad"' });
  expect(JSON.stringify(data)).not.toContain('synthetic-session-value');
  expect(JSON.stringify(data)).not.toContain('session_token');
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
