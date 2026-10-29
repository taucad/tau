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

/** Refuse unsupported consumer runs before observing the host or creating qualification state. */
export const assertQualificationConsumerScope = (options: {
  kind: 'ci' | 'vm';
  route: string;
  scope: string | undefined;
  channel: string;
}): void => {
  if (options.kind !== 'vm') {
    return;
  }
  const expected =
    options.route === 'windows-nsis' ? 'windows' : options.route.startsWith('macos-') ? 'macos' : undefined;
  if (!expected || options.scope !== expected || options.channel !== 'staging') {
    throw new Error('Consumer acceptance requires its staging platform scope');
  }
};

/**
 * Keep Linux staging evidence pinned to a trusted ancestor; other qualification scopes remain exact-source. The
 * Mac-only staging scope stays exact-source because its receipts feed publication, whose provenance requires the
 * qualification run's head to equal the candidate source.
 */
export const assertQualificationSource = (options: {
  sourceCommit: string;
  workflowCommit: string;
  scope: string;
  channel: string;
}): void => {
  if (
    !/^[a-f\d]{40}$/u.test(options.sourceCommit) ||
    !/^[a-f\d]{40}$/u.test(options.workflowCommit) ||
    !['all', 'linux', 'macos', 'windows'].includes(options.scope) ||
    !['staging', 'production'].includes(options.channel) ||
    (options.scope !== 'all' && options.channel !== 'staging')
  ) {
    throw new Error('Invalid qualification source scope/channel');
  }
  if (options.scope !== 'linux' && options.sourceCommit !== options.workflowCommit) {
    throw new Error('Qualification requires the workflow exact source');
  }
  execFileSync('git', ['merge-base', '--is-ancestor', options.sourceCommit, options.workflowCommit]);
};

/** Fetch signed candidates at trusted main ancestors without confusing tested source with harness source. */
export const fetchQualificationCandidates = async (options: {
  runIds: readonly [string, string, string];
  directory: string;
  sourceCommit: string;
  scope: string;
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
          TAU_DESKTOP_QUALIFICATION_SCOPE: options.scope,
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
  assertQualificationSource({
    sourceCommit: c.manifest.sourceCommit,
    workflowCommit: options.sourceCommit,
    scope: options.scope,
    channel: c.manifest.channel,
  });
  execFileSync('git', ['merge-base', '--is-ancestor', a.manifest.sourceCommit, c.manifest.sourceCommit]);
  execFileSync('git', ['merge-base', '--is-ancestor', b.manifest.sourceCommit, c.manifest.sourceCommit]);
  const numeric = (version: string) => version.split('.').reduce((total, part) => total * 100 + Number(part), 0);
  if (
    a.manifest.channel !== c.manifest.channel ||
    b.manifest.channel !== c.manifest.channel ||
    numeric(a.manifest.version) >= numeric(b.manifest.version) ||
    numeric(b.manifest.version) >= numeric(c.manifest.version)
  ) {
    throw new Error('Qualification chain must increase within one channel and end at the admitted candidate source');
  }
  return [a, b, c];
};
