/**
 * Generates the release provenance record (`provenance.json`) required by
 * charter DL4: every published engine artifact carries its release date, its
 * FSL-1.1-Apache-2.0 license, and the date the release converts to Apache-2.0
 * (release + 2 years), plus a SHA-256 digest of every shipped artifact except
 * this record itself. A self-manifest cannot hash its own final bytes.
 *
 * Runs at `prepack`, so the record always describes the exact bytes being
 * published. The record's shape is pinned by `provenance.schema.json` and the
 * test in `src/provenance-script.test.ts`.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import process from 'node:process';

const parseArguments = () => {
  let packageRoot;
  let releaseDate;
  const arguments_ = process.argv.slice(2);
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === undefined) {
      continue;
    }
    if (argument === '--release-date') {
      if (releaseDate !== undefined || arguments_[index + 1] === undefined) {
        throw new TypeError('Usage: generate-provenance.mjs [package-root] [--release-date YYYY-MM-DD]');
      }
      releaseDate = arguments_[index + 1];
      index += 1;
      continue;
    }
    if (argument.startsWith('-') || packageRoot !== undefined) {
      throw new TypeError(`Unknown provenance argument '${argument}'.`);
    }
    packageRoot = argument;
  }
  if (releaseDate !== undefined) {
    const parsed = new Date(`${releaseDate}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(releaseDate) || parsed.toISOString().slice(0, 10) !== releaseDate) {
      throw new TypeError(`Invalid release date '${releaseDate}'; expected a real YYYY-MM-DD calendar date.`);
    }
  }
  return {
    packageRoot: packageRoot ?? process.cwd(),
    releaseDate: releaseDate ?? new Date().toISOString().slice(0, 10),
  };
};

const { packageRoot, releaseDate } = parseArguments();

/** Every file below `directory`. @type {(directory: string) => string[]} */
const walk = (directory) => {
  /** @type {string[]} */
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else {
      files.push(full);
    }
  }
  return files;
};

const manifest = /** @type {{ name: string; version: string; license: string; files?: string[] }} */ (
  JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
);

/** @type {string[]} */
const artifactPaths = [];
for (const entry of manifest.files ?? []) {
  if (entry === 'provenance.json') {
    continue;
  }
  const full = join(packageRoot, entry);
  let stats;
  try {
    stats = statSync(full);
  } catch {
    continue; // A files-array entry that does not exist is skipped by npm too.
  }
  if (stats.isDirectory()) {
    artifactPaths.push(...walk(full));
  } else {
    artifactPaths.push(full);
  }
}
artifactPaths.push(join(packageRoot, 'package.json'));

const conversion = new Date(`${releaseDate}T00:00:00Z`);
conversion.setUTCFullYear(conversion.getUTCFullYear() + 2);

const record = {
  package: manifest.name,
  version: manifest.version,
  releaseDate,
  license: manifest.license,
  futureLicense: 'Apache-2.0',
  apacheConversionDate: conversion.toISOString().slice(0, 10),
  artifacts: artifactPaths
    .map((full) => {
      const bytes = readFileSync(full);
      return {
        path: relative(packageRoot, full),
        sha256: createHash('sha256').update(bytes).digest('hex'),
        bytes: bytes.byteLength,
      };
    })
    .sort((a, b) => (a.path < b.path ? -1 : 1)),
};

writeFileSync(join(packageRoot, 'provenance.json'), `${JSON.stringify(record, null, 2)}\n`);
console.log(
  `provenance.json: ${record.version} released ${releaseDate}, Apache-2.0 from ${record.apacheConversionDate}, ${record.artifacts.length} artifacts`,
);
