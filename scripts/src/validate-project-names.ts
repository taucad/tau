import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import process from 'node:process';

const root = resolve(import.meta.dirname, '../..');
const projectDirectories = ['apps', 'apps/libs', 'packages', 'packages/kernels', 'libs'];

type Diagnostic = { level: 'ERROR' | 'WARN'; message: string };
type ProjectResult = { path: string; diagnostics: Diagnostic[] };

const readJson = <T>(filePath: string): T => JSON.parse(readFileSync(filePath, 'utf8')) as T;

const stripScope = (name: string): string => name.replace(/^@[^/]+\//, '');

const discoverProjects = (): string[] => {
  const projects: string[] = [];

  for (const directory of projectDirectories) {
    const absDirectory = join(root, directory);
    if (!existsSync(absDirectory)) {
      continue;
    }

    for (const entry of readdirSync(absDirectory, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const projectDirectory = join(absDirectory, entry.name);
      if (existsSync(join(projectDirectory, 'project.json'))) {
        projects.push(projectDirectory);
      }
    }
  }

  return projects;
};

const validateProject = (projectDirectory: string): ProjectResult => {
  const relativePath = projectDirectory.replace(root + '/', '');
  const diagnostics: Diagnostic[] = [];

  const nxPath = join(projectDirectory, 'project.json');
  const packagePath = join(projectDirectory, 'package.json');

  const nxConfig = readJson<{ name?: string }>(nxPath);
  const directoryName = basename(projectDirectory);

  if (!nxConfig.name) {
    diagnostics.push({ level: 'ERROR', message: 'project.json missing "name" field' });
    return { path: relativePath, diagnostics };
  }

  if (nxConfig.name !== directoryName) {
    diagnostics.push({
      level: 'ERROR',
      message: `project.json name "${nxConfig.name}" does not match directory name "${directoryName}"`,
    });
  }

  if (existsSync(packagePath)) {
    const package_ = readJson<{ name?: string }>(packagePath);
    if (package_.name) {
      const packageShortName = stripScope(package_.name);
      if (nxConfig.name !== packageShortName) {
        diagnostics.push({
          level: 'ERROR',
          message: `project.json name "${nxConfig.name}" does not match package.json name "${package_.name}" (unscoped: "${packageShortName}")`,
        });
      }
    } else {
      diagnostics.push({ level: 'ERROR', message: 'package.json missing "name" field' });
    }
  }

  return { path: relativePath, diagnostics };
};

const projects = discoverProjects();
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
