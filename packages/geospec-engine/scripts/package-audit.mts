#!/usr/bin/env node
/** Build-output package audit for the two GeoSpec Wave-1 releases. */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

type Manifest = {
  name: string;
  version: string;
  license: string;
  bin?: Record<string, string>;
  publishConfig?: { exports?: Record<string, unknown> };
};
type PackResult = { filename: string; files: Array<{ path: string }> };
type Provenance = {
  package: string;
  version: string;
  license: string;
  artifacts: Array<{ path: string; sha256: string; bytes: number }>;
};

const repoRoot = resolve(import.meta.dirname, '../../..');

const invariant: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const walk = (root: string, prefix = ''): string[] =>
  readdirSync(join(root, prefix), { withFileTypes: true })
    .flatMap((entry) => {
      const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      return entry.isDirectory() ? walk(root, path) : [path];
    })
    .sort();

const exportPaths = (value: unknown): string[] => {
  if (typeof value === 'string') {
    return [value.replace(/^\.\//u, '')];
  }
  if (value === null || typeof value !== 'object') {
    return [];
  }
  return Object.values(value).flatMap((entry) => exportPaths(entry));
};

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object';

const recordValue = (record: Record<string, unknown>, key: string): unknown => record[key];

const audit = async (relativeRoot: string, engine: boolean): Promise<number> => {
  const root = resolve(repoRoot, relativeRoot);
  const temporary = mkdtempSync(join(tmpdir(), 'geospec-package-audit-'));
  try {
    if (engine) {
      execFileSync(process.execPath, [
        join(root, 'scripts/generate-provenance.mjs'),
        root,
        '--release-date',
        '2026-08-13',
      ]);
    }
    const [packed] = JSON.parse(
      execFileSync(
        'npm',
        ['pack', '--json', '--pack-destination', temporary, ...(engine ? ['--ignore-scripts'] : [])],
        {
          cwd: root,
          encoding: 'utf8',
        },
      ),
    ) as PackResult[];
    invariant(packed, `${relativeRoot}: npm pack returned no package`);
    const extracted = join(temporary, 'extracted');
    mkdirSync(extracted);
    execFileSync('tar', ['-xzf', resolve(temporary, packed.filename), '-C', extracted]);
    const packageRoot = join(extracted, 'package');
    const inventory = packed.files.map(({ path }) => path).sort();
    invariant(
      JSON.stringify(inventory) === JSON.stringify(walk(packageRoot)),
      `${relativeRoot}: pack inventory differs from tar bytes`,
    );

    const required = ['LICENSE', 'README.md', 'package.json'];
    if (engine) {
      required.push(
        'provenance.json',
        'provenance.schema.json',
        'dist/native/opencascade/geospec_opencascade_single.wasm',
      );
    }
    for (const path of required) {
      invariant(inventory.includes(path), `${relativeRoot}: missing ${path}`);
    }
    for (const prefix of ['src/', 'scripts/', 'fixtures/', 'experiments/', 'verification/']) {
      invariant(
        !inventory.some((path) => path.startsWith(prefix)),
        `${relativeRoot}: source-only ${prefix} leaked into the package`,
      );
    }

    const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as Manifest;
    const publishedPaths = exportPaths(manifest.publishConfig?.exports);
    for (const path of publishedPaths) {
      invariant(inventory.includes(path), `${relativeRoot}: export target ${path} is absent`);
    }
    for (const path of Object.values(manifest.bin ?? {})) {
      const target = path.replace(/^\.\//u, '');
      invariant(inventory.includes(target), `${relativeRoot}: bin target ${target} is absent`);
      // oxlint-disable-next-line eslint/no-bitwise -- POSIX execute permission bits are a bitmask.
      const executable = (statSync(join(packageRoot, target)).mode & 0o111) !== 0;
      invariant(executable, `${relativeRoot}: bin target ${target} is not executable`);
    }

    if (engine) {
      const provenance = JSON.parse(readFileSync(join(packageRoot, 'provenance.json'), 'utf8')) as Provenance;
      invariant(provenance.package === manifest.name, `${relativeRoot}: provenance package mismatch`);
      invariant(provenance.version === manifest.version, `${relativeRoot}: provenance version mismatch`);
      invariant(provenance.license === manifest.license, `${relativeRoot}: provenance license mismatch`);
      const expected = inventory.filter((path) => path !== 'provenance.json');
      invariant(
        JSON.stringify(provenance.artifacts.map(({ path }) => path)) === JSON.stringify(expected),
        `${relativeRoot}: provenance inventory differs from npm pack`,
      );
      for (const artifact of provenance.artifacts) {
        const bytes = readFileSync(join(packageRoot, artifact.path));
        invariant(bytes.byteLength === artifact.bytes, `${relativeRoot}: ${artifact.path} byte count mismatch`);
        invariant(
          createHash('sha256').update(bytes).digest('hex') === artifact.sha256,
          `${relativeRoot}: ${artifact.path} digest mismatch`,
        );
      }
      const built: unknown = await import(`${pathToFileURL(join(root, 'dist/register.mjs')).href}?package-audit`);
      invariant(isRecord(built), `${relativeRoot}: built registration entry is not an object`);
      const implementation = recordValue(built, 'geoSpecEngineImplementation');
      invariant(isRecord(implementation), `${relativeRoot}: built engine descriptor is absent`);
      invariant(
        recordValue(implementation, 'version') === manifest.version,
        `${relativeRoot}: registered engine descriptor version mismatch`,
      );
    }
    process.stdout.write(`✓ ${manifest.name}@${manifest.version}: ${inventory.length} packed files audited\n`);
    return inventory.length;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
};

await audit('packages/geospec', false);
await audit('packages/geospec-engine', true);
