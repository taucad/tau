import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { ctaPlacements, sanitizeEvent } from '#www/analytics.js';
import { environmentHref, stagingDesktop } from '#www/environment.js';
import { pages, renderPage } from '#www/templates.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const eventId = '83efb3b9-a92c-444f-99ef-c67f8c9573d7';
await test('analytics allowlists data and drops secrets, identifiers and unknown events', () => {
  assert.deepEqual(
    sanitizeEvent({
      name: 'marketing_page_view',
      page: '/',
      campaign: 'secret@example.com',
      eventId,
      token: 'secret',
      userId: 'alice',
      url: 'https://tau.new/?token=abc',
    }),
    { event: 'marketing_page_view', event_id: eventId, page: '/' },
  );
  assert.equal(sanitizeEvent({ name: 'signup_completed', page: '/', eventId }), undefined);
  assert.equal(sanitizeEvent({ name: 'marketing_page_view', page: '/invitations/bearer', eventId }), undefined);
  assert.equal(sanitizeEvent({ name: 'marketing_page_view', page: '/', eventId: 'user@example.com' }), undefined);
});
await test('analytics keeps every CTA placement the pages emit', () => {
  for (const page of pages) {
    const html = renderPage({
      page,
      origin: 'https://preview.example',
      launch: false,
      asset: { css: '/a.css', js: '/a.js' },
      analyticsEndpoint: '',
    });
    for (const [, placement] of html.matchAll(/data-placement="([^"]*)"/gu)) {
      assert.ok(ctaPlacements.has(placement), `${page.path} emits unlisted placement ${placement}`);
    }
  }
});
await test('every page has one main, one heading, noindex and escaped metadata', () => {
  for (const page of pages) {
    const html = renderPage({
      page,
      origin: 'https://preview.example',
      launch: false,
      asset: { css: '/a.css', js: '/a.js' },
      analyticsEndpoint: '',
    });
    assert.equal((html.match(/<main /gu) ?? []).length, 1);
    assert.equal((html.match(/<h1[ >]/gu) ?? []).length, 1);
    assert.ok(html.includes('content="noindex,nofollow"'));
    assert.ok(html.includes('<link rel="canonical"'));
  }
});
await test('preview build has empty sitemap and excludes editorial drafts', async () => {
  const result = spawnSync(process.execPath, [join(root, 'scripts/build.mjs')], {
    env: { ...process.env, WWW_ORIGIN: 'https://preview.example', WWW_LAUNCH: 'false' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const sitemap = await readFile(join(root, 'dist/sitemap.xml'), 'utf8');
  const files = await readdir(join(root, 'dist'));
  const assets = await readdir(join(root, 'dist/_www/assets'));
  const home = await readFile(join(root, 'dist/index.html'), 'utf8');
  const headers = await readFile(join(root, 'dist/_headers'), 'utf8');
  assert.equal(sitemap.includes('<loc>'), false);
  assert.equal(files.includes('content'), false);
  assert.equal(files.includes('assets'), false);
  assert.ok(assets.includes('planetary.bin.gz'));
  assert.equal(home.includes('="/assets/'), false);
  assert.ok(headers.includes('X-Robots-Tag: noindex'));
});
await test('build rejects credential-bearing origins and off-origin analytics sinks', () => {
  for (const overrides of [
    { WWW_ORIGIN: 'https://name:secret@example.com/' },
    { WWW_ANALYTICS_ENDPOINT: 'https://tracker.example/collect' },
    { WWW_ORIGIN: 'https://example.com/?token=secret' },
  ]) {
    const result = spawnSync(process.execPath, [join(root, 'scripts/build.mjs')], {
      env: { ...process.env, ...overrides },
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
  }
});

await test('publication rejects unreviewed prose, unsafe slugs, invalid dates and duplicate articles', async () => {
  const { validateArticles } = await import('#www/editorial.js');
  const article = {
    status: 'published',
    authorship: 'human',
    author: 'Test writer',
    reviewedBy: 'Test editor',
    date: '2026-09-01',
    slug: 'test-article',
    title: 'Test article',
    description: 'Test metadata',
    paragraphs: ['A synthetic test fixture, never a published article.'],
  };
  const now = new Date('2026-10-01');
  assert.deepEqual(validateArticles([article], now), [article]);
  assert.deepEqual(validateArticles([{ status: 'draft' }], now), []);
  for (const change of [
    { authorship: 'generated' },
    { reviewedBy: '' },
    { slug: '../escape' },
    { date: '2026-02-31' },
    { date: '2027-01-01' },
    { paragraphs: [] },
  ]) {
    assert.throws(() => validateArticles([{ ...article, ...change }], now));
  }
  assert.throws(() => validateArticles([article, article], now));
});

await test('a reviewed article builds an escaped detail page and journal entry without publishing fixtures', async () => {
  const { mkdtemp, cp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const scratch = await mkdtemp(join(tmpdir(), 'tau-www-editorial-test-'));
  try {
    const fixture = join(scratch, 'apps/www');
    await mkdir(fixture, { recursive: true });
    await Promise.all(
      ['src', 'scripts', 'public'].map(async (folder) => {
        await cp(join(root, folder), join(fixture, folder), { recursive: true });
      }),
    );
    await cp(join(root, 'package.json'), join(fixture, 'package.json'));
    await mkdir(join(scratch, 'packages/ui/src/styles'), { recursive: true });
    await cp(join(root, '../../packages/ui/src/styles/tokens.css'), join(scratch, 'packages/ui/src/styles/tokens.css'));
    await mkdir(join(fixture, 'content'));
    await cp(join(root, 'content/evidence'), join(fixture, 'content/evidence'), { recursive: true });
    await writeFile(
      join(fixture, 'content/articles.json'),
      JSON.stringify([
        {
          status: 'published',
          authorship: 'human',
          author: 'Fixture author',
          reviewedBy: 'Fixture reviewer',
          date: '2026-01-01',
          slug: 'editorial-fixture',
          title: 'A test article',
          description: 'A test-only article.',
          paragraphs: ['<script>unsafe()</script> remains literal text.'],
        },
      ]),
    );
    const result = spawnSync(process.execPath, [join(fixture, 'scripts/build.mjs')], {
      env: {
        ...process.env,
        WWW_LAUNCH: 'false',
        WWW_RENDER_TOOLS:
          process.env.WWW_RENDER_TOOLS ?? (existsSync(join(root, 'node_modules')) ? root : join(root, '../..')),
      },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const detail = await readFile(join(fixture, 'dist/blog/editorial-fixture/index.html'), 'utf8');
    assert.ok(detail.includes('By Fixture author'));
    assert.ok(detail.includes('&lt;script&gt;unsafe()&lt;/script&gt;'));
    assert.equal(detail.includes('<script>unsafe()'), false);
    const index = await readFile(join(fixture, 'dist/blog/index.html'), 'utf8');
    assert.ok(index.includes('href="/blog/editorial-fixture/"'));
    assert.equal(index.includes('The first notes are taking shape.'), false);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
await test('staging keeps app and docs links on staging and leaves production untouched', () => {
  assert.equal(environmentHref('https://tau.new/projects/new', 'taucad.dev'), 'https://taucad.dev/projects/new');
  assert.equal(environmentHref('https://docs.tau.new/', 'taucad.dev'), 'https://docs.taucad.dev/');
  assert.equal(
    environmentHref('https://github.com/taucad/tau/releases', 'taucad.dev'),
    'https://github.com/taucad/tau/releases',
  );
  assert.equal(environmentHref('https://tau.newer.example/', 'taucad.dev'), 'https://tau.newer.example/');
  assert.equal(environmentHref('https://tau.new/projects', 'tau.new'), 'https://tau.new/projects');
});
/**
 * @param html - A rendered page.
 * @param label - The text the link starts with.
 * @type {(html: string, label: string) => string | undefined}
 */
const linkHref = (html, label) => new RegExp(`<a\\b[^>]*\\bhref="([^"]*)"[^>]*>\\s*${label}\\b`, 'u').exec(html)?.[1];
await test('should open Pro in the billing settings and keep it and the legal links on the host serving the page', () => {
  for (const path of ['/', '/pricing/']) {
    const page = pages.find((candidate) => candidate.path === path);
    assert.ok(page, `missing ${path}`);
    const html = renderPage({
      page,
      origin: 'https://tau.new',
      launch: true,
      asset: { css: '/a.css', js: '/a.js' },
      analyticsEndpoint: '',
    });
    const links = ['Choose Pro in Tau', 'App privacy', 'Terms'].map((label) => linkHref(html, label) ?? `no ${label}`);
    // The page names production; client.mjs passes every https link through environmentHref on load.
    assert.deepEqual(links, [
      'https://tau.new/?settings=billing',
      'https://tau.new/legal/privacy',
      'https://tau.new/legal/terms',
    ]);
    assert.deepEqual(
      links.map((href) => environmentHref(href, 'taucad.dev')),
      ['https://taucad.dev/?settings=billing', 'https://taucad.dev/legal/privacy', 'https://taucad.dev/legal/terms'],
      path,
    );
    assert.deepEqual(
      links.map((href) => environmentHref(href, 'tau.new')),
      links,
      path,
    );
  }
});
await test('only staging offers the staging desktop builds', () => {
  assert.match(stagingDesktop('taucad.dev')?.href ?? '', /releases\?q=desktop-staging/u);
  assert.equal(stagingDesktop('tau.new'), undefined);
});
