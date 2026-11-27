/**
 * The prerender list and the sitemap list are separate: a prerendered shell is a build artefact, not public content.
 * `/usage` is function-rendered since the offline usage shell was retired with the `cloud` build (adaptive app
 * deployment mode W12).
 */
import { expect, it } from 'vitest';
import { listSitemapPaths, listStaticPrerenderPaths } from '#lib/static-paths.js';

it('prerenders no usage shell', () => {
  expect(listStaticPrerenderPaths()).not.toContain('/usage');
});

it('prerenders every sitemap path', () => {
  expect(listStaticPrerenderPaths()).toStrictEqual(expect.arrayContaining(listSitemapPaths()));
});
