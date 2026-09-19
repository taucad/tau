#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const extractTarball = (tarball, destination) => {
  execFileSync('tar', ['-xzf', tarball, '--strip-components=1', '-C', destination]);
};

/** Expand the frozen npm candidate set into package directories for pkg.pr.new. */
export const extractCandidatePackages = ({ extract = extractTarball, from, out }) => {
  const sourceDirectory = resolve(from);
  const outDirectory = resolve(out);
  const { packages } = JSON.parse(readFileSync(join(sourceDirectory, 'manifest.json'), 'utf8'));
  if (!Array.isArray(packages) || packages.length === 0) {
    throw new Error('manifest.json names no packages');
  }
  if (existsSync(outDirectory) && readdirSync(outDirectory).length > 0) {
    throw new Error(`${outDirectory} must be empty`);
  }
  mkdirSync(outDirectory, { recursive: true });

  const names = new Set();
  return packages.map(({ filename, name, version }, index) => {
    if (typeof name !== 'string' || name.length === 0 || names.has(name)) {
      throw new Error(`invalid or duplicate package name: ${name}`);
    }
    names.add(name);
    if (typeof filename !== 'string' || basename(filename) !== filename || !filename.endsWith('.tgz')) {
      throw new Error(`unsafe tarball filename for ${name}: ${filename}`);
    }
    const tarball = join(sourceDirectory, filename);
    if (!existsSync(tarball)) {
      throw new Error(`missing tarball for ${name}: ${filename}`);
    }

    const destination = join(outDirectory, String(index).padStart(2, '0'));
    mkdirSync(destination);
    extract(tarball, destination);
    const extracted = JSON.parse(readFileSync(join(destination, 'package.json'), 'utf8'));
    if (extracted.name !== name || extracted.version !== version) {
      throw new Error(`${filename} extracted ${extracted.name}@${extracted.version}, expected ${name}@${version}`);
    }
    return destination;
  });
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: { from: { type: 'string' }, out: { type: 'string' } },
  });
  try {
    if (!values.from || !values.out) {
      throw new Error('expected --from and --out directories');
    }
    process.stdout.write(`${extractCandidatePackages({ from: values.from, out: values.out }).join('\n')}\n`);
  } catch (error) {
    process.stderr.write(`::error::${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
