/* eslint-disable @typescript-eslint/naming-convention -- Preserve external environment and Squirrel wire field names. */
/** Prepare only isolated managed-mirror feeds, preserving signed candidate descriptors byte-for-byte. */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
/* oxlint-disable no-restricted-imports -- These script-owned contracts are not application runtime exports. */
import { verifyDesktopRouteDescriptor } from './desktop-route-publication.mjs';
import type { QualificationCandidateInput } from './qualification-candidates.mjs';
import type { QualificationMirrorObject } from './qualification-mirror.mjs';
/* oxlint-enable no-restricted-imports */

export const qualificationArtifactObjects = (
  candidates: readonly QualificationCandidateInput[],
): Map<string, QualificationMirrorObject> =>
  new Map(
    candidates.flatMap(({ manifest, artifactDirectory }) =>
      manifest.artifacts.map(
        (artifact) =>
          [
            `/releases/${encodeURIComponent(manifest.tag)}/${artifact.name}`,
            {
              path: join(artifactDirectory, artifact.name),
              sha256: artifact.sha256,
              size: artifact.size,
              contentType: 'application/octet-stream',
            },
          ] as const,
      ),
    ),
  );

export const qualificationFeed = async (options: {
  candidate: QualificationCandidateInput;
  route: 'macos-zip' | 'macos-dmg' | 'windows-nsis' | 'linux-appimage';
  target: string;
  origin: string;
  keys: Readonly<Record<string, string>>;
  historical?: boolean;
}): Promise<{ name: string; object: QualificationMirrorObject }> => {
  const { candidate, route, target } = options;
  let path: string;
  let name: string;
  if (route === 'macos-zip' || route === 'macos-dmg') {
    const archive = candidate.manifest.artifacts.find((item) => item.target === target && item.kind === 'macos-zip');
    if (!archive) {
      throw new Error('Mac qualification requires exact updater ZIP');
    }
    name = `desktop-update-${target}.json`;
    path = join(candidate.artifactDirectory, `qualification-${name}`);
    await writeFile(
      path,
      JSON.stringify({
        channel: candidate.manifest.channel,
        sourceCommit: candidate.manifest.sourceCommit,
        currentRelease: candidate.manifest.version,
        releases: [
          {
            version: candidate.manifest.version,
            updateTo: {
              version: candidate.manifest.version,
              name: candidate.manifest.tag,
              url: `${options.origin}/releases/${encodeURIComponent(candidate.manifest.tag)}/${archive.name}`,
              pub_date: new Date().toISOString(),
              notes: 'Isolated qualification mirror',
            },
          },
        ],
      }),
      { flag: 'wx' },
    );
  } else {
    name = `desktop-update-${route}-x64.json`;
    path = join(candidate.artifactDirectory, name);
    verifyDesktopRouteDescriptor({
      manifest: candidate.manifest,
      route,
      document: JSON.parse(await readFile(path, 'utf8')),
      keys: options.keys,
      offer: !options.historical,
    });
  }
  const bytes = await readFile(path);
  return {
    name,
    object: {
      path,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      size: bytes.length,
      contentType: 'application/json',
    },
  };
};
