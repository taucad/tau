import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import process from 'node:process';

const root = resolve(import.meta.dirname, '../..');
const applicationPaths = new Set([
  'apps/api',
  'apps/ui',
  'libs/api-extractor',
  'libs/billing',
  'libs/chat',
  'libs/lsp',
  'libs/lsp-fs',
]);

type WorkspacePackage = { path: string };
type PackageManifest = { name: string; license?: string };

const workspaces = JSON.parse(
  execFileSync('pnpm', ['list', '-r', '--depth', '-1', '--json'], {
    cwd: root,
    encoding: 'utf8',
  }),
) as WorkspacePackage[];

const expectedLicense = (path: string): string => {
  if (path === 'packages/geospec-engine') {
    return 'FSL-1.1-Apache-2.0';
  }
  if (applicationPaths.has(path)) {
    return 'AGPL-3.0-only';
  }
  return 'Apache-2.0';
};

const errors: string[] = [];

for (const workspace of workspaces) {
  const path = relative(root, workspace.path) || '.';
  const manifest = JSON.parse(readFileSync(resolve(workspace.path, 'package.json'), 'utf8')) as PackageManifest;
  const expected = expectedLicense(path === '.' ? '' : path);
  if (manifest.license !== expected) {
    errors.push(`${path} (${manifest.name}): expected ${expected}, found ${manifest.license ?? 'no license'}`);
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`ERROR  ${error}`);
  }
  process.exit(1);
}

console.log(`License partitions OK: ${workspaces.length} workspace packages mapped exactly once`);
