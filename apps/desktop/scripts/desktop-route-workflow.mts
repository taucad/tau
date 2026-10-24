#!/usr/bin/env node
/** Prepare a protected publication job; all candidate inputs stay data and every public mutation uses the publisher. */
import { execFileSync } from 'node:child_process';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { desktopReleaseIdentity, parseDesktopArtifactManifest } from '#shared/desktop-release.js';
/* oxlint-disable no-restricted-imports -- Adjacent release workflow helpers share one explicit publication boundary. */
import { desktopManifestDigest } from './desktop-route-publication.mjs';
import { requireDesktopPublicationAuthority } from './desktop-publication-authority.mjs';
import { publishDesktopRoutes } from './publish-desktop-routes.mjs';
/* oxlint-enable no-restricted-imports */
const main = async (): Promise<void> => {
  const channel = z.enum(['staging', 'production']).parse(process.env['CHANNEL']);
  const operation =
    process.env['GITHUB_EVENT_NAME'] === 'schedule'
      ? 'renew-routes'
      : z.enum(['promote-routes', 'renew-routes']).parse(process.env['REQUESTED_OPERATION']);
  await requireDesktopPublicationAuthority(channel, operation);
  const root = resolve(z.string().min(1).parse(process.env['DESKTOP_ASSETS_DIR']));
  const base = channel === 'production' ? 'https://downloads.tau.new' : 'https://downloads.taucad.dev';
  const download = async (path: string): Promise<string> => {
    const response = await fetch(`${base}/${path}`, {
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok || !response.body) {
      throw new Error('Completed publication metadata unavailable');
    }
    const chunks: Array<Uint8Array<ArrayBuffer>> = [];
    let length = 0;
    for await (const chunk of response.body) {
      length += chunk.byteLength;
      if (length > 1024 * 1024) {
        throw new Error('Publication metadata exceeds bound');
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  };
  let tag: string;
  if (operation === 'promote-routes') {
    tag = z.string().min(1).parse(process.env['REQUESTED_TAG']);
    if (desktopReleaseIdentity(tag).channel !== channel) {
      throw new Error('Requested candidate channel differs');
    }
    execFileSync(
      process.execPath,
      ['--import', '@oxc-node/core/register', 'apps/desktop/scripts/fetch-desktop-installer-candidate.mts'],
      { stdio: 'inherit' },
    );
  } else {
    await mkdir(root, { recursive: false });
    const completed = z
      .object({ tag: z.string(), channel: z.literal(channel), manifestSha256: z.string().regex(/^[a-f\d]{64}$/u) })
      .parse(JSON.parse(await download('latest/installer-completed.json')));
    tag = completed.tag;
    if (desktopReleaseIdentity(tag).channel !== channel) {
      throw new Error('Completed channel differs');
    }
    const text = await download(`releases/${encodeURIComponent(tag)}/desktop-artifacts.json`);
    const manifest = parseDesktopArtifactManifest(JSON.parse(text));
    if (desktopManifestDigest(manifest) !== completed.manifestSha256) {
      throw new Error('Completed manifest differs');
    }
    await writeFile(resolve(root, 'desktop-artifacts.json'), text);
    for (const route of ['windows-nsis', 'linux-appimage']) {
      if (!manifest.artifacts.some((item) => item.kind === route)) {
        continue;
      }
      const name = `desktop-update-${route}-x64.json`;
      // oxlint-disable-next-line no-await-in-loop -- Restore only immutable small metadata needed to renew this completed candidate.
      await writeFile(resolve(root, name), await download(`releases/${encodeURIComponent(tag)}/${name}`));
    }
  }
  const manifest = parseDesktopArtifactManifest(
    JSON.parse(await readFile(resolve(root, 'desktop-artifacts.json'), 'utf8')),
  );
  if (manifest.tag !== tag || manifest.channel !== channel) {
    throw new Error('Candidate identity differs');
  }
  process.env['DESKTOP_RELEASE_TAG'] = tag;
  process.env['TAU_DESKTOP_SOURCE_SHA'] = manifest.sourceCommit;
  if (operation === 'promote-routes') {
    const approved = z
      .string()
      .regex(/^[a-f\d]{64}$/u)
      .parse(process.env['APPROVED_DIGEST']);
    if (desktopManifestDigest(manifest) !== approved) {
      throw new Error('Operator approved a different manifest');
    }
    await writeFile(
      resolve(root, 'promotion-approval.json'),
      JSON.stringify({
        schemaVersion: 1,
        tag,
        channel,
        version: manifest.version,
        sourceCommit: manifest.sourceCommit,
        manifestSha256: approved,
        approved: true,
      }),
    );
    await publishDesktopRoutes('mirror-routes');
  }
  await appendFile(
    z.string().min(1).parse(process.env['GITHUB_ENV']),
    `DESKTOP_RELEASE_TAG=${tag}\nTAU_DESKTOP_SOURCE_SHA=${manifest.sourceCommit}\nTAU_ROUTE_OPERATION=${operation}\n`,
  );
};
await main();
