#!/usr/bin/env node
/**
 * Purpose: Prepare immutable desktop feeds, mirror qualified archives to R2, or promote a tested release.
 * Environment: DESKTOP_RELEASE_TAG, TAU_DESKTOP_SOURCE_SHA, DESKTOP_ASSETS_DIR; mirror/promote also
 * DESKTOP_R2_BUCKET, DESKTOP_R2_ENDPOINT and AWS credentials. Promotion requires ota-receipt.json.
 * Usage: pnpm nx run desktop:publish -- prepare|mirror|promote
 * Exit: nonzero on mismatched bytes, stale source, missing acceptance, or failed publication.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { z } from 'zod';

import { desktopArchiveName, desktopReleaseBaseUrl, desktopReleaseIdentity } from '#shared/desktop-release.js';
import { isNewerVersion } from '#main/updater.js';

const manifestSchema = z.object({
  tag: z.string(),
  version: z.string(),
  channel: z.enum(['staging', 'production']),
  sourceCommit: z.string().regex(/^[a-f\d]{40}$/u),
  assets: z.record(
    z.string(),
    z.object({ url: z.url(), sha256: z.string().regex(/^[a-f\d]{64}$/u), size: z.number().int().positive() }),
  ),
});

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
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
  const operation = process.argv[2];
  if (!['prepare', 'mirror', 'promote'].includes(operation ?? '')) {
    throw new Error('Expected prepare, mirror or promote');
  }
  const tag = required('DESKTOP_RELEASE_TAG');
  const { channel, version } = desktopReleaseIdentity(tag);
  const sourceCommit = required('TAU_DESKTOP_SOURCE_SHA');
  const root = resolve(required('DESKTOP_ASSETS_DIR'));
  await mkdir(root, { recursive: true });
  const platforms = ['darwin-arm64', 'linux-x64', 'win32-x64'];
  const archives = platforms.map((target) => {
    const [platform, arch] = target.split('-');
    return desktopArchiveName(platform!, arch!);
  });
  const feeds = platforms.map((target) => `desktop-update-${target}.json`);
  const files = [...archives, ...feeds, 'SHA256SUMS.txt', 'download.json'];
  const manifestPath = resolve(root, 'download.json');
  /* oxlint-disable no-await-in-loop -- Hash and upload large release archives serially to bound memory and preserve publication order. */
  if (operation === 'prepare') {
    const assets: z.infer<typeof manifestSchema>['assets'] = {};
    const sums: string[] = [];
    for (const [index, target] of platforms.entries()) {
      const archive = archives[index]!;
      const path = resolve(root, archive);
      const sha256 = await digest(path);
      const metadata = await stat(path);
      assets[target] = { url: `${desktopReleaseBaseUrl(tag)}/${archive}`, sha256, size: metadata.size };
      sums.push(`${sha256}  ${archive}`);
      await writeFile(
        resolve(root, feeds[index]!),
        JSON.stringify(
          {
            channel,
            sourceCommit,
            currentRelease: version,
            releases: [
              {
                version,
                updateTo: {
                  version,
                  name: tag,
                  url: assets[target].url,
                  // eslint-disable-next-line @typescript-eslint/naming-convention -- Squirrel JSON feed field.
                  pub_date: new Date().toISOString(),
                  notes: `Tau ${version} (${channel})`,
                },
              },
            ],
          },
          null,
          2,
        ) + '\n',
      );
    }
    await writeFile(
      manifestPath,
      JSON.stringify(manifestSchema.parse({ tag, channel, version, sourceCommit, assets }), null, 2) + '\n',
    );
    await writeFile(resolve(root, 'SHA256SUMS.txt'), sums.join('\n') + '\n');
    return;
  }
  const manifest = manifestSchema.parse(JSON.parse(await readFile(manifestPath, 'utf8')));
  if (
    manifest.tag !== tag ||
    manifest.sourceCommit !== sourceCommit ||
    manifest.version !== version ||
    manifest.channel !== channel
  ) {
    throw new Error('Release manifest identity disagrees with publication');
  }
  const bucket = required('DESKTOP_R2_BUCKET');
  const endpoint = required('DESKTOP_R2_ENDPOINT');
  const s3 = (args: string[]): string =>
    execFileSync('aws', ['--endpoint-url', endpoint, 's3api', ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const readObject = async (key: string, path: string): Promise<boolean> => {
    try {
      s3(['get-object', '--bucket', bucket, '--key', key, path]);
      return true;
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'stderr' in error &&
        /\((?:NoSuchKey|404)\)/u.test(String(error.stderr))
      ) {
        return false;
      }
      throw error;
    }
  };
  const put = (name: string, prefix: string, immutable: boolean): void => {
    s3([
      'put-object',
      '--bucket',
      bucket,
      '--key',
      `${prefix}/${name}`,
      '--body',
      resolve(root, name),
      '--content-type',
      name.endsWith('.json')
        ? 'application/json'
        : name.endsWith('.zip')
          ? 'application/zip'
          : 'application/octet-stream',
      '--cache-control',
      immutable ? 'public, max-age=31536000, immutable' : 'no-store',
      ...(name.startsWith('Tau-') ? ['--content-disposition', `attachment; filename="${name}"`] : []),
      ...(immutable ? ['--if-none-match', '*'] : []),
    ]);
  };
  if (operation === 'mirror') {
    for (const name of files) {
      const path = resolve(root, name);
      const key = `releases/${tag}/${name}`;
      const existing = resolve(root, 'existing-object');
      if (await readObject(key, existing)) {
        if ((await digest(existing)) !== (await digest(path))) {
          throw new Error(`Refusing to replace immutable ${key}`);
        }
      } else {
        put(name, `releases/${tag}`, true);
      }
      const response = await fetch(`${desktopReleaseBaseUrl(tag)}/${name}`);
      if (!response.ok || !response.body) {
        throw new Error(`Public mirror unavailable: ${name} (${response.status})`);
      }
      const hash = createHash('sha256');
      for await (const chunk of response.body) {
        hash.update(Buffer.from(chunk));
      }
      if (hash.digest('hex') !== (await digest(path))) {
        throw new Error(`Public mirror bytes disagree: ${name}`);
      }
    }
    return;
  }
  const acceptance = z.object({
    status: z.literal('passed'),
    tag: z.literal(tag),
    sourceCommit: z.literal(sourceCommit),
    version: z.literal(version),
  });
  acceptance.parse(JSON.parse(await readFile(resolve(root, 'ota-receipt.json'), 'utf8')));
  const previousPath = resolve(root, 'previous-download.json');
  if (await readObject('latest/promotion.json', previousPath)) {
    const previous = manifestSchema.parse(JSON.parse(await readFile(previousPath, 'utf8')));
    if (previous.channel !== channel) {
      throw new Error('Current pointer belongs to another channel');
    }
    if (
      !isNewerVersion(version, previous.version) &&
      (previous.version !== version || previous.tag !== tag || previous.sourceCommit !== sourceCommit)
    ) {
      throw new Error('Refusing stale or conflicting channel promotion');
    }
    execFileSync('git', ['merge-base', '--is-ancestor', previous.sourceCommit, sourceCommit]);
  }
  // Record the monotonic intent before any public pointer changes. A failed partial
  // promotion can be retried, but an older queued run cannot overwrite its feed.
  await writeFile(resolve(root, 'promotion.json'), JSON.stringify(manifest) + '\n');
  put('promotion.json', 'latest', false);
  for (const archive of archives) {
    s3([
      'copy-object',
      '--bucket',
      bucket,
      '--key',
      `latest/${archive}`,
      '--copy-source',
      `${bucket}/releases/${encodeURIComponent(tag)}/${archive}`,
      '--metadata-directive',
      'REPLACE',
      '--cache-control',
      'no-store',
      '--content-type',
      archive.endsWith('.zip') ? 'application/zip' : 'application/gzip',
      '--content-disposition',
      `attachment; filename="${archive}"`,
    ]);
  }
  for (const name of [...feeds, 'download.json']) {
    put(name, 'latest', false);
  }
  const publicResponse = await fetch(`${desktopReleaseBaseUrl(tag).split('/releases/')[0]}/latest/download.json`, {
    cache: 'no-store',
  });
  if (!publicResponse.ok || JSON.stringify(await publicResponse.json()) !== JSON.stringify(manifest)) {
    throw new Error('Public latest manifest did not match the promoted release');
  }
  /* oxlint-enable no-await-in-loop */
  console.log(`Promoted ${tag} to ${channel}`);
};
try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
