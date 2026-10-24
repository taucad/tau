/** Fetch receipts only from trusted same-source GitHub qualification runs; never trust receipt labels alone. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { parseDesktopAcceptanceReceipt } from '#shared/desktop-release.js';
import type { DesktopArtifactManifest } from '#shared/desktop-release.js';
const producer = {
  ci: { path: '.github/workflows/desktop-route-qualification.yml', artifact: 'desktop-route-ci-receipts' },
  vm: { path: '.github/workflows/desktop-route-vm-acceptance.yml', artifact: 'desktop-route-vm-receipts' },
} as const;

/** Run and artifact provenance is checked before parsing its receipt archive. */
export const verifyDesktopReceiptProvenance = (
  runInput: unknown,
  artifactInput: unknown,
  options: { environment: 'ci' | 'vm'; manifest: DesktopArtifactManifest },
): { id: number; digest: string } => {
  const { environment, manifest } = options;
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
      head_sha: z.literal(manifest.sourceCommit),
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external GitHub/AWS wire field exactly.
      repository: z.object({ full_name: z.literal('taucad/tau') }),
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external GitHub/AWS wire field exactly.
      head_repository: z.object({ full_name: z.literal('taucad/tau') }),
    })
    .parse(runInput);
  const artifact = z
    .object({
      id: z.number().int().positive(),
      name: z.literal(producer[environment].artifact),
      expired: z.literal(false),
      digest: z.string().regex(/^sha256:[a-f\d]{64}$/u),
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Preserve the external GitHub/AWS wire field exactly.
      workflow_run: z.object({ id: z.literal(run.id), head_sha: z.literal(manifest.sourceCommit) }),
    })
    .parse(artifactInput);
  return { id: artifact.id, digest: artifact.digest.slice('sha256:'.length) };
};

/** The fixed producer workflows are qualification gates, not assembly fixtures; absent producers fail closed. */
export const fetchDesktopQualifiedReceipts = async (
  manifest: DesktopArtifactManifest,
  root: string,
  runs: { ci: string; vm: string },
): Promise<unknown[]> => {
  const api = (path: string): Uint8Array<ArrayBuffer> =>
    Uint8Array.from(
      execFileSync('gh', ['api', `repos/taucad/tau/${path}`], { maxBuffer: 8 * 1024 * 1024, timeout: 60_000 }),
    );
  const receipts: unknown[] = [];
  for (const environment of ['ci', 'vm'] as const) {
    const id = z
      .string()
      .regex(/^[1-9]\d*$/u)
      .parse(runs[environment]);
    const run = JSON.parse(new TextDecoder().decode(api(`actions/runs/${id}`))) as unknown;
    const artifacts = z
      .object({ artifacts: z.array(z.object({ name: z.string() }).loose()) })
      .parse(JSON.parse(new TextDecoder().decode(api(`actions/runs/${id}/artifacts?per_page=100`))));
    const matches = artifacts.artifacts.filter((entry) => entry.name === producer[environment].artifact);
    if (matches.length !== 1) {
      throw new Error('Missing or ambiguous trusted qualification artifact');
    }
    const admitted = verifyDesktopReceiptProvenance(run, matches[0], { environment, manifest });
    const archive = api(`actions/artifacts/${admitted.id}/zip`);
    if (createHash('sha256').update(archive).digest('hex') !== admitted.digest) {
      throw new Error('GitHub receipt archive digest differs');
    }
    const path = join(root, `${environment}-qualified-receipts.zip`);
    // oxlint-disable-next-line no-await-in-loop -- Persist only each authenticated bounded archive.
    await writeFile(path, archive);
    const names = execFileSync('unzip', ['-Z1', path], { encoding: 'utf8', timeout: 30_000 }).trim().split('\n');
    if (names.length !== 1 || names[0] !== 'route-receipts.json') {
      throw new Error('Unexpected qualification archive members');
    }
    const data = execFileSync('unzip', ['-p', path, 'route-receipts.json'], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      timeout: 30_000,
    });
    const parsed = z.array(z.unknown()).parse(JSON.parse(data));
    for (const input of parsed) {
      const receipt = parseDesktopAcceptanceReceipt(input, manifest);
      if (receipt.environment.kind !== environment) {
        throw new Error('Receipt kind differs from trusted producer');
      }
      receipts.push(receipt);
    }
  }
  return receipts;
};
