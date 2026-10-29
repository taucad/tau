/** Authenticate staging Mac CI application and harness identities without changing public acceptance receipts. */
import { execFileSync } from 'node:child_process';
import { z } from 'zod';
import type { DesktopArtifactManifest } from '#shared/desktop-release.js';
// oxlint-disable-next-line no-restricted-imports -- Share the publisher's canonical manifest digest.
import { desktopManifestDigest } from './desktop-route-publication.mjs';

const sha = z.string().regex(/^[a-f\d]{40}$/u);
const digest = z.string().regex(/^[a-f\d]{64}$/u);
const candidateSchema = z.strictObject({
  runId: z.number().int().positive(),
  workflowCommit: sha,
  artifactId: z.number().int().positive(),
  archiveSha256: digest,
});
export type InstallerCandidateProvenance = z.infer<typeof candidateSchema>;
const bindingSchema = z.strictObject({
  schemaVersion: z.literal(1),
  scope: z.literal('macos'),
  channel: z.literal('staging'),
  kind: z.literal('ci'),
  sourceCommit: sha,
  manifestSha256: digest,
  workflowCommit: sha,
  runId: z.number().int().positive(),
  candidate: candidateSchema,
});

/** Only this mode has a separately authenticated source/harness binding. */
export const usesQualificationBinding = (scope: string, channel: string, kind: string): boolean =>
  scope === 'macos' && channel === 'staging' && kind === 'ci';

/** Bind authenticated archive contents to independently admitted GitHub candidate and qualification metadata. */
export const verifyQualificationBinding = (
  input: unknown,
  options: {
    manifest: DesktopArtifactManifest;
    candidate: InstallerCandidateProvenance;
    runId: number;
    workflowCommit: string;
    publicationCommit: string;
  },
): void => {
  const binding = bindingSchema.parse(input);
  const candidate = candidateSchema.parse(options.candidate);
  const workflowCommit = sha.parse(options.workflowCommit);
  const publicationCommit = sha.parse(options.publicationCommit);
  const sourceCommit = sha.parse(options.manifest.sourceCommit);
  if (
    options.manifest.channel !== 'staging' ||
    binding.sourceCommit !== sourceCommit ||
    binding.manifestSha256 !== desktopManifestDigest(options.manifest) ||
    binding.workflowCommit !== workflowCommit ||
    binding.runId !== options.runId ||
    binding.candidate.runId !== candidate.runId ||
    binding.candidate.workflowCommit !== candidate.workflowCommit ||
    binding.candidate.artifactId !== candidate.artifactId ||
    binding.candidate.archiveSha256 !== candidate.archiveSha256
  ) {
    throw new Error('Qualification binding differs from authenticated candidate or workflow');
  }
  for (const [older, newer] of [
    [sourceCommit, candidate.workflowCommit],
    [candidate.workflowCommit, workflowCommit],
    [workflowCommit, publicationCommit],
  ]) {
    execFileSync('git', ['merge-base', '--is-ancestor', older!, newer!], { stdio: 'pipe' });
  }
};

/** Create the collector binding only from its authenticated candidate and current run. */
export const createQualificationBinding = (options: {
  manifest: DesktopArtifactManifest;
  candidate: InstallerCandidateProvenance;
  runId: number;
  workflowCommit: string;
}): z.infer<typeof bindingSchema> => {
  const binding = bindingSchema.parse({
    schemaVersion: 1,
    scope: 'macos',
    channel: 'staging',
    kind: 'ci',
    sourceCommit: options.manifest.sourceCommit,
    manifestSha256: desktopManifestDigest(options.manifest),
    workflowCommit: options.workflowCommit,
    runId: options.runId,
    candidate: options.candidate,
  });
  verifyQualificationBinding(binding, { ...options, publicationCommit: options.workflowCommit });
  return binding;
};
