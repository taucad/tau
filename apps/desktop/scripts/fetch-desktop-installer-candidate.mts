#!/usr/bin/env node
/** Fetch one trusted candidate artifact with verified GitHub archive digest before extracting flat files. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, closeSync, openSync } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
// oxlint-disable-next-line no-restricted-imports -- Share the internal authenticated candidate metadata contract.
import type { InstallerCandidateProvenance } from './qualification-binding.mjs';
/** Re-admit immutable candidate metadata independently at every consumer boundary. */
export const admitInstallerCandidate = (options: {
  runId: string;
  workflowCommit: string;
  scope: string;
}): InstallerCandidateProvenance => {
  const runId = z
    .string()
    .regex(/^[1-9]\d*$/u)
    .parse(options.runId);
  const workflowCommit = z
    .string()
    .regex(/^[a-f\d]{40}$/u)
    .parse(options.workflowCommit);
  const api = (path: string): unknown =>
    JSON.parse(
      execFileSync('gh', ['api', `repos/taucad/tau/${path}`], {
        encoding: 'utf8',
        maxBuffer: 8 * 1024 * 1024,
        timeout: 60_000,
      }),
    ) as unknown;
  const run = z
    .object({
      id: z.literal(Number(runId)),
      status: z.literal('completed'),
      path: z.literal('.github/workflows/desktop-installer-candidate.yml'),
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external GitHub/AWS wire field exactly.
      head_branch: z.literal('main'),
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external GitHub/AWS wire field exactly.
      head_sha: z.string().regex(/^[a-f\d]{40}$/u),
      event: z.literal('workflow_dispatch'),
      conclusion: z.literal('success'),
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external GitHub/AWS wire field exactly.
      repository: z.object({ full_name: z.literal('taucad/tau') }),
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external GitHub/AWS wire field exactly.
      head_repository: z.object({ full_name: z.literal('taucad/tau') }),
    })
    .parse(api(`actions/runs/${runId}`));
  execFileSync('git', ['merge-base', '--is-ancestor', run.head_sha, workflowCommit]);
  const list = z
    .object({
      artifacts: z.array(
        z.object({
          id: z.number().int().positive(),
          name: z.string(),
          expired: z.boolean(),
          digest: z.string(),
          // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external GitHub/AWS wire field exactly.
          workflow_run: z.object({ id: z.number().int().positive(), head_sha: z.string() }),
        }),
      ),
    })
    .parse(api(`actions/runs/${runId}/artifacts?per_page=100`));
  const scope = z.enum(['all', 'linux', 'macos', 'windows']).parse(options.scope);
  // Windows consumer acceptance uses the existing all-platform candidate producer.
  const name = {
    all: 'desktop-installer-candidate',
    linux: 'desktop-linux-installer-candidate',
    macos: 'desktop-macos-installer-candidate',
    windows: 'desktop-installer-candidate',
  }[scope];
  const matches = list.artifacts.filter((entry) => entry.name === name);
  const artifact = matches[0];
  if (
    matches.length !== 1 ||
    !artifact ||
    artifact.expired ||
    artifact.workflow_run.id !== run.id ||
    artifact.workflow_run.head_sha !== run.head_sha ||
    !/^sha256:[a-f\d]{64}$/u.test(artifact.digest)
  ) {
    throw new Error('Candidate artifact provenance refused');
  }
  return {
    runId: run.id,
    workflowCommit: run.head_sha,
    artifactId: artifact.id,
    archiveSha256: artifact.digest.slice('sha256:'.length),
  };
};

/** Download and authenticate the archive before extracting; return metadata from GitHub, never extracted files. */
export const fetchInstallerCandidate = async (options: {
  runId: string;
  workflowCommit: string;
  scope: string;
  directory: string;
}): Promise<InstallerCandidateProvenance> => {
  const provenance = admitInstallerCandidate(options);
  const root = resolve(options.directory);
  await mkdir(root, { recursive: false });
  const zip = resolve(root, 'candidate.zip');
  const fd = openSync(zip, 'wx');
  try {
    execFileSync('gh', ['api', `repos/taucad/tau/actions/artifacts/${provenance.artifactId}/zip`], {
      stdio: ['ignore', fd, 'pipe'],
      timeout: 600_000,
    });
  } finally {
    closeSync(fd);
  }
  const archiveInfo = await stat(zip);
  if (archiveInfo.size > 5 * 1024 ** 3) {
    throw new Error('Candidate archive exceeds bounded upload size');
  }
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(zip)) {
    if (!(chunk instanceof Uint8Array)) {
      throw new TypeError('Expected binary candidate archive');
    }
    hash.update(chunk);
  }
  if (hash.digest('hex') !== provenance.archiveSha256) {
    throw new Error('Candidate archive digest differs');
  }
  const names = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8', timeout: 30_000 }).trim().split('\n');
  if (
    names.length > 40 ||
    new Set(names).size !== names.length ||
    names.some((name) => !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(name) || name === 'candidate.zip')
  ) {
    throw new Error('Candidate artifact must contain only bounded flat files');
  }
  execFileSync('unzip', ['-q', zip, '-d', root], { stdio: 'inherit', timeout: 600_000 });
  return provenance;
};
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await fetchInstallerCandidate({
      runId: z.string().parse(process.env['TAU_INSTALLER_CANDIDATE_RUN_ID']),
      workflowCommit: z.string().parse(process.env['GITHUB_SHA']),
      scope: process.env['TAU_DESKTOP_QUALIFICATION_SCOPE'] ?? 'all',
      directory: z.string().min(1).parse(process.env['DESKTOP_ASSETS_DIR']),
    });
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
