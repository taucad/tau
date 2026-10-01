import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { sanitizeEvent } from '../src/analytics.mjs';
import { pages, renderPage } from '../src/templates.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const eventId = '83efb3b9-a92c-444f-99ef-c67f8c9573d7';
test('analytics allowlists data and drops secrets, identifiers and unknown events', () => {
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
test('every page has one main, one heading, noindex and escaped metadata', () => {
  for (const page of pages) {
    const html = renderPage({
      page,
      origin: 'https://preview.example',
      launch: false,
      asset: { css: '/a.css', js: '/a.js' },
      analyticsEndpoint: '',
    });
    assert.equal((html.match(/<main /gu) || []).length, 1);
    assert.equal((html.match(/<h1[ >]/gu) || []).length, 1);
    assert.ok(html.includes('content="noindex,nofollow"'));
    assert.ok(html.includes('<link rel="canonical"'));
  }
});
test('preview build has empty sitemap and excludes editorial drafts', async () => {
  const result = spawnSync(process.execPath, [join(root, 'scripts/build.mjs')], {
    env: { ...process.env, WWW_ORIGIN: 'https://preview.example', WWW_LAUNCH: 'false' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal((await readFile(join(root, 'dist/sitemap.xml'), 'utf8')).includes('<loc>'), false);
  assert.equal((await readdir(join(root, 'dist'))).includes('content'), false);
  assert.ok((await readFile(join(root, 'dist/_headers'), 'utf8')).includes('X-Robots-Tag: noindex'));
});
test('build rejects credential-bearing origins and off-origin analytics sinks', () => {
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

test('publication rejects unreviewed prose, unsafe slugs, invalid dates and duplicate articles', async () => {
  const { validateArticles } = await import('../src/editorial.mjs');
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
  ])
    assert.throws(() => validateArticles([{ ...article, ...change }], now));
  assert.throws(() => validateArticles([article, article], now));
});

test('a reviewed article builds an escaped detail page and journal entry without publishing fixtures', async () => {
  const { mkdtemp, cp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const scratch = await mkdtemp(join(tmpdir(), 'tau-www-editorial-test-'));
  try {
    const fixture = join(scratch, 'apps/www');
    await mkdir(fixture, { recursive: true });
    for (const folder of ['src', 'scripts', 'public'])
      await cp(join(root, folder), join(fixture, folder), { recursive: true });
    await mkdir(join(scratch, 'packages/ui/src/styles'), { recursive: true });
    await cp(join(root, '../../packages/ui/src/styles/tokens.css'), join(scratch, 'packages/ui/src/styles/tokens.css'));
    await mkdir(join(fixture, 'content'));
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
      env: { ...process.env, WWW_LAUNCH: 'false' },
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
