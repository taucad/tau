/** Fetch receipts from trusted GitHub qualification runs with authenticated application and harness identities. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { parseDesktopAcceptanceReceipt } from '#shared/desktop-release.js';
import type { DesktopArtifactManifest } from '#shared/desktop-release.js';
// oxlint-disable-next-line no-restricted-imports -- Publication scope is owned by the adjacent admission gate.
import type { DesktopPublicationScope } from './desktop-route-publication.mjs';
/* oxlint-disable no-restricted-imports -- Reuse authenticated candidate admission and the producer's binding contract. */
import { admitInstallerCandidate } from './fetch-desktop-installer-candidate.mjs';
import { usesQualificationBinding, verifyQualificationBinding } from './qualification-binding.mjs';
/* oxlint-enable no-restricted-imports */
/** Fixed trusted producer workflows; each publication scope admits only its own receipt artifact names. */
const producer = {
  ci: {
    path: '.github/workflows/desktop-route-qualification.yml',
    artifact: { all: 'desktop-route-ci-receipts', macos: 'desktop-macos-ci-receipts' },
  },
  vm: {
    path: '.github/workflows/desktop-route-vm-acceptance.yml',
    artifact: { all: 'desktop-route-vm-receipts', macos: 'desktop-macos-vm-receipts' },
  },
} as const;

/** Run and artifact provenance is checked before parsing its receipt archive. */
export const verifyDesktopReceiptProvenance = (
  runInput: unknown,
  artifactInput: unknown,
  options: { environment: 'ci' | 'vm'; manifest: DesktopArtifactManifest; scope?: DesktopPublicationScope },
): { id: number; digest: string; workflowCommit: string; runId: number } => {
  const { environment, manifest } = options;
  const scope = options.scope ?? 'all';
  const run = z
    .object({
      id: z.number().int().positive(),
      event: z.literal('workflow_dispatch'),
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external GitHub/AWS wire field exactly.
      head_branch: z.literal('main'),
      status: z.literal('completed'),
      conclusion: z.literal('success'),
      path: z.literal(producer[environment].path),
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external GitHub/AWS wire field exactly.
      head_sha: usesQualificationBinding(scope, manifest.channel, environment)
        ? z.string().regex(/^[a-f\d]{40}$/u)
        : z.literal(manifest.sourceCommit),
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external GitHub/AWS wire field exactly.
      repository: z.object({ full_name: z.literal('taucad/tau') }),
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external GitHub/AWS wire field exactly.
      head_repository: z.object({ full_name: z.literal('taucad/tau') }),
    })
    .parse(runInput);
  const artifact = z
    .object({
      id: z.number().int().positive(),
      name: z.literal(producer[environment].artifact[scope]),
      expired: z.literal(false),
      digest: z.string().regex(/^sha256:[a-f\d]{64}$/u),
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external GitHub/AWS wire field exactly.
      workflow_run: z.object({ id: z.literal(run.id), head_sha: z.literal(run.head_sha) }),
    })
    .parse(artifactInput);
  return {
    id: artifact.id,
    digest: artifact.digest.slice('sha256:'.length),
    workflowCommit: run.head_sha,
    runId: run.id,
  };
};

/**
 * The fixed producer workflows are qualification gates, not assembly fixtures; absent producers fail closed. Only a
 * staging Mac-only publication may omit the VM run, recording clean-host acceptance as pending; a VM run that is named
 * is authenticated exactly as before.
 */
export const fetchDesktopQualifiedReceipts = async (
  manifest: DesktopArtifactManifest,
  root: string,
  runs: { ci: string; vm?: string | undefined; scope?: DesktopPublicationScope },
): Promise<unknown[]> => {
  const scope = runs.scope ?? 'all';
  if (runs.vm === undefined && (scope !== 'macos' || manifest.channel !== 'staging')) {
    throw new Error('Clean-host VM acceptance run is required outside staging Mac-only publication');
  }
  const api = (path: string): Uint8Array<ArrayBuffer> =>
    Uint8Array.from(
      execFileSync('gh', ['api', `repos/taucad/tau/${path}`], { maxBuffer: 8 * 1024 * 1024, timeout: 60_000 }),
    );
  const receipts: unknown[] = [];
  for (const environment of runs.vm === undefined ? (['ci'] as const) : (['ci', 'vm'] as const)) {
    const id = z
      .string()
      .regex(/^[1-9]\d*$/u)
      .parse(runs[environment]);
    const run = JSON.parse(new TextDecoder().decode(api(`actions/runs/${id}`))) as unknown;
    const artifacts = z
      .object({ artifacts: z.array(z.object({ name: z.string() }).loose()) })
      .parse(JSON.parse(new TextDecoder().decode(api(`actions/runs/${id}/artifacts?per_page=100`))));
    const matches = artifacts.artifacts.filter((entry) => entry.name === producer[environment].artifact[scope]);
    if (matches.length !== 1) {
      throw new Error('Missing or ambiguous trusted qualification artifact');
    }
    const admitted = verifyDesktopReceiptProvenance(run, matches[0], { environment, manifest, scope });
    if (String(admitted.runId) !== id) {
      throw new Error('Qualification API returned another run');
    }
    const archive = api(`actions/artifacts/${admitted.id}/zip`);
    if (createHash('sha256').update(archive).digest('hex') !== admitted.digest) {
      throw new Error('GitHub receipt archive digest differs');
    }
    const path = join(root, `${environment}-qualified-receipts.zip`);
    // oxlint-disable-next-line no-await-in-loop -- Persist only each authenticated bounded archive.
    await writeFile(path, archive);
    const names = execFileSync('unzip', ['-Z1', path], { encoding: 'utf8', timeout: 30_000 }).trim().split('\n');
    const bound = usesQualificationBinding(scope, manifest.channel, environment);
    const expectedNames = bound ? ['qualification-binding.json', 'route-receipts.json'] : ['route-receipts.json'];
    if (JSON.stringify([...names].sort()) !== JSON.stringify(expectedNames)) {
      throw new Error('Unexpected qualification archive members');
    }
    if (bound) {
      const publicationCommit = z
        .string()
        .regex(/^[a-f\d]{40}$/u)
        .parse(process.env['GITHUB_SHA']);
      const candidate = admitInstallerCandidate({
        runId: z.string().parse(process.env['TAU_INSTALLER_CANDIDATE_RUN_ID']),
        workflowCommit: publicationCommit,
        scope,
      });
      const binding: unknown = JSON.parse(
        execFileSync('unzip', ['-p', path, 'qualification-binding.json'], {
          encoding: 'utf8',
          maxBuffer: 64 * 1024,
          timeout: 30_000,
        }),
      );
      verifyQualificationBinding(binding, {
        manifest,
        candidate,
        runId: admitted.runId,
        workflowCommit: admitted.workflowCommit,
        publicationCommit,
      });
    }
    const data = execFileSync('unzip', ['-p', path, 'route-receipts.json'], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      timeout: 30_000,
    });
    const parsed = z.array(z.unknown()).parse(JSON.parse(data));
    for (const input of parsed) {
      const receipt = parseDesktopAcceptanceReceipt(input, manifest);
      if (
        receipt.environment.kind !== environment ||
        receipt.logs !== `https://github.com/taucad/tau/actions/runs/${id}`
      ) {
        throw new Error('Receipt kind differs from trusted producer');
      }
      // The Mac clean-host producer writes only its own suite, with host facts the receipt parser already required.
      if (
        environment === 'vm' &&
        scope === 'macos' &&
        (receipt.suite !== 'clean-host-route-a-b-c-v1' || !receipt.environment.host)
      ) {
        throw new Error('Clean-host receipt lacks its producer suite or host facts');
      }
      receipts.push(receipt);
    }
  }
  return receipts;
};
