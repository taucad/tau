import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import matter from 'gray-matter';
import { z } from 'zod';

import { readManifest, repoPath } from '#repos/lib.js';

const root = resolve(import.meta.dirname, '../..');
const policyDirectory = join(root, 'docs/policy');
const researchDirectory = join(root, 'docs/research');
const handbookDirectory = join(root, 'docs/handbooks');
const incidentDirectory = join(root, 'docs/incidents');
const stalenessDays = 180;
const verificationDays = 90;

// Docs/research, docs/reference, docs/handbooks and docs/incidents are symlinks into
// the private tau-brain repo. Repos/tau-brain is gitignored. On a public clone without
// tau-brain, the symlink target is absent: skip listing/validating those directories and
// existence checks for references into them, so public CI stays green without a
// private-repo secret.
const relocatableDirectories = ['docs/research', 'docs/reference', 'docs/handbooks', 'docs/incidents'];
const unavailableRelocatable = relocatableDirectories.filter((directory) => !existsSync(join(root, directory)));
const { manifest: repositories } = readManifest(root);
const unavailableRepositories = Object.entries(repositories.repos)
  .map(([name, repo]) => repoPath({ name, repo, manifest: repositories, root }))
  .filter((directory) => !existsSync(directory));
const skipsMissingReference = (reference: string): boolean =>
  unavailableRelocatable.some((d) => reference === d || reference.startsWith(`${d}/`)) ||
  unavailableRepositories.some((directory) => {
    const absolute = resolve(root, reference);
    return absolute === directory || absolute.startsWith(`${directory}${sep}`);
  });

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be ISO 8601 date (YYYY-MM-DD)');
const utcTimestamp = z
  .string()
  .regex(/^\d{4}(?:-\d{2}){2}T\d{2}(?::\d{2}){1,2}Z$/, 'Must be a quoted UTC timestamp (YYYY-MM-DDTHH:MMZ)');
const environments = z.array(z.enum(['development', 'staging', 'prod-us'])).min(1);

const policySchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1).max(300),
  status: z.enum(['draft', 'active', 'deprecated', 'superseded']),
  created: isoDate,
  updated: isoDate,
  related: z.array(z.string()).optional(),
  superseded_by: z.string().optional(), // eslint-disable-line @typescript-eslint/naming-convention -- YAML field
});

const researchSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1).max(300),
  status: z.enum(['draft', 'active', 'superseded']),
  created: isoDate,
  updated: isoDate,
  category: z.enum(['audit', 'investigation', 'comparison', 'architecture', 'migration', 'optimization', 'reference']),
  related: z.array(z.string()).optional(),
  superseded_by: z.string().optional(), // eslint-disable-line @typescript-eslint/naming-convention -- YAML field
});

/** Handbook pages under `docs/handbooks`: the policy contract plus its operational fields. */
export const handbookSchema = policySchema.extend({
  kind: z.enum(['overview', 'service', 'runbook', 'playbook', 'reference', 'register']),
  environments,
  last_verified: isoDate, // eslint-disable-line @typescript-eslint/naming-convention -- YAML field
  sources: z.array(z.string()).min(1),
  review_days: z.number().int().positive().optional(), // eslint-disable-line @typescript-eslint/naming-convention -- YAML field
});

/** Incident records under `docs/incidents/<id>/incident.md`. */
export const incidentSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1).max(300),
  state: z.enum(['open', 'mitigated', 'resolved', 'closed']),
  severity: z.enum(['SEV1', 'SEV2', 'SEV3', 'drill']),
  created: isoDate,
  updated: isoDate,
  environments,
  started_at: utcTimestamp, // eslint-disable-line @typescript-eslint/naming-convention -- YAML field
  detected_at: utcTimestamp, // eslint-disable-line @typescript-eslint/naming-convention -- YAML field
  mitigated_at: utcTimestamp.or(z.literal('')), // eslint-disable-line @typescript-eslint/naming-convention -- YAML field
  resolved_at: utcTimestamp.or(z.literal('')), // eslint-disable-line @typescript-eslint/naming-convention -- YAML field
  services: z.array(z.string()),
  playbooks: z.array(z.string()),
});

type Diagnostic = { level: 'ERROR' | 'WARN'; message: string };
type FileResult = { path: string; diagnostics: Diagnostic[] };

const listMarkdown = (directory: string): string[] =>
  existsSync(directory)
    ? readdirSync(directory)
        .filter((f) => f.endsWith('.md'))
        .map((f) => join(directory, f))
    : [];

/**
 * List every handbook page recursively. Handbooks only: research artifacts hold tens of
 * thousands of files and are validated at their top level.
 */
export const listHandbookPages = (directory: string): string[] =>
  existsSync(directory)
    ? readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
          return listHandbookPages(path);
        }
        return entry.name.endsWith('.md') ? [path] : [];
      })
    : [];

/** List the `incident.md` in each incident directory; `evidence/` and `comms/` are never validated. */
export const listIncidentRecords = (directory: string): string[] =>
  existsSync(directory)
    ? readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(directory, entry.name, 'incident.md'))
        .filter((path) => existsSync(path))
    : [];

const extractH1 = (content: string): string | undefined => {
  const match = /^#\s+(.+)$/m.exec(content);
  return match?.[1]?.trim();
};

const daysBetween = (a: string, b: Date): number => {
  const dateA = new Date(a);
  return Math.floor((b.getTime() - dateA.getTime()) / (1000 * 60 * 60 * 24));
};

const stalenessWarning = (field: string, date: string | undefined, threshold: number): Diagnostic[] => {
  const age = date ? daysBetween(date, new Date()) : 0;
  return age > threshold ? [{ level: 'WARN', message: `${field} ${age} days ago (>${threshold} day threshold)` }] : [];
};

type Frontmatter = {
  title?: string;
  related?: string[];
  superseded_by?: string;
  updated?: string;
  last_verified?: string;
  review_days?: number;
};

/** Validate one document's frontmatter against its owning schema. */
export const validateFile = (filePath: string, schema: z.ZodObject<z.ZodRawShape>): FileResult => {
  const diagnostics: Diagnostic[] = [];
  const relativePath = filePath.replace(root + '/', '');
  const raw = readFileSync(filePath, 'utf8');

  let parsed: ReturnType<typeof matter>;
  try {
    parsed = matter(raw);
  } catch {
    diagnostics.push({ level: 'ERROR', message: 'Failed to parse frontmatter' });
    return { path: relativePath, diagnostics };
  }

  if (Object.keys(parsed.data as Record<string, unknown>).length === 0) {
    diagnostics.push({ level: 'ERROR', message: 'Missing frontmatter entirely' });
    return { path: relativePath, diagnostics };
  }

  const result = schema.safeParse(parsed.data);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path.join('.');
      diagnostics.push({
        level: 'ERROR',
        message: field ? `${field}: ${issue.message}` : issue.message,
      });
    }
  }

  if (result.success) {
    const { data } = result as { data: Frontmatter };

    if (Array.isArray(data.related)) {
      for (const reference of data.related) {
        const absReference = resolve(root, reference);
        if (!existsSync(absReference) && !skipsMissingReference(reference)) {
          diagnostics.push({
            level: 'ERROR',
            message: `related: "${reference}" does not exist`,
          });
        }
      }
    }

    if (data.superseded_by) {
      const absReference = resolve(root, data.superseded_by);
      if (!existsSync(absReference) && !skipsMissingReference(data.superseded_by)) {
        diagnostics.push({
          level: 'ERROR',
          message: `superseded_by: "${data.superseded_by}" does not exist`,
        });
      }
    }

    const h1 = extractH1(parsed.content);
    if (h1 && data.title && h1 !== data.title) {
      diagnostics.push({
        level: 'WARN',
        message: `title "${data.title}" ≠ H1 "${h1}"`,
      });
    }

    diagnostics.push(
      ...stalenessWarning('updated', data.updated, stalenessDays),
      ...stalenessWarning('last_verified', data.last_verified, data.review_days ?? verificationDays),
    );
  }

  return { path: relativePath, diagnostics };
};

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(resolve(entry)).href) {
  const results: FileResult[] = [
    ...listMarkdown(policyDirectory).map((f) => validateFile(f, policySchema)),
    ...listMarkdown(researchDirectory).map((f) => validateFile(f, researchSchema)),
    ...listHandbookPages(handbookDirectory).map((f) => validateFile(f, handbookSchema)),
    // The incident register is a handbook-style register page; the records use incidentSchema.
    ...listMarkdown(incidentDirectory)
      .filter((f) => f.endsWith('/index.md'))
      .map((f) => validateFile(f, handbookSchema)),
    ...listIncidentRecords(incidentDirectory).map((f) => validateFile(f, incidentSchema)),
  ];

  if (unavailableRelocatable.length > 0) {
    console.log(
      `Note: ${unavailableRelocatable.join(', ')} unavailable (private tau-brain not cloned) — skipping their validation and references into them.`,
    );
  }

  if (unavailableRepositories.length > 0) {
    console.log(
      `Note: ${unavailableRepositories.length} managed repositories unavailable — skipping references into those optional checkouts.`,
    );
  }

  let errors = 0;
  let warnings = 0;

  for (const { path, diagnostics } of results) {
    if (diagnostics.length === 0) {
      continue;
    }

    console.log(`\n${path}`);
    for (const d of diagnostics) {
      const prefix = d.level === 'ERROR' ? '  \u001B[31mERROR\u001B[0m' : '  \u001B[33mWARN\u001B[0m ';
      console.log(`${prefix}  ${d.message}`);
      if (d.level === 'ERROR') {
        errors++;
      } else {
        warnings++;
      }
    }
  }

  console.log(
    `\nSummary: ${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'} across ${results.length} files`,
  );

  if (errors > 0) {
    process.exit(1);
  }
}
