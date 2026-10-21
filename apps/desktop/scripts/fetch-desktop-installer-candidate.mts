#!/usr/bin/env node
/** Fetch one trusted candidate artifact with verified GitHub archive digest before extracting flat files. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, closeSync, openSync } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
const main = async (): Promise<void> => {
  const runId = z
    .string()
    .regex(/^[1-9]\d*$/u)
    .parse(process.env['TAU_INSTALLER_CANDIDATE_RUN_ID']);
  const root = resolve(z.string().min(1).parse(process.env['DESKTOP_ASSETS_DIR']));
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
      id: z.number(),
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
  execFileSync('git', [
    'merge-base',
    '--is-ancestor',
    run.head_sha,
    z.string().min(1).parse(process.env['GITHUB_SHA']),
  ]);
  const list = z
    .object({
      artifacts: z.array(
        z.object({
          id: z.number(),
          name: z.string(),
          expired: z.boolean(),
          digest: z.string(),
          // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external GitHub/AWS wire field exactly.
          workflow_run: z.object({ id: z.number(), head_sha: z.string() }),
        }),
      ),
    })
    .parse(api(`actions/runs/${runId}/artifacts?per_page=100`));
  const matches = list.artifacts.filter((entry) => entry.name === 'desktop-installer-candidate');
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
  await mkdir(root, { recursive: false });
  const zip = resolve(root, 'candidate.zip');
  const fd = openSync(zip, 'wx');
  try {
    execFileSync('gh', ['api', `repos/taucad/tau/actions/artifacts/${artifact.id}/zip`], {
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
  if (`sha256:${hash.digest('hex')}` !== artifact.digest) {
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
};
await main();
