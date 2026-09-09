#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const dependencyFields = ['dependencies', 'devDependencies', 'optionalDependencies'];

const readPackages = (directory) =>
  readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => JSON.parse(readFileSync(join(directory, entry.name, 'package.json'), 'utf8')));

/** Install consumer-facing previews and verify their hosted sibling graph. */
export const verifyPreviewInstall = ({ from, metadata, sha, install = execFileSync }) => {
  const candidates = readPackages(resolve(from));
  const names = new Set(candidates.map(({ name }) => name));
  const referenced = new Set(
    candidates.flatMap((pkg) =>
      dependencyFields.flatMap((field) => Object.keys(pkg[field] ?? {}).filter((name) => names.has(name))),
    ),
  );
  const roots = candidates.filter(({ name }) => !referenced.has(name));
  const selected = roots.length > 0 ? roots : candidates;
  const urls = new Map(
    JSON.parse(readFileSync(resolve(metadata), 'utf8')).packages.map(({ name, url }) => [name, url]),
  );
  const rootUrls = selected.map(({ name }) => urls.get(name));
  if (rootUrls.some((url) => typeof url !== 'string')) {
    throw new Error('preview metadata is missing a root package URL');
  }
  const directory = mkdtempSync(join(tmpdir(), 'pkg-pr-new-consumer-'));
  try {
    install('npm', ['init', '--yes'], { cwd: directory, stdio: 'ignore' });
    install('npm', ['install', '--ignore-scripts', ...rootUrls], {
      cwd: directory,
      stdio: 'inherit',
    });

    const expectedVersion = `0.0.0-preview-${sha}`;
    let installed = 0;
    for (const name of names) {
      const manifest = join(directory, 'node_modules', name, 'package.json');
      if (!existsSync(manifest)) continue;
      installed += 1;
      const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
      if (pkg.version !== expectedVersion) {
        throw new Error(`${String(name)} has ${String(pkg.version)}, expected ${expectedVersion}`);
      }
      for (const field of dependencyFields) {
        for (const [dependency, specifier] of Object.entries(pkg[field] ?? {})) {
          if (names.has(dependency) && !String(specifier).startsWith('https://pkg.pr.new/')) {
            throw new Error(
              `${String(name)} keeps an unpublished ${field} reference to ${dependency}: ${String(specifier)}`,
            );
          }
        }
      }
    }
    if (selected.some(({ name }) => !existsSync(join(directory, 'node_modules', name, 'package.json')))) {
      throw new Error('not every preview root was installed');
    }
    return { installed, roots: selected.map(({ name }) => name) };
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      from: { type: 'string' },
      metadata: { type: 'string' },
      sha: { type: 'string' },
    },
  });
  try {
    if (!values.from || !values.metadata || !values.sha) {
      throw new Error('expected --from, --metadata, and --sha');
    }
    const result = verifyPreviewInstall(values);
    process.stdout.write(`verified ${result.installed} preview package(s) from ${result.roots.join(', ')}\n`);
  } catch (error) {
    process.stderr.write(`::error::${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
