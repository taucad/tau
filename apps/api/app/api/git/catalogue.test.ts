import type { FastifyReply, FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { FileLinksService } from '#storage/file-links.service.js';
import type { ObjectStorageService } from '#storage/object-storage.service.js';
import { TAU_DEFAULT_STORAGE_ACCOUNT_ID } from '#storage/object-storage.service.js';
import {
  buildCatalogue,
  catalogueSizes,
  defaultCatalogueFamilies,
  parseCatalogueFamilies,
} from '#api/git/catalogue.js';
import { GitCatalogueController } from '#api/git/catalogue.controller.js';
import type { GitAccess, GitRepositoryService } from '#api/git/git.service.js';
import { listingKeyFor } from '#api/git/store/listing.js';
import { encodeManifest, indexKeyFor, succeedManifest } from '#api/git/store/manifest.js';
import type { Manifest } from '#api/git/store/manifest.js';
import { repositoryLocator } from '#api/git/store/locator.js';
import type { PublicationRateLimiterService } from '#api/publications/publication-rate-limiter.service.js';
import { createMemoryRepositoryStore } from '#testing/publication-lease.fixture.js';

/*
 * The catalogue (D8): sync-policy-filtered refs, a listing link per branch tip,
 * an `.idx` link and a Range link per live pack, and never a pack body.
 */

const main = 'a'.repeat(40);
const feature = 'b'.repeat(40);
const tag = 'c'.repeat(40);
const chat = 'd'.repeat(40);
const ops = 'e'.repeat(40);
const packA = `packs/pack-${'1'.repeat(40)}-${'0'.repeat(16)}.pack`;
const packB = `packs/pack-${'2'.repeat(40)}-${'0'.repeat(16)}.pack`;

const manifest: Manifest = succeedManifest(
  undefined,
  {
    refs: {
      'refs/heads/main': { oid: main },
      'refs/heads/feature': { oid: feature },
      'refs/tags/v1': { oid: tag, peeled: main },
      'refs/tau/chats/c1': { oid: chat },
      'refs/tau/ops/device-1': { oid: ops },
    },
    packs: [
      { key: packA, bytes: 4096, indexStored: true },
      { key: packB, bytes: 8192, indexStored: true },
    ],
    committedBy: 'user_owner',
  },
  new Date('2026-11-05T00:00:00Z'),
);

const signer = async (key: string, bytes: number): Promise<string> => `https://files.test/${key}?n=${String(bytes)}`;

describe('the catalogue', () => {
  it('should return heads and tags by default, never operation logs, and chats only when asked', async () => {
    const sizes = new Map([
      [indexKeyFor(packA), 1100],
      [indexKeyFor(packB), 1200],
    ]);
    const plain = await buildCatalogue(manifest, {
      families: defaultCatalogueFamilies,
      sizes,
      sign: signer,
      expiresAt: 1,
    });
    expect(plain.refs.map((entry) => entry.ref)).toEqual(['refs/heads/feature', 'refs/heads/main', 'refs/tags/v1']);
    expect(plain.refs.find((entry) => entry.ref === 'refs/tags/v1')).toEqual({
      ref: 'refs/tags/v1',
      oid: tag,
      peeled: main,
    });
    const withChats = await buildCatalogue(manifest, {
      families: parseCatalogueFamilies('heads,chats') ?? [],
      sizes,
      sign: signer,
      expiresAt: 1,
    });
    expect(withChats.refs.map((entry) => entry.ref)).toEqual([
      'refs/heads/feature',
      'refs/heads/main',
      'refs/tau/chats/c1',
    ]);
    expect(JSON.stringify([plain, withChats])).not.toContain(ops);
  });

  it('should refuse a family it does not serve, operation logs included', () => {
    expect(parseCatalogueFamilies(undefined)).toEqual(['heads', 'tags']);
    expect(parseCatalogueFamilies('heads,heads')).toEqual(['heads']);
    expect(parseCatalogueFamilies('ops')).toBeUndefined();
    expect(parseCatalogueFamilies('heads,ops')).toBeUndefined();
    expect(parseCatalogueFamilies('remotes')).toBeUndefined();
  });

  it('should link each live pack to its stored index and its body, sized as stored', async () => {
    const sizes = new Map([
      [indexKeyFor(packA), 1100],
      [indexKeyFor(packB), 1200],
      [listingKeyFor(main), 300],
    ]);
    const catalogue = await buildCatalogue(manifest, { families: ['heads'], sizes, sign: signer, expiresAt: 99 });
    expect(catalogue).toMatchObject({ format: 1, generation: 1, complete: true, expiresAt: 99 });
    expect(catalogue.packs).toEqual([
      {
        key: packA,
        bytes: 4096,
        index: { href: `https://files.test/${indexKeyFor(packA)}?n=1100`, bytes: 1100 },
        pack: { href: `https://files.test/${packA}?n=4096`, bytes: 4096 },
      },
      {
        key: packB,
        bytes: 8192,
        index: { href: `https://files.test/${indexKeyFor(packB)}?n=1200`, bytes: 1200 },
        pack: { href: `https://files.test/${packB}?n=8192`, bytes: 8192 },
      },
    ]);
    /* Only the tip whose listing is stored gets a link; `feature` reads its trees by Range. */
    expect(catalogue.listings).toEqual([
      { commit: main, href: `https://files.test/${listingKeyFor(main)}?n=300`, bytes: 300 },
    ]);
  });

  it('should say it is incomplete when a live pack has no stored index or no link', async () => {
    const sizes = new Map([[indexKeyFor(packA), 1100]]);
    const missingIndex = await buildCatalogue(manifest, { families: ['heads'], sizes, sign: signer, expiresAt: 1 });
    expect(missingIndex.complete).toBe(false);
    expect(missingIndex.packs.map((pack) => pack.key)).toEqual([packA]);
    const unsigned = await buildCatalogue(manifest, {
      families: ['heads'],
      sizes: new Map([
        [indexKeyFor(packA), 1100],
        [indexKeyFor(packB), 1200],
      ]),
      sign: async (key, bytes) => (key.startsWith(packB.slice(0, 20)) ? undefined : signer(key, bytes)),
      expiresAt: 1,
    });
    expect(unsigned.complete).toBe(false);
  });

  it('should read the sizes from one listing of packs and one key listing per tip', async () => {
    const store = createMemoryRepositoryStore();
    const locator = repositoryLocator({ ownerId: 'user_owner', projectId: 'proj_cat' });
    const put = async (key: string, size: number): Promise<void> =>
      store.putObject(locator, key, new Uint8Array(size), { contentLength: size, sha256: '' });
    await put(indexKeyFor(packA), 11);
    await put(packA, 40);
    await put(listingKeyFor(main), 3);
    await put(listingKeyFor(ops), 5);
    const listed = vi.spyOn(store, 'listObjects');
    const sizes = await catalogueSizes(store, locator, [main]);
    expect(Object.fromEntries(sizes)).toEqual({ [indexKeyFor(packA)]: 11, [packA]: 40, [listingKeyFor(main)]: 3 });
    expect(listed.mock.calls.map(([, prefix]) => prefix).toSorted()).toEqual([
      'listings/' + main + '.tsv.gz',
      'packs/',
    ]);
  });
});

describe('GET /v1/projects/:projectId/git/catalogue', () => {
  const access: GitAccess = {
    projectId: 'proj_cat',
    ownerId: 'user_owner',
    role: 'owner',
    callerId: 'user_owner',
    remainingBytes: 1024,
    storageLimitBytes: 1024,
  };
  const locator = repositoryLocator({ ownerId: 'user_owner', projectId: 'proj_cat' });

  const route = async (options: { enabled?: boolean; allowed?: boolean; account?: string } = {}) => {
    const store = createMemoryRepositoryStore();
    await store.commitManifest(locator, encodeManifest(manifest), 'absent');
    for (const key of [indexKeyFor(packA), indexKeyFor(packB), listingKeyFor(main)]) {
      // oxlint-disable-next-line no-await-in-loop -- three fixture objects
      await store.putObject(locator, key, new Uint8Array(4), { contentLength: 4, sha256: '' });
    }
    const repositories = mock<GitRepositoryService>();
    repositories.authorize.mockResolvedValue(access);
    repositories.resolveActiveLocator.mockResolvedValue(locator);
    const limiter = mock<PublicationRateLimiterService>();
    limiter.consumeWindowBudget.mockResolvedValue({
      allowed: options.allowed ?? true,
      count: 1,
      retryAfterSeconds: 9,
    });
    const objectStorage = mock<ObjectStorageService>();
    Object.defineProperty(objectStorage, 'account', {
      get: () => ({ id: options.account ?? TAU_DEFAULT_STORAGE_ACCOUNT_ID }),
    });
    const fileLinks = mock<FileLinksService>();
    Object.defineProperty(fileLinks, 'enabled', { get: () => options.enabled ?? true });
    fileLinks.sign.mockImplementation(async (request) => `https://files.test/${request.namespace}/${request.key}`);
    const controller = new GitCatalogueController(repositories, limiter, objectStorage, store, fileLinks);
    const reply = mock<FastifyReply>();
    const request = { raw: { headers: {} } } as unknown as FastifyRequest;
    return { controller, reply, request, repositories, fileLinks };
  };

  it('should authorize a read and sign every link under the repository prefix in the private tier', async () => {
    const { controller, reply, request, repositories, fileLinks } = await route();
    const catalogue = await controller.catalogue('proj_cat', undefined, 'user_owner', request, reply);
    expect(repositories.authorize).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'proj_cat', mode: 'read' }),
    );
    expect(catalogue.complete).toBe(true);
    expect(catalogue.packs[0]?.index.href).toBe(
      `https://files.test/tenants/user_owner/repos/proj_cat/${indexKeyFor(packA)}`,
    );
    expect(fileLinks.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: 'tenants',
        tier: 'private',
        key: `user_owner/repos/proj_cat/${packB}`,
        size: 8192,
      }),
    );
    expect(reply.header).toHaveBeenCalledWith('cache-control', 'no-store');
  });

  it('should answer 404 unavailable when the files host is off or the bytes are on another account', async () => {
    for (const options of [{ enabled: false }, { account: 'acct_foreign' }]) {
      // oxlint-disable-next-line no-await-in-loop -- two configurations
      const { controller, reply, request } = await route(options);
      // oxlint-disable-next-line no-await-in-loop -- as above
      await expect(controller.catalogue('proj_cat', undefined, 'user_owner', request, reply)).rejects.toMatchObject({
        status: 404,
        response: { code: 'GIT_CATALOGUE_UNAVAILABLE' },
      });
    }
  });

  it('should refuse an unknown family with 400 and a spent window with 429, reading nothing', async () => {
    const unknown = await route();
    await expect(
      unknown.controller.catalogue('proj_cat', 'ops', 'user_owner', unknown.request, unknown.reply),
    ).rejects.toMatchObject({ status: 400 });
    const spent = await route({ allowed: false });
    await expect(
      spent.controller.catalogue('proj_cat', undefined, 'user_owner', spent.request, spent.reply),
    ).rejects.toMatchObject({ status: 429 });
    expect(spent.reply.header).toHaveBeenCalledWith('retry-after', '9');
    expect(spent.repositories.authorize).not.toHaveBeenCalled();
  });
});
