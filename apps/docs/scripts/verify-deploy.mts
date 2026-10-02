/* oxlint-disable no-await-in-loop -- Bound file reads and hash updates to one artifact at a time. */
/**
 * Validate the static documentation artifact and record its Git provenance.
 * Run through `pnpm nx run docs:verify-deploy` after the cached docs build.
 * COMMIT_REF, when supplied by Netlify, must match the checked-out commit.
 * Exit 1 on an incomplete artifact, broken local link, or provenance mismatch.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { load } from 'cheerio';
import { oramaStaticClient } from 'fumadocs-core/search/client/orama-static';

const root = resolve(import.meta.dirname, '../../..');
const output = join(root, 'apps/docs/build/client');
const origin = 'https://docs.tau.new';

const getFile = async (pathname: string): Promise<string> => {
  const target = resolve(output, `.${decodeURIComponent(pathname)}`);
  assert.ok(target === output || target.startsWith(`${output}/`), `Invalid artifact path: ${pathname}`);
  const info = await stat(target);
  return info.isDirectory() ? join(target, 'index.html') : target;
};

const main = async (): Promise<void> => {
  const sitemap = load(await readFile(join(output, 'sitemap.xml'), 'utf8'), { xml: true });
  const routes = sitemap('loc')
    .map((_, node) => new URL(sitemap(node).text()).pathname)
    .get();
  assert.ok(routes.includes('/runtime/getting-started/quick-start'), 'Quick start is absent from the sitemap');
  assert.ok(routes.includes('/editor'), 'Editor documentation is absent from the sitemap');
  const rewrites = new Map<string, string>();
  const redirects = await readFile(join(output, '_redirects'), 'utf8');
  for (const line of redirects.split('\n')) {
    if (!line || line.startsWith('#')) {
      continue;
    }
    const [from, to, status] = line.trim().split(/\s+/u);
    assert.ok(from && to && status === '200!', `Unexpected generated rewrite: ${line}`);
    rewrites.set(from, to);
    const rawPage = await readFile(await getFile(to));
    assert.ok(rawPage.length > 0, `Empty raw page: ${to}`);
  }

  const documents = new Map<string, ReturnType<typeof load>>();
  for (const route of routes) {
    const document = load(await readFile(await getFile(route), 'utf8'));
    assert.ok(document('h1').text().trim(), `Missing page heading: ${route}`);
    assert.ok(document('title').text().trim(), `Missing page title: ${route}`);
    documents.set(route, document);
  }

  const checked = new Set<string>();
  for (const [route, document] of documents) {
    for (const node of document('a[href], script[src], link[href], img[src]').toArray()) {
      const reference = document(node).attr('href') ?? document(node).attr('src');
      if (!reference) {
        continue;
      }
      const url = new URL(reference, new URL(route, origin));
      if (url.origin !== origin || checked.has(url.href)) {
        continue;
      }
      checked.add(url.href);
      const pathname = rewrites.get(url.pathname) ?? url.pathname;
      const file = await getFile(pathname);
      const fileInfo = await stat(file);
      assert.ok(fileInfo.size > 0, `${route}: empty target ${reference}`);
      if (url.hash && documents.has(url.pathname)) {
        const destination = documents.get(url.pathname);
        const fragment = decodeURIComponent(url.hash.slice(1));
        assert.ok(
          destination?.('[id]')
            .toArray()
            .some((element) => destination(element).attr('id') === fragment),
          `${route}: missing anchor ${reference}`,
        );
      }
    }
  }

  const searchIndex = await readFile(join(output, 'build/docs-search-index.json'), 'utf8');
  const search = oramaStaticClient({
    from: `data:application/json;base64,${Buffer.from(searchIndex).toString('base64')}`,
  });
  const results = await search.search('Replicad');
  assert.ok(
    results.some(({ url }) => url === '/runtime/reference/replicad'),
    'Static search cannot find Replicad',
  );
  for (const name of ['llms.txt', 'llms-full.txt', 'robots.txt']) {
    const contents = await readFile(join(output, name), 'utf8');
    assert.ok(contents.trim(), `Empty ${name}`);
  }

  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  assert.ok(!process.env['COMMIT_REF'] || process.env['COMMIT_REF'] === commit, 'Netlify commit differs from checkout');
  const digest = createHash('sha256');
  const entries = await readdir(output, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((file) => file.isFile() && file.name !== 'build-provenance.json')
    .map((file) => join(file.parentPath, file.name).slice(output.length + 1))
    .sort();
  for (const file of files) {
    digest
      .update(file)
      .update('\0')
      .update(await readFile(join(output, file)))
      .update('\0');
  }
  const provenance = {
    schemaVersion: 1,
    commit,
    dirty:
      execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: root, encoding: 'utf8' }).trim()
        .length > 0,
    lockfileSha256: createHash('sha256')
      .update(await readFile(join(root, 'pnpm-lock.yaml')))
      .digest('hex'),
    artifactSha256: digest.digest('hex'),
    pages: routes.length,
    files: files.length,
    localReferences: checked.size,
  };
  await writeFile(join(output, 'build-provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`);
  console.log(JSON.stringify(provenance, null, 2));
};

try {
  await main();
} catch (error) {
  console.error('Documentation artifact verification failed:', error);
  process.exitCode = 1;
}
