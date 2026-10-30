/* oxlint-disable new-cap, @typescript-eslint/consistent-type-imports -- NestJS decorators are factories and DI metadata needs runtime class imports */
import { Injectable } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  fileLinkLocationOfKey,
  fileLinkOrigin,
  importFileLinkSigningKey,
  parseFileLinkSigningSecret,
  signFileLink,
} from '@taucad/file-links';
import type { FileLinkKey } from '@taucad/file-links';
import type { Environment } from '#config/environment.config.js';
import type { StorageNamespace } from '#storage/storage.constants.js';
import { storageNamespacePrefixes } from '#storage/storage.constants.js';
import type { StorageTier } from '#storage/object-storage.service.js';

/** The settings the files link signer reads. */
export type FileLinksEnvironment = Pick<Environment, 'TAU_FILES_BASE_URL' | 'TAU_FILES_LINK_SIGNING_KEY'>;

/** What one download link is minted for: where the bytes are, and how many. */
export type FileLinkRequest = Readonly<{
  namespace: StorageNamespace;
  key: string;
  tier: StorageTier;
  size: number;
  expiresInSeconds: number;
}>;

/**
 * Mints `files.<zone>` links for private LFS downloads (files service blueprint §3).
 *
 * On when `TAU_FILES_BASE_URL` and `TAU_FILES_LINK_SIGNING_KEY` are both set;
 * with either unset, {@link FileLinksService.sign} answers `undefined` and the
 * caller presigns as before. That is the rollback: unset the base URL and
 * redeploy. The signing key is imported once, sign-only and non-extractable,
 * and the config schema has already refused a malformed one at boot.
 */
@Injectable()
export class FileLinksService implements OnModuleInit {
  readonly #origin: string | undefined;

  readonly #key: Promise<FileLinkKey> | undefined;

  public constructor(configService: ConfigService<FileLinksEnvironment, true>) {
    const baseUrl = configService.get('TAU_FILES_BASE_URL', { infer: true });
    const secret = configService.get('TAU_FILES_LINK_SIGNING_KEY', { infer: true });
    /* An empty value is unset too: a rollback that blanks `TAU_FILES_BASE_URL` must not fail boot where config is not validated. */
    if (baseUrl === undefined || baseUrl === '' || secret === undefined || secret === '') {
      return;
    }
    this.#origin = fileLinkOrigin(baseUrl).origin;
    this.#key = importFileLinkSigningKey(parseFileLinkSigningSecret(secret));
    /* Handled here so a bad key cannot surface as an unhandled rejection; `onModuleInit` still fails boot on it. */
    // oxlint-disable-next-line promise/prefer-await-to-then -- marks the rejection handled without awaiting it.
    this.#key.catch(() => undefined);
  }

  /**
   * Refuse to boot with a signing key whose kid names other key bytes: every
   * link would be refused at the Worker, and presigned links would be gone.
   */
  public async onModuleInit(): Promise<void> {
    await this.#key;
  }

  /** Whether downloads are served from the files host. */
  public get enabled(): boolean {
    return this.#key !== undefined;
  }

  /**
   * A files link for one private LFS object, or `undefined` when the files
   * host is off or cannot serve this location (any key outside the two LFS
   * layouts, or the public tier), so the caller presigns instead.
   *
   * @param request - The stored location, the object's size and the link's lifetime.
   * @returns The link, or `undefined`.
   */
  public async sign(request: FileLinkRequest): Promise<string | undefined> {
    if (this.#origin === undefined || this.#key === undefined || request.tier !== 'private') {
      return undefined;
    }
    const location = fileLinkLocationOfKey(`${storageNamespacePrefixes[request.namespace]}${request.key}`);
    if (location === undefined) {
      return undefined;
    }
    return signFileLink({
      baseUrl: this.#origin,
      location,
      size: request.size,
      expiresAt: Math.floor(Date.now() / 1000) + request.expiresInSeconds,
      key: await this.#key,
    });
  }
}
