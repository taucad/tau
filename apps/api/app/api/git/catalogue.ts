import { fileLinkRepositoryMaximumBytes } from '@taucad/file-links';
import { listingKeyFor } from '@taucad/api-git-core/store/listing-key';
import { indexKeyFor } from '@taucad/api-git-core/store/manifest';
import type { Manifest } from '@taucad/api-git-core/store/manifest';
import type { RepositoryLocator, RepositoryStore } from '@taucad/api-git-core/store/port';

/**
 * The catalogue (charter D8, EQ3): everything a cold open reads before it
 * reads an object, in one authenticated request —
 * `GET /v1/projects/:projectId/git/catalogue`.
 *
 * It answers from the manifest alone (no lease, no git): the refs of the
 * families the client syncs, a files link to each listed branch tip's head
 * listing, and for every live pack a files link to its stored `.idx` and one
 * to the pack for Range reads. It never carries a pack body, and nothing it
 * names lets a client read an object outside what the refs it returned reach:
 * the packs are shared by every ref family (compaction folds them), but the
 * client's reads are scoped by reachability from these refs (review B5), so
 * operation logs and unsynced chats are never requested. The route itself is
 * `catalogue.controller.ts`.
 *
 * `refs/tau/ops/*` is never listed, whatever is asked, and neither is any ref
 * outside the three families: host-local refs never reach the manifest, and a
 * family the client does not name is not returned.
 */

/** The catalogue format this build answers. */
export const catalogueFormat = 1;

/** The ref families a catalogue can carry, and the ref prefix of each. */
export const catalogueFamilies = {
  heads: 'refs/heads/',
  tags: 'refs/tags/',
  chats: 'refs/tau/chats/',
} as const;

export type CatalogueFamily = keyof typeof catalogueFamilies;

/** The families a request that names none gets: what a cold open of authored content needs. */
export const defaultCatalogueFamilies: readonly CatalogueFamily[] = ['heads', 'tags'];

/** How long the catalogue's links live: the LFS batch's transfer lifetime. Seconds. */
export const catalogueLinkSeconds = 900;

/** Catalogue reads per caller per window: one per open, with room for reconnects. */
export const catalogueReadsPerWindow = 60;

/** One signed link and the bytes it serves. */
export type CatalogueLink = { readonly href: string; readonly bytes: number };

/** One live pack: its key, its size, and the links to its stored index and to its body by Range. */
export type CataloguePack = {
  readonly key: string;
  readonly bytes: number;
  readonly index: CatalogueLink;
  readonly pack: CatalogueLink;
};

/** The answer. */
export type Catalogue = {
  readonly format: typeof catalogueFormat;
  readonly generation: number;
  /** The returned families' refs, in name order. */
  readonly refs: ReadonlyArray<{ readonly ref: string; readonly oid: string; readonly peeled?: string }>;
  /** The head listing of each returned branch tip that has one. */
  readonly listings: ReadonlyArray<{ readonly commit: string } & CatalogueLink>;
  readonly packs: readonly CataloguePack[];
  /**
   * Whether every live pack is here: `false` when one has no stored index or
   * no link, and then an object may be reachable only through smart HTTP.
   */
  readonly complete: boolean;
  /** Unix seconds after which the links are refused. */
  readonly expiresAt: number;
};

/**
 * The families a `refs` query names.
 *
 * @param query - `heads,tags,chats` or any subset; absent for the default. A
 * repeated `refs` parameter arrives as an array and is refused like any other
 * value that is not one string.
 * @returns The families, or `undefined` when the query names anything else.
 */
export const parseCatalogueFamilies = (query: unknown): readonly CatalogueFamily[] | undefined => {
  if (query === undefined || query === '') {
    return defaultCatalogueFamilies;
  }
  if (typeof query !== 'string') {
    return undefined;
  }
  const named = query.split(',');
  return named.every((family): family is CatalogueFamily => Object.hasOwn(catalogueFamilies, family))
    ? [...new Set(named)]
    : undefined;
};

/** What {@link buildCatalogue} needs besides the manifest. */
export type CatalogueSources = {
  readonly families: readonly CatalogueFamily[];
  /** Stored sizes by repository-relative key: the `.idx` beside each pack, and each listing. */
  readonly sizes: ReadonlyMap<string, number>;
  /** A files link for one repository-relative key, or `undefined` when the key cannot be served. */
  readonly sign: (key: string, bytes: number) => Promise<string | undefined>;
  readonly expiresAt: number;
};

/**
 * The catalogue of one manifest.
 *
 * @param manifest - The committed manifest.
 * @param sources - The families asked for, the stored sizes and the signer.
 * @returns The catalogue.
 */
export const buildCatalogue = async (manifest: Manifest, sources: CatalogueSources): Promise<Catalogue> => {
  const prefixes = sources.families.map((family) => catalogueFamilies[family]);
  const references = Object.entries(manifest.refs)
    .filter(([name]) => prefixes.some((prefix) => name.startsWith(prefix)))
    .toSorted(([left], [right]) => (left < right ? -1 : 1))
    .map(([ref, tip]) => ({ ref, oid: tip.oid, ...(tip.peeled === undefined ? {} : { peeled: tip.peeled }) }));
  const heads = [
    ...new Set(references.filter((entry) => entry.ref.startsWith('refs/heads/')).map((entry) => entry.oid)),
  ];
  const listings = await Promise.all(
    heads.map(async (commit) => {
      const key = listingKeyFor(commit);
      const bytes = sources.sizes.get(key);
      const href = bytes === undefined ? undefined : await sources.sign(key, bytes);
      return href === undefined || bytes === undefined ? undefined : { commit, href, bytes };
    }),
  );
  const packs = await Promise.all(
    manifest.packs.map(async (pack): Promise<CataloguePack | undefined> => {
      const indexKey = indexKeyFor(pack.key);
      const indexBytes = sources.sizes.get(indexKey);
      if (!pack.indexStored || indexBytes === undefined) {
        return undefined;
      }
      /* A pack past what a link can carry is left out, and the catalogue says it is incomplete. */
      if (pack.bytes > fileLinkRepositoryMaximumBytes || indexBytes > fileLinkRepositoryMaximumBytes) {
        return undefined;
      }
      const [index, body] = await Promise.all([sources.sign(indexKey, indexBytes), sources.sign(pack.key, pack.bytes)]);
      return index === undefined || body === undefined
        ? undefined
        : {
            key: pack.key,
            bytes: pack.bytes,
            index: { href: index, bytes: indexBytes },
            pack: { href: body, bytes: pack.bytes },
          };
    }),
  );
  const served = packs.filter((pack) => pack !== undefined);
  return {
    format: catalogueFormat,
    generation: manifest.generation,
    refs: references,
    listings: listings.filter((listing) => listing !== undefined),
    packs: served,
    complete: served.length === manifest.packs.length,
    expiresAt: sources.expiresAt,
  };
};

/**
 * The stored sizes a catalogue needs, in one listing of `packs/` and one
 * listing per branch tip of its head listing's own key.
 *
 * @param store - The repository store.
 * @param locator - The repository.
 * @param heads - The branch tips whose listings are wanted.
 * @returns Size by repository-relative key.
 */
export const catalogueSizes = async (
  store: RepositoryStore,
  locator: RepositoryLocator,
  heads: readonly string[],
): Promise<ReadonlyMap<string, number>> => {
  const sizes = new Map<string, number>();
  const listed = new Set(heads.map((commit) => listingKeyFor(commit)));
  const collect = async (prefix: string): Promise<void> => {
    for await (const stored of store.listObjects(locator, prefix)) {
      if (prefix !== 'listings/' || listed.has(stored.key)) {
        sizes.set(stored.key, stored.bytes);
      }
    }
  };
  /* One LIST per prefix, however many heads: the listings are few and small. */
  await Promise.all([collect('packs/'), ...(heads.length === 0 ? [] : [collect('listings/')])]);
  return sizes;
};
