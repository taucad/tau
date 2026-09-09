import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { extractCandidatePackages } from '../scripts/extract-candidate-packages.mjs';
import { verifyPreviewInstall } from '../scripts/verify-preview-install.mjs';

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

describe('hosted preview consumer', () => {
  it('should install only roots and verify rewritten sibling previews', () => {
    const source = temporaryDirectory();
    const root = join(source, '00');
    const native = join(source, '01');
    const metadata = join(source, 'preview.json');
    mkdirSync(root);
    mkdirSync(native);
    writeFileSync(
      join(root, 'package.json'),
      `${JSON.stringify({ name: 'example', optionalDependencies: { 'example-linux': '1.0.0' } })}\n`,
    );
    writeFileSync(join(native, 'package.json'), `${JSON.stringify({ name: 'example-linux' })}\n`);
    writeFileSync(
      metadata,
      `${JSON.stringify({ packages: [{ name: 'example', url: 'https://pkg.pr.new/example@abc1234' }, { name: 'example-linux', url: 'https://pkg.pr.new/example-linux@abc1234' }] })}\n`,
    );

    const calls = [];
    const result = verifyPreviewInstall({
      from: source,
      metadata,
      sha: 'abc1234',
      install(command, args, options) {
        calls.push([command, args]);
        if (args[0] !== 'install') return;
        const modules = join(options.cwd, 'node_modules');
        mkdirSync(join(modules, 'example'), { recursive: true });
        mkdirSync(join(modules, 'example-linux'), { recursive: true });
        writeFileSync(
          join(modules, 'example', 'package.json'),
          `${JSON.stringify({ name: 'example', version: '0.0.0-preview-abc1234', optionalDependencies: { 'example-linux': 'https://pkg.pr.new/example-linux@abc1234' } })}\n`,
        );
        writeFileSync(
          join(modules, 'example-linux', 'package.json'),
          `${JSON.stringify({ name: 'example-linux', version: '0.0.0-preview-abc1234' })}\n`,
        );
      },
    });

    assert.deepEqual(result, { installed: 2, roots: ['example'] });
    assert.deepEqual(calls[1][1], ['install', '--ignore-scripts', 'https://pkg.pr.new/example@abc1234']);
  });
});
