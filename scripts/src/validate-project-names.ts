import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import process from 'node:process';
import { projects as graphProjects, workspace } from '@taucad/nx';

const root = resolve(import.meta.dirname, '../..');

type Diagnostic = { level: 'ERROR' | 'WARN'; message: string };
type ProjectResult = { path: string; diagnostics: Diagnostic[] };

const readJson = <T>(filePath: string): T => JSON.parse(readFileSync(filePath, 'utf8')) as T;

const stripScope = (name: string): string => name.replace(/^@[^/]+\//, '');

// The `@taucad/ui` npm name belongs to the published component library at
// packages/ui, while the app keeps the `ui` project name — so each side of the
// collision carries an explicit exception instead of a placement-derived name.
const placementExceptions: Record<string, { projectName?: string; packageName?: string }> = {
  'apps/ui': { packageName: '@taucad/app' },
  'packages/ui': { projectName: 'taucad-ui', packageName: '@taucad/ui' },
};

const validateProject = (projectDirectory: string): ProjectResult => {
  const relativePath = projectDirectory.replace(root + '/', '');
  const diagnostics: Diagnostic[] = [];

  const nxPath = join(projectDirectory, 'project.json');
  const packagePath = join(projectDirectory, 'package.json');

  const nxConfig = readJson<{ name?: string }>(nxPath);
  const directoryName = basename(projectDirectory);
  // Two placements disambiguate a directory name that would otherwise collide
  // across the workspace (`packages/core/occt` vs the occt plugin, `examples/nextjs`
  // vs the nextjs e2e app), so their project names carry the placement.
  const exception = placementExceptions[relativePath];
  const expectedProjectName =
    exception?.projectName ??
    (relativePath.startsWith('packages/core/')
      ? `${directoryName}-core`
      : relativePath.startsWith('examples/')
        ? `example-${directoryName}`
        : directoryName);

  if (!nxConfig.name) {
    diagnostics.push({ level: 'ERROR', message: 'project.json missing "name" field' });
    return { path: relativePath, diagnostics };
  }

  if (nxConfig.name !== expectedProjectName) {
    diagnostics.push({
      level: 'ERROR',
      message: `project.json name "${nxConfig.name}" does not match placement-derived name "${expectedProjectName}"`,
    });
  }

  if (existsSync(packagePath)) {
    const package_ = readJson<{ name?: string }>(packagePath);
    if (package_.name) {
      if (exception?.packageName) {
        if (package_.name !== exception.packageName) {
          diagnostics.push({
            level: 'ERROR',
            message: `package.json name "${package_.name}" does not match placement-exception name "${exception.packageName}"`,
          });
        }
      } else {
        const packageShortName = stripScope(package_.name);
        if (nxConfig.name !== packageShortName) {
          diagnostics.push({
            level: 'ERROR',
            message: `project.json name "${nxConfig.name}" does not match package.json name "${package_.name}" (unscoped: "${packageShortName}")`,
          });
        }
      }
    } else {
      diagnostics.push({ level: 'ERROR', message: 'package.json missing "name" field' });
    }
  }

  return { path: relativePath, diagnostics };
};

// Every project Nx knows that declares a `project.json` — where the name under
// test lives. Nx also infers projects from a bare `package.json`; those have no
// project.json name to check.
const projects = graphProjects(await workspace({ fresh: true }), { predicate: ({ configured }) => configured }).map(
  ({ root: projectRoot }) => join(root, projectRoot),
);
const results = projects.map((project) => validateProject(project));

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

const totalProjects = projects.length;
console.log(
  `\nSummary: ${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'} across ${totalProjects} projects`,
);

if (errors > 0) {
  process.exit(1);
}
