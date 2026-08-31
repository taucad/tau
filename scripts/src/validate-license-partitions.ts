import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import process from 'node:process';

const root = resolve(import.meta.dirname, '../..');

type WorkspacePackage = { path: string };
type PackageManifest = { name: string; license?: string };

const expectedLicense = 'Apache-2.0';

const digest = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

/*
 * Every workspace license must be byte-identical to the root Apache text, so a
 * partial or reworded copy cannot pass.
 */
const canonicalApache = digest(resolve(root, 'license'));

/*
 * The unit is the pnpm workspace package, not the Nx project: a licence ships
 * with whatever pnpm publishes or vendors, which includes the repository root
 * (the canonical Apache text) and the `package.json`-only projects Nx infers but
 * does not tag.
 */
const workspaces = JSON.parse(
  execFileSync('pnpm', ['list', '-r', '--depth', '-1', '--json'], {
    cwd: root,
    encoding: 'utf8',
  }),
) as WorkspacePackage[];

const errors: string[] = [];

for (const workspace of workspaces) {
  // `.` is the repository root: an Apache workspace package whose `license` is the
  // canonical Apache text every other Apache package is compared against.
  const relativePath = relative(root, workspace.path) || '.';

  const manifest = JSON.parse(readFileSync(resolve(workspace.path, 'package.json'), 'utf8')) as PackageManifest;
  const label = `${relativePath} (${manifest.name})`;

  if (manifest.license !== expectedLicense) {
    errors.push(`${label}: expected SPDX ${expectedLicense}, found ${manifest.license ?? 'no license'}`);
  }

  const licensePath = relativePath === '.' ? resolve(root, 'license') : resolve(workspace.path, 'LICENSE');
  if (existsSync(licensePath)) {
    const actual = digest(licensePath);
    if (actual !== canonicalApache) {
      errors.push(`${label}: LICENSE is not byte-identical to the canonical Apache-2.0 text`);
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

console.log(`License validation OK: ${workspaces.length} Apache-2.0 workspace packages`);
