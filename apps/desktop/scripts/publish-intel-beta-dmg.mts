#!/usr/bin/env node
/**
 * Purpose: Publish the Intel Mac beta DMG beside a release's archives, outside the qualified installer catalog.
 * Why: Intel Macs have no qualifying host (hosted Intel runners have no WebGL), so the Intel DMG is offered as beta on
 * the download page. It wraps the same signed, notarized Intel app as `Tau-macos-x64.zip` and never enters
 * `latest/installers.json`.
 * Environment: DESKTOP_RELEASE_TAG, DESKTOP_ASSETS_DIR (holding Tau-macos-x64.dmg), DESKTOP_R2_BUCKET,
 * DESKTOP_R2_ENDPOINT and AWS credentials.
 * Usage: pnpm nx run desktop:publish-intel-beta-dmg
 * Exit: nonzero when an immutable object holds other bytes or a public readback differs.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { z } from 'zod';

// oxlint-disable-next-line no-restricted-imports -- Readback is script-owned, not a runtime export.
import { verifyMirrorReadback } from './mirror-readback.mjs';
// oxlint-disable-next-line no-restricted-imports -- Release-publication helper, script-owned like the readback.
import { awsRetryEnvironment, awsRetryOptions } from './aws-retry.mjs';

import { desktopReleaseBaseUrl, desktopReleaseIdentity } from '#shared/desktop-release.js';

/** The Intel Mac beta disk image's published name. */
export const intelBetaDmgName = 'Tau-macos-x64.dmg';

/** What publication needs from its surroundings, so the decisions can be tested without a bucket. */
export type IntelBetaDmgDependencies = {
  /** The object's SHA-256, or undefined when the key does not exist. */
  readonly existing: (key: string) => Promise<string | undefined>;
  readonly put: (key: string, immutable: boolean) => Promise<void>;
  readonly copy: (source: string, key: string) => Promise<void>;
  /**
   * The release the channel's Intel update feed (`latest/desktop-update-darwin-x64.json`) currently serves, which is
   * also the release behind `latest/Tau-macos-x64.zip`. Staging promotes most candidates without Intel, so this can
   * trail `latest/download.json`.
   */
  readonly latestTag: () => Promise<string>;
  readonly verify: (url: string, sha256: string, size: number) => Promise<void>;
  readonly log: (message: string) => void;
};

/**
 * Write `releases/<tag>/Tau-macos-x64.dmg` once, then point `latest/Tau-macos-x64.dmg` at it only while the tag is the
 * release the channel's Intel feed serves, so the latest DMG always wraps the same build as the latest Intel ZIP.
 * @param options - Release tag, the DMG's digest and size, and the side effects.
 * @returns Whether the latest pointer moved.
 */
export const publishIntelBetaDmg = async (options: {
  tag: string;
  sha256: string;
  size: number;
  dependencies: IntelBetaDmgDependencies;
}): Promise<{ latest: boolean }> => {
  const { tag, sha256, size, dependencies } = options;
  desktopReleaseIdentity(tag);
  const release = `releases/${tag}/${intelBetaDmgName}`;
  const base = desktopReleaseBaseUrl(tag);
  const existing = await dependencies.existing(release);
  if (existing === undefined) {
    await dependencies.put(release, true);
  } else if (existing !== sha256) {
    throw new Error(`Refusing to replace immutable ${release}`);
  }
  await dependencies.verify(`${base}/${intelBetaDmgName}`, sha256, size);
  const served = await dependencies.latestTag();
  if (served !== tag) {
    dependencies.log(`${tag} is not the Intel feed's release (${served}); latest/${intelBetaDmgName} is unchanged.`);
    return { latest: false };
  }
  await dependencies.copy(release, `latest/${intelBetaDmgName}`);
  await dependencies.verify(`${base.split('/releases/')[0]}/latest/${intelBetaDmgName}`, sha256, size);
  dependencies.log(`Published ${intelBetaDmgName} for ${tag} and pointed latest at it.`);
  return { latest: true };
};

const intelFeed = z.object({
  currentRelease: z.string(),
  releases: z.array(z.object({ version: z.string(), updateTo: z.object({ name: z.string() }) })),
});

/**
 * Read the release tag the channel's Intel update feed currently serves.
 * @param tag - Any tag on the channel, which selects its download origin.
 * @param fetcher - The HTTP client, injectable for tests.
 * @returns The `updateTo.name` of the feed entry whose version is `currentRelease`.
 */
export const intelFeedTag = async (tag: string, fetcher: typeof fetch = fetch): Promise<string> => {
  const url = `${desktopReleaseBaseUrl(tag).split('/releases/')[0]}/latest/desktop-update-darwin-x64.json`;
  const response = await fetcher(url, { cache: 'no-store', redirect: 'error' });
  if (!response.ok) {
    throw new Error(`latest/desktop-update-darwin-x64.json answered ${response.status}`);
  }
  const feed = intelFeed.parse(await response.json());
  const current = feed.releases.find((release) => release.version === feed.currentRelease);
  if (!current) {
    throw new Error(`The Intel feed lists no entry for its current release ${feed.currentRelease}`);
  }
  return current.updateTo.name;
};

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
};

const digest = async (path: string): Promise<string> => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    hash.update(Buffer.from(chunk));
  }
  return hash.digest('hex');
};

const main = async (): Promise<void> => {
  const tag = required('DESKTOP_RELEASE_TAG');
  const path = resolve(required('DESKTOP_ASSETS_DIR'), intelBetaDmgName);
  const bucket = required('DESKTOP_R2_BUCKET');
  const endpoint = required('DESKTOP_R2_ENDPOINT');
  const s3 = (args: string[]): string =>
    execFileSync('aws', ['--endpoint-url', endpoint, ...awsRetryOptions, 's3api', ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: awsRetryEnvironment(),
    });
  const headers = [
    '--content-type',
    'application/x-apple-diskimage',
    '--content-disposition',
    `attachment; filename="${intelBetaDmgName}"`,
  ];
  const sha256 = await digest(path);
  const { size } = await stat(path);
  await publishIntelBetaDmg({
    tag,
    sha256,
    size,
    dependencies: {
      existing: async (key) => {
        const copy = resolve(required('DESKTOP_ASSETS_DIR'), 'existing-object');
        try {
          s3(['get-object', '--bucket', bucket, '--key', key, copy]);
        } catch (error) {
          if (
            error &&
            typeof error === 'object' &&
            'stderr' in error &&
            /\((?:NoSuchKey|404)\)/u.test(String(error.stderr))
          ) {
            return undefined;
          }
          throw error;
        }
        return digest(copy);
      },
      put: async (key, immutable) => {
        s3([
          'put-object',
          '--bucket',
          bucket,
          '--key',
          key,
          '--body',
          path,
          ...headers,
          '--cache-control',
          immutable ? 'public, max-age=31536000, immutable' : 'no-store',
          ...(immutable ? ['--if-none-match', '*'] : []),
        ]);
      },
      copy: async (source, key) => {
        s3([
          'copy-object',
          '--bucket',
          bucket,
          '--key',
          key,
          // The AWS CLI URL-encodes the copy source itself; a pre-encoded `@` becomes `%2540` and misses the key.
          '--copy-source',
          `${bucket}/${source}`,
          '--metadata-directive',
          'REPLACE',
          '--cache-control',
          'no-store',
          ...headers,
        ]);
      },
      latestTag: async () => intelFeedTag(tag),
      verify: async (url, expected, bytes) =>
        verifyMirrorReadback({ url, name: intelBetaDmgName, sha256: expected, size: bytes }),
      log: (message) => {
        console.log(message);
      },
    },
  });
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
