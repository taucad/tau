import type { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { isS3ObjectMissing } from '#storage/object-storage.service.js';
import type { ObjectStorageService } from '#storage/object-storage.service.js';
import { lfsObjectLocations } from '#api/git/lfs-keys.js';
import { decodeManifest } from '#api/git/store/manifest.js';
import type { Manifest } from '#api/git/store/manifest.js';
import type { RepositoryLocator, RepositoryStore, StoredObject } from '#api/git/store/port.js';

/**
 * What the copier reads from the primary (R2), with the read-only token
 * `tau-mirror` holds (W13 Finding 5). Reads only: the token cannot write, and
 * the port offers nothing that would.
 */
export type MirrorSource = {
  /** The current manifest's bytes, verbatim, and their decoding; `undefined` when the store holds none. */
  readManifest(locator: RepositoryLocator): Promise<{ bytes: Uint8Array<ArrayBuffer>; manifest: Manifest } | undefined>;
  /** A repository-relative object. An absent key rejects with `RepositoryStoreError` `missing-pack`. */
  open(locator: RepositoryLocator, key: string): Promise<Readable>;
  /** Repository-relative keys under `prefix`. */
  list(locator: RepositoryLocator, prefix: string): AsyncIterable<StoredObject>;
  /** One LFS object's bytes, from its tenant key or the pre-D24 key; `undefined` when neither holds it. */
  openLfs(locator: RepositoryLocator, oid: string): Promise<Readable | undefined>;
};

/** The primary as the API stores it: `S3RepositoryStore` for repositories, the driver for LFS. */
export class R2MirrorSource implements MirrorSource {
  public constructor(
    private readonly store: RepositoryStore,
    private readonly driver: ObjectStorageService,
  ) {}

  public async readManifest(
    locator: RepositoryLocator,
  ): Promise<{ bytes: Uint8Array<ArrayBuffer>; manifest: Manifest } | undefined> {
    const read = await this.store.readManifest(locator);
    return read === undefined ? undefined : { bytes: read.manifest, manifest: decodeManifest(read.manifest) };
  }

  public async open(locator: RepositoryLocator, key: string): Promise<Readable> {
    return this.store.getObject(locator, key);
  }

  public list(locator: RepositoryLocator, prefix: string): AsyncIterable<StoredObject> {
    return this.store.listObjects(locator, prefix);
  }

  public async openLfs(locator: RepositoryLocator, oid: string): Promise<Readable | undefined> {
    for (const location of lfsObjectLocations(locator.ownerId, locator.projectId, oid)) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- the legacy key is read only when the tenant key is absent
        const blob = await this.driver.getBlob(location);
        return blob.body;
      } catch (error) {
        if (!isS3ObjectMissing(error)) {
          throw error;
        }
      }
    }
    return undefined;
  }
}

/** Reads a small object whole, for push-log segments whose `previous` the copier follows. */
export const readWhole = async (stream: Readable): Promise<Uint8Array<ArrayBuffer>> =>
  new Uint8Array(await buffer(stream));
