import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import process from 'node:process';

const root = resolve(import.meta.dirname, '../..');

/*
 * Deployable applications are few and each is a deliberate addition, so they are
 * listed explicitly rather than inferred from directory shape.
 *
 * A future deployable application — for example the `apps/desktop` shell in
 * `docs/research/desktop-app-charter.md` — MUST be added here in the same change
 * that creates it. Without an entry it falls through to the Apache default while
 * packaging AGPL application code, so this validator would demand exactly the
 * wrong license.
 *
 * `apps/libs/` is a prefix rule instead, because it is a directory of many
 * private application capabilities rather than a short, deliberate list.
 */
const applicationPaths = new Set(['apps/api', 'apps/ui']);
const applicationPrefix = 'apps/libs/';

type WorkspacePackage = { path: string };
type PackageManifest = { name: string; license?: string };

const isApplication = (path: string): boolean => applicationPaths.has(path) || path.startsWith(applicationPrefix);

const expectedLicense = (path: string): string => {
  if (path === 'packages/geospec-engine') {
    return 'FSL-1.1-Apache-2.0';
  }
  if (isApplication(path)) {
    return 'AGPL-3.0-only';
  }
  return 'Apache-2.0';
};

const digest = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

/*
 * The two canonical texts. Every Apache and AGPL workspace license must be
 * byte-identical to one of them, so a partial or reworded copy cannot pass.
 * The FSL engine text is unique to its own project, so only presence is checked.
 */
const canonicalApache = digest(resolve(root, 'LICENSE'));
const canonicalAgpl = digest(resolve(root, 'apps/api/LICENSE'));

const workspaces = JSON.parse(
  execFileSync('pnpm', ['list', '-r', '--depth', '-1', '--json'], {
    cwd: root,
    encoding: 'utf8',
  }),
) as WorkspacePackage[];

const errors: string[] = [];

for (const workspace of workspaces) {
  // `.` is the repository root: an Apache workspace package whose LICENSE is the
  // canonical Apache text every other Apache package is compared against.
  const relativePath = relative(root, workspace.path) || '.';

  const manifest = JSON.parse(readFileSync(resolve(workspace.path, 'package.json'), 'utf8')) as PackageManifest;
  const expected = expectedLicense(relativePath);
  const label = `${relativePath} (${manifest.name})`;

  if (manifest.license !== expected) {
    errors.push(`${label}: expected SPDX ${expected}, found ${manifest.license ?? 'no license'}`);
  }

  const licensePath = resolve(workspace.path, 'LICENSE');
  if (existsSync(licensePath)) {
    const actual = digest(licensePath);
    if (expected === 'Apache-2.0' && actual !== canonicalApache) {
      errors.push(`${label}: LICENSE is not byte-identical to the canonical Apache-2.0 text`);
    }
    if (expected === 'AGPL-3.0-only' && actual !== canonicalAgpl) {
      errors.push(`${label}: LICENSE is not byte-identical to the canonical AGPL-3.0-only text`);
    }
  } else {
    errors.push(`${label}: missing a same-directory LICENSE file`);
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`ERROR  ${error}`);
  }
  process.exit(1);
}

console.log(`License partitions OK: ${workspaces.length} workspace packages mapped exactly once`);
