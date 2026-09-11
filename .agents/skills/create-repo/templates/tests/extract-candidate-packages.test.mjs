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
    writeFileSync(join(source, 'manifest.json'), `${JSON.stringify({ packages: [{ ...manifest, filename }] })}\n`);

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
    const sha = 'abc1234abc1234abc1234abc1234abc1234abc12';
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
      `${JSON.stringify({
        packages: [
          { name: 'example', url: `https://pkg.pr.new/example@${sha}` },
          { name: 'example-linux', url: `https://pkg.pr.new/example-linux@${sha}` },
        ],
      })}\n`,
    );

    const calls = [];
    const result = verifyPreviewInstall({
      from: source,
      metadata,
      sha,
      install(command, args, options) {
        calls.push([command, args]);
        if (args[0] === 'pack') {
          const [, url] = args;
          const name = url.slice('https://pkg.pr.new/'.length, url.lastIndexOf('@'));
          return `${JSON.stringify([{ name, version: '0.0.0-preview-abc1234' }])}\n`;
        }
        if (args[0] !== 'install') return;
        const modules = join(options.cwd, 'node_modules');
        mkdirSync(join(modules, 'example'), { recursive: true });
        mkdirSync(join(modules, 'example-linux'), { recursive: true });
        writeFileSync(
          join(modules, 'example', 'package.json'),
          `${JSON.stringify({ name: 'example', version: '0.0.0-preview-abc1234', optionalDependencies: { 'example-linux': `https://pkg.pr.new/example-linux@${sha}` } })}\n`,
        );
        writeFileSync(
          join(modules, 'example-linux', 'package.json'),
          `${JSON.stringify({ name: 'example-linux', version: '0.0.0-preview-abc1234' })}\n`,
        );
      },
    });

    assert.deepEqual(result, { installed: 2, published: 2, roots: ['example'] });
    assert.deepEqual(calls[1][1], ['install', '--ignore-scripts', `https://pkg.pr.new/example@${sha}`]);
  });

  it('should reject a published sibling the platform filter hid from the install', () => {
    const sha = 'abc1234abc1234abc1234abc1234abc1234abc12';
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
      `${JSON.stringify({
        packages: [
          { name: 'example', url: `https://pkg.pr.new/example@${sha}` },
          { name: 'example-linux', url: `https://pkg.pr.new/example-linux@${sha}` },
        ],
      })}\n`,
    );

    assert.throws(
      () =>
        verifyPreviewInstall({
          from: source,
          metadata,
          sha,
          install(command, args, options) {
            if (args[0] === 'pack') {
              const [, url] = args;
              const name = url.slice('https://pkg.pr.new/'.length, url.lastIndexOf('@'));
              return `${JSON.stringify([
                { name, version: name === 'example' ? '0.0.0-preview-abc1234' : '1.0.0' },
              ])}\n`;
            }
            if (args[0] !== 'install') return;
            const modules = join(options.cwd, 'node_modules');
            mkdirSync(join(modules, 'example'), { recursive: true });
            writeFileSync(
              join(modules, 'example', 'package.json'),
              `${JSON.stringify({
                name: 'example',
                version: '0.0.0-preview-abc1234',
                optionalDependencies: { 'example-linux': `https://pkg.pr.new/example-linux@${sha}` },
              })}\n`,
            );
          },
        }),
      /example-linux published 1\.0\.0, expected 0\.0\.0-preview-abc1234/u,
    );
  });

  it('should reject untrusted or stale metadata before invoking npm', () => {
    const source = temporaryDirectory();
    const root = join(source, '00');
    const metadata = join(source, 'preview.json');
    mkdirSync(root);
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'example' }) + '\n');

    for (const url of ['https://example.com/example@abc1234', 'https://pkg.pr.new/example@stale00']) {
      writeFileSync(metadata, JSON.stringify({ packages: [{ name: 'example', url }] }) + '\n');
      let installs = 0;
      assert.throws(
        () =>
          verifyPreviewInstall({
            from: source,
            metadata,
            sha: 'abc1234',
            install: () => {
              installs += 1;
            },
          }),
        /untrusted or stale/u,
      );
      assert.equal(installs, 0);
    }
  });
});
