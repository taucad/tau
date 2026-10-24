import { detectDesktopPlatform, desktopDownloadHref } from '#www/downloads.js';
import { test, expect, vi } from 'vitest';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { ctaPlacements, sanitizeEvent } from '#www/analytics.js';
import { environmentHref, stagingDesktopNote } from '#www/environment.js';
import { PublishedArticleContent } from '#www/page-components.js';
import { content as home } from '#app/routes/home.js';
import { content as product } from '#app/routes/product.js';
import { content as useCases } from '#app/routes/use-cases.js';
import { content as useCasesPrototyping } from '#app/routes/use-cases-prototyping.js';
import { content as useCasesEngineering } from '#app/routes/use-cases-engineering.js';
import { content as useCasesLearning } from '#app/routes/use-cases-learning.js';
import { content as vision } from '#app/routes/vision.js';
import { content as pricing } from '#app/routes/pricing.js';
import { content as contact } from '#app/routes/contact.js';
import { content as download } from '#app/routes/download.js';
import { content as blog } from '#app/routes/blog.js';
import { content as privacy } from '#app/routes/privacy.js';
import { content as legal } from '#app/routes/legal.js';
import { content as notFound } from '#app/routes/not-found.js';
import { validateArticles } from '#www/editorial.js';
import { siteConfiguration } from '#app/config.server.js';
import { loader as sitemap } from '#app/routes/sitemap.js';
import { loader as robots } from '#app/routes/robots.js';
import { loader as llms } from '#app/routes/llms.js';
import { agentPage } from '#www/agent-page.js';
const bodies = [
  home,
  product,
  useCases,
  useCasesPrototyping,
  useCasesEngineering,
  useCasesLearning,
  vision,
  pricing,
  contact,
  download,
  blog,
  privacy,
  legal,
  notFound,
];

const eventId = '83efb3b9-a92c-444f-99ef-c67f8c9573d7';
test('should allowlist analytics and drop secrets, identifiers and unknown events', () => {
  const input = {
    name: 'marketing_page_view',
    page: '/',
    campaign: 'secret@example.com',
    eventId,
    token: 'secret',
    userId: 'alice',
    url: 'https://tau.new/?token=abc',
  };
  expect(sanitizeEvent(input)).toEqual({
    event: 'marketing_page_view',
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external environment, browser or wire-contract field name.
    event_id: eventId,
    page: '/',
  });
  expect(sanitizeEvent({ name: 'signup_completed', page: '/', eventId })).toBeUndefined();
  expect(
    sanitizeEvent({
      name: 'marketing_page_view',
      page: '/invitations/bearer',
      eventId,
    }),
  ).toBeUndefined();
  expect(
    sanitizeEvent({
      name: 'marketing_page_view',
      page: '/',
      eventId: 'user@example.com',
    }),
  ).toBeUndefined();
});
test('should render every page with one heading and enumerated CTA placements', () => {
  for (const body of bodies) {
    const html = renderToStaticMarkup(<MemoryRouter>{body()}</MemoryRouter>);
    expect(html.match(/<h1[ >]/gu)).toHaveLength(1);
    expect(html).not.toContain('&lt;svg');
    for (const match of html.matchAll(/data-placement="([^"]*)"/gu)) {
      expect(ctaPlacements.has(match[1] ?? '')).toBe(true);
    }
  }
});
test('should reject unsafe origins and analytics sinks', () => {
  for (const environment of [
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external environment, browser or wire-contract field name.
    { WWW_ORIGIN: 'https://name:secret@example.com/' },
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external environment, browser or wire-contract field name.
    { WWW_ANALYTICS_ENDPOINT: 'https://tracker.example/collect' },
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external environment, browser or wire-contract field name.
    { WWW_ORIGIN: 'https://example.com/?token=secret' },
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external environment, browser or wire-contract field name.
    { WWW_LAUNCH: 'true' },
  ]) {
    expect(() => siteConfiguration(environment)).toThrow(Error);
  }
});
test('should exclude preview pages from the sitemap and advertise launch sitemap', async () => {
  vi.stubEnv('WWW_ORIGIN', 'https://tau.new');
  try {
    vi.stubEnv('WWW_LAUNCH', 'false');
    expect(await sitemap().text()).not.toContain('<loc>');
    expect(await robots().text()).not.toContain('Sitemap:');
    vi.stubEnv('WWW_LAUNCH', 'true');
    const xml = await sitemap().text();
    expect(xml).toContain('<loc>https://tau.new/product/</loc>');
    expect(xml).toContain('<loc>https://tau.new/legal/privacy/</loc>');
    expect(xml).not.toContain('404');
    expect(await robots().text()).toContain('Sitemap: https://tau.new/sitemap.xml');
  } finally {
    vi.unstubAllEnvs();
  }
});
test('should serve the agent page as plain-text Markdown naming the configured origin', async () => {
  vi.stubEnv('WWW_ORIGIN', 'https://taucad.dev');
  try {
    const response = llms();
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    const text = await response.text();
    expect(text.startsWith('# Tau\n\n> Tau is code-CAD')).toBe(true);
    expect(text.match(/^# /gmu)).toHaveLength(1);
    expect(text).toContain('[Tau app](https://taucad.dev) and [Tau Desktop](https://taucad.dev/download/)');
    // Lighthouse's llms-txt audit needs a Markdown link, as llmstxt.org lists its links.
    expect(text).toMatch(/^- \[.+\]\(https:\/\/.+\)/mu);
    expect(text).toContain('    npm install -g @taucad/cli@beta\n');
    expect(text).not.toMatch(/\{(?:origin|release)\}|\n\n\n/u);
    expect(text).not.toContain('Current release');
    vi.stubEnv('WWW_PLUGIN_VERSION', '0.1.0-beta.7');
    expect(await llms().text()).toContain('\n\nCurrent release: 0.1.0-beta.7 (npm tag `beta`).\n\n## Install');
  } finally {
    vi.unstubAllEnvs();
  }
});
test('should fall back to the app origin and print a release line only when given one', () => {
  expect(agentPage({ origin: '' })).toContain(
    '[Tau app](https://tau.new) and [Tau Desktop](https://tau.new/download/)',
  );
  const released = agentPage({ origin: 'https://tau.new', release: 'Current release: 0.1.0-beta.7 (npm tag `beta`).' });
  expect(released).toContain('folder.\n\nCurrent release: 0.1.0-beta.7 (npm tag `beta`).\n\n## Install');
});
test('should reject unreviewed prose, unsafe slugs, invalid dates and duplicate articles', () => {
  const article = {
    status: 'published',
    authorship: 'human',
    author: 'Test writer',
    reviewedBy: 'Test editor',
    date: '2026-09-01',
    slug: 'test-article',
    title: 'Test article',
    description: 'Test metadata',
    paragraphs: ['A synthetic fixture, never a published article.'],
  };
  const now = new Date('2026-10-01');
  expect(validateArticles([article], now)).toEqual([article]);
  expect(validateArticles([{ status: 'draft' }], now)).toEqual([]);
  for (const change of [
    { authorship: 'generated' },
    { reviewedBy: '' },
    { slug: '../escape' },
    { date: '2026-02-31' },
    { date: '2027-01-01' },
    { paragraphs: [] },
  ]) {
    expect(() => validateArticles([{ ...article, ...change }], now)).toThrow(Error);
  }
  expect(() => validateArticles([article, article], now)).toThrow('Duplicate article slug');
});
test('should keep staging application links on staging and leave production unchanged', () => {
  expect(environmentHref('https://tau.new/projects/new', 'taucad.dev')).toBe('https://taucad.dev/projects/new');
  expect(environmentHref('https://docs.tau.new/', 'taucad.dev')).toBe('https://docs.taucad.dev/');
  expect(environmentHref('https://tau.new/projects/new', 'tau.new')).toBe('https://tau.new/projects/new');
  expect(stagingDesktopNote('tau.new')).toBeUndefined();
  expect(stagingDesktopNote('taucad.dev')).toContain('signed without notarization');
  expect(environmentHref('https://downloads.tau.new/latest/Tau-macos-arm64.zip', 'taucad.dev')).toBe(
    'https://downloads.taucad.dev/latest/Tau-macos-arm64.zip',
  );
});

test('should render reviewed articles as escaped text and remove the empty blog state', () => {
  const [article] = validateArticles([
    {
      status: 'published',
      authorship: 'human',
      author: 'Fixture author',
      reviewedBy: 'Fixture reviewer',
      date: '2026-09-01',
      slug: 'fixture-article',
      title: 'Fixture <title>',
      description: 'Fixture summary',
      paragraphs: ['<script>alert("unsafe")</script>'],
    },
  ]);
  expect(article).toBeDefined();
  if (!article) {
    throw new Error('Expected validated article');
  }
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <PublishedArticleContent article={article} />
    </MemoryRouter>,
  );
  expect(html).toContain('Fixture &lt;title&gt;');
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('<script>');
  expect(html).toMatch(/datetime="2026-09-01"/iu);
  expect(renderToStaticMarkup(<MemoryRouter>{blog(true)}</MemoryRouter>)).not.toContain('blog-empty');
});

test('should render download CTAs and every archive before JavaScript', () => {
  const html = renderToStaticMarkup(<MemoryRouter>{home()}</MemoryRouter>);
  const heroLink = /<a\b[^>]*data-placement="hero"[^>]*>/u.exec(html)?.[0];
  expect(heroLink).toContain('href="/download/"');
  expect(heroLink).toContain('data-host-download="page"');
  expect(html).toContain('Download Tau');
  const agentPrompt = /<div class="agent-prompt">.*?<\/div>/u.exec(html)?.[0];
  expect(agentPrompt).toContain('Install the Tau plugin from https://tau.new/llms.txt</code>');
  // The UI edge function names staging's agent page by matching this exact element: one text node, no markers.
  expect(renderToString(<MemoryRouter>{home()}</MemoryRouter>)).toContain(
    '<code id="agent-prompt-text">Install the Tau plugin from https://tau.new/llms.txt</code>',
  );
  expect(agentPrompt).toMatch(/<button[^>]*type="button"[^>]*data-placement="hero-agent"[^>]*hidden=""/u);
  expect(agentPrompt).toContain('role="status"');
  const downloads = renderToStaticMarkup(<MemoryRouter>{download()}</MemoryRouter>);
  for (const platform of ['mac', 'macIntel', 'windows', 'linux'] as const) {
    expect(downloads).toContain(desktopDownloadHref(platform));
  }
  expect(downloads).toContain('data-mac-intel="true" hidden=""');
  expect(downloads).toContain('Download for Intel');
  expect(downloads).not.toContain('No installer is published');
});

test('should recommend supported desktop hosts and keep mobile or unknown hosts neutral', () => {
  const cases: Array<[Parameters<typeof detectDesktopPlatform>[0], ReturnType<typeof detectDesktopPlatform>]> = [
    [{ userAgentData: { platform: 'macOS' } }, 'mac'],
    [{ platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }, 'mac'],
    [{ userAgentData: { platform: 'Windows' } }, 'windows'],
    [{ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, 'windows'],
    [{ platform: 'Linux x86_64' }, 'linux'],
    [{ userAgentData: { platform: 'Android', mobile: true }, platform: 'Linux armv8l' }, undefined],
    [{ platform: 'MacIntel', maxTouchPoints: 5 }, undefined],
    [{ userAgent: 'Mozilla/5.0 (X11; CrOS x86_64)' }, undefined],
    [{ platform: 'Linux aarch64' }, undefined],
    [{}, undefined],
  ];
  for (const [browser, expected] of cases) {
    expect(detectDesktopPlatform(browser)).toBe(expected);
  }
});

test('should reject Linux ARM hints even when another hint only names Linux', () => {
  for (const architecture of ['aarch64', 'armv8l', 'arm64']) {
    for (const browser of [
      {
        userAgentData: { platform: 'Linux' },
        platform: `Linux ${architecture}`,
        userAgent: 'Mozilla/5.0 (X11; Linux)',
      },
      { userAgentData: { platform: `Linux ${architecture}` }, platform: 'Linux' },
      { userAgentData: { platform: 'Linux' }, userAgent: `Mozilla/5.0 (X11; Linux ${architecture})` },
    ]) {
      expect(detectDesktopPlatform(browser)).toBeUndefined();
    }
  }
});
