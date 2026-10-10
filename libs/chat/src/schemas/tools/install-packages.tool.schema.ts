import type { PackageIssueCode } from '@taucad/bundler-core';
import { z } from 'zod';

/** Every code `@taucad/bundler-core` can report; the type test fails when the contract gains one. @public */
export const packageIssueCodes = [
  'package-not-locked',
  'package-not-installed',
  'lock-stale',
  'lock-invalid',
  'integrity-mismatch',
  'registry-unavailable',
  'no-matching-version',
  'peer-conflict',
  'unsupported-dependency-protocol',
  'package-unavailable-in-host',
  'install-script-skipped',
  'package-version-mismatch',
  'manifest-conflict',
] as const satisfies readonly PackageIssueCode[];

/** The most issues one result carries, so a broken tree cannot flood the transcript. @public */
export const installPackagesIssueLimit = 25;

/* The npm name limit; installPackages checks the name grammar and reports `manifest-conflict`. */
const packageNameSchema = z.string().min(1).max(214);
const packageNamesSchema = z.array(packageNameSchema).max(64);

/*
 * A name-to-range record. A bounded record key would serialize as `propertyNames`, which Vertex refuses;
 * piping a typeless input side into it keeps the check while the wire form is the description.
 */
const addSchema = z
  .any()
  .describe(
    'package.json dependencies to set: a JSON object mapping package name to version range, e.g. {"simplex-noise": "^4.0.3"}.',
  )
  .pipe(z.record(packageNameSchema, z.string().min(1).max(256)));

/** @public */
export const installPackagesInputSchema = z.object({
  add: addSchema.optional(),
  remove: packageNamesSchema.optional().describe('Package names to remove from package.json dependencies.'),
  upgrade: packageNamesSchema
    .optional()
    .describe('Package names to re-resolve to the newest version their ranges allow. Omit to keep locked versions.'),
});

/** @public */
export const installPackagesOutputSchema = z.object({
  manifestChanged: z.boolean().describe('Whether package.json was rewritten.'),
  lockChanged: z.boolean().describe('Whether package-lock.json was rewritten.'),
  packages: z
    .array(z.object({ name: z.string(), version: z.string(), path: z.string() }))
    .describe('Direct dependencies as locked; empty when a refusal stopped the install.'),
  issues: z
    .array(z.object({ code: z.enum(packageIssueCodes), message: z.string(), name: z.string().optional() }))
    .max(installPackagesIssueLimit)
    .describe('Refusals and warnings; each message names the recovery.'),
});

/** @public */
export type InstallPackagesInput = z.infer<typeof installPackagesInputSchema>;
/** @public */
export type InstallPackagesOutput = z.infer<typeof installPackagesOutputSchema>;
