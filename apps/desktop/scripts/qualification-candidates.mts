/* eslint-disable @typescript-eslint/naming-convention -- Preserve external environment and Squirrel wire field names. */
/** Fetch independently assembled candidates through the existing GitHub digest/provenance admission. */
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseDesktopArtifactManifest } from '#shared/desktop-release.js';
import type { DesktopArtifactManifest } from '#shared/desktop-release.js';
// oxlint-disable-next-line no-restricted-imports -- Shared qualification transport validates the exact admitted artifact bytes.
import { verifyQualificationMirrorObject } from './qualification-mirror.mjs';

export type QualificationCandidateInput = {
  manifest: DesktopArtifactManifest;
  artifactDirectory: string;
  runId: string;
};

/** Final candidate source must be this protected main dispatch; older baselines must be its ancestors. */
export const fetchQualificationCandidates = async (options: {
  runIds: readonly [string, string, string];
  directory: string;
  sourceCommit: string;
}): Promise<readonly [QualificationCandidateInput, QualificationCandidateInput, QualificationCandidateInput]> => {
  if (!/^[a-f\d]{40}$/u.test(options.sourceCommit) || new Set(options.runIds).size !== 3) {
    throw new Error('Qualification requires exact source and three distinct candidate runs');
  }
  const fetchOne = async (runId: string, stage: string): Promise<QualificationCandidateInput> => {
    if (!/^[1-9]\d*$/u.test(runId)) {
      throw new Error('Invalid candidate run ID');
    }
    const artifactDirectory = resolve(options.directory, stage);
    execFileSync(
      process.execPath,
      ['--import', '@oxc-node/core/register', 'apps/desktop/scripts/fetch-desktop-installer-candidate.mts'],
      {
        env: {
          ...process.env,
          TAU_INSTALLER_CANDIDATE_RUN_ID: runId,
          DESKTOP_ASSETS_DIR: artifactDirectory,
          GITHUB_SHA: options.sourceCommit,
        },
        stdio: 'inherit',
        timeout: 900_000,
      },
    );
    const manifest = parseDesktopArtifactManifest(
      JSON.parse(await readFile(join(artifactDirectory, 'desktop-artifacts.json'), 'utf8')),
    );
    execFileSync('git', ['merge-base', '--is-ancestor', manifest.sourceCommit, options.sourceCommit]);
    for (const artifact of manifest.artifacts) {
      // oxlint-disable-next-line no-await-in-loop -- Hash large candidate payloads sequentially to bound memory.
      await verifyQualificationMirrorObject({
        path: join(artifactDirectory, artifact.name),
        sha256: artifact.sha256,
        size: artifact.size,
        contentType: 'application/octet-stream',
      });
    }
    return { manifest, artifactDirectory, runId };
  };
  const a = await fetchOne(options.runIds[0], 'a');
  const b = await fetchOne(options.runIds[1], 'b');
  const c = await fetchOne(options.runIds[2], 'c');
  const numeric = (version: string) => version.split('.').reduce((total, part) => total * 100 + Number(part), 0);
  if (
    a.manifest.channel !== c.manifest.channel ||
    b.manifest.channel !== c.manifest.channel ||
    c.manifest.sourceCommit !== options.sourceCommit ||
    numeric(a.manifest.version) >= numeric(b.manifest.version) ||
    numeric(b.manifest.version) >= numeric(c.manifest.version)
  ) {
    throw new Error('Qualification chain must increase within one channel and end at the workflow exact source');
  }
  return [a, b, c];
};
