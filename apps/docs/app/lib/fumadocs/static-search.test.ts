import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { oramaStaticClient } from 'fumadocs-core/search/client/orama-static';
import { getStaticSearchIndexUrl } from '#lib/fumadocs/static-search.server.js';

const indexUrl = '/build/docs-search-index.json';
let testRoot: string;
let indexPath: string;

describe('static docs search', () => {
  beforeEach(async () => {
    testRoot = await mkdtemp(join(tmpdir(), 'tau-docs-static-search-'));
    indexPath = join(testRoot, 'build/client/build/docs-search-index.json');
    vi.spyOn(process, 'cwd').mockReturnValue(testRoot);
    vi.stubEnv('NODE_ENV', 'production');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await rm(testRoot, { force: true, recursive: true });
  });

  it('finds a known documentation term without a server route', async () => {
    const nativeFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (input === indexUrl) {
        return new Response(await readFile(indexPath, 'utf8'), { headers: { 'Content-Type': 'application/json' } });
      }
      return nativeFetch(input, init);
    });
    const generatedIndexUrl = await getStaticSearchIndexUrl();
    const results = await oramaStaticClient({ from: generatedIndexUrl }).search('Replicad');

    expect(generatedIndexUrl).toBe(indexUrl);
    expect(results.some(({ url }) => url === '/runtime/reference/replicad')).toBe(true);
  });
});
