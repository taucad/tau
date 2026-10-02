#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT_PACKAGE = '@@CREATE_REPO_npm-name@@';
const candidateDirectory = resolve(process.argv[2] ?? 'candidate');

const packages = readdirSync(candidateDirectory)
  .filter((filename) => filename.endsWith('.tgz'))
  .map((filename) => {
    const tarball = resolve(candidateDirectory, filename);
    const manifest = JSON.parse(execFileSync('tar', ['-xOf', tarball, 'package/package.json'], { encoding: 'utf8' }));
    const digest = createHash('sha512').update(readFileSync(tarball)).digest('base64');
    return { name: manifest.name, version: manifest.version, filename, integrity: `sha512-${digest}` };
  })
  .sort(({ name: left }, { name: right }) =>
    left === ROOT_PACKAGE ? 1 : right === ROOT_PACKAGE ? -1 : left.localeCompare(right),
  );

if (new Set(packages.map(({ name }) => name)).size !== packages.length) {
  throw new Error('candidate package names are not unique');
}
if (new Set(packages.map(({ version }) => version)).size !== 1) {
  throw new Error('candidate package versions differ');
}
const root = packages.at(-1);
if (root?.name !== ROOT_PACKAGE) throw new Error(`missing root candidate: ${ROOT_PACKAGE}`);

const output = { packages, version: root.version };
writeFileSync(resolve(candidateDirectory, 'manifest.json'), `${JSON.stringify(output, null, 2)}\n`);
if (process.env['GITHUB_OUTPUT']) {
  appendFileSync(
    process.env['GITHUB_OUTPUT'],
    `filename=${root.filename}\nintegrity=${root.integrity}\nversion=${root.version}\n`,
  );
}
