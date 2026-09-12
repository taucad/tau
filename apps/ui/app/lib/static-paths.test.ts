/**
 * B5 R2: prerendering `/usage` must not advertise an account route as public
 * content, so the prerender list and the sitemap list are separate.
 */
import { expect, it } from 'vitest';
import { listOfflineShellPaths, listSitemapPaths, listStaticPrerenderPaths } from '#lib/static-paths.js';

it('prerenders the neutral usage shell', () => {
  expect(listStaticPrerenderPaths()).toContain('/usage');
  expect(listOfflineShellPaths()).toStrictEqual(['/usage']);
});

it('keeps every offline shell path out of the sitemap', () => {
  const sitemapPaths = listSitemapPaths();

  for (const path of listOfflineShellPaths()) {
    expect(sitemapPaths).not.toContain(path);
  }
});

it('prerenders every sitemap path', () => {
  expect(listStaticPrerenderPaths()).toStrictEqual(expect.arrayContaining(listSitemapPaths()));
});
