import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { extractCandidatePackages } from '../scripts/extract-candidate-packages.mjs';

const written = [];
const temporaryDirectory = () => {
  const directory = mkdtempSync(join(tmpdir(), 'candidate-preview-'));
  written.push(directory);
  return directory;
};

afterEach(() => {
  for (const directory of written.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('candidate preview extraction', () => {
  it('should extract every package named by the frozen manifest', () => {
    const source = temporaryDirectory();
    const packageDirectory = join(source, 'package');
    const output = join(source, 'output');
    const manifest = { name: '@taucad/example', version: '1.2.3' };
    mkdirSync(packageDirectory);
    writeFileSync(join(packageDirectory, 'package.json'), `${JSON.stringify(manifest)}\n`);
    writeFileSync(join(packageDirectory, 'README.md'), 'preview marker\n');
    const [{ filename }] = JSON.parse(
      execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', source], {
        cwd: packageDirectory,
        encoding: 'utf8',
      }),
    );
    writeFileSync(
      join(source, 'manifest.json'),
      `${JSON.stringify({ packages: [{ ...manifest, filename }] })}\n`,
    );

    const [directory] = extractCandidatePackages({ from: source, out: output });

    assert.deepEqual(JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')), manifest);
    assert.equal(readFileSync(join(directory, 'README.md'), 'utf8'), 'preview marker\n');
  });

  it('should reject tarball paths outside the candidate directory', () => {
    const source = temporaryDirectory();
    writeFileSync(
      join(source, 'manifest.json'),
      `${JSON.stringify({ packages: [{ filename: '../package.tgz', name: '@taucad/example', version: '1.2.3' }] })}\n`,
    );

    assert.throws(
      () => extractCandidatePackages({ from: source, out: join(source, 'output') }),
      /unsafe tarball filename/u,
    );
  });
});
