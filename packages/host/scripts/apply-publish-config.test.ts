import { execFileSync } from 'node:child_process';
import { linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const script = join(import.meta.dirname, 'apply-publish-config.mts');

const development = {
  exports: { '.': './src/index.ts' },
  imports: { '#*.js': './src/*.ts' },
  publishConfig: { access: 'public', exports: { '.': './dist/index.mjs' }, imports: {} },
};

const write = (path: string, value: unknown): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value));
};

const read = (path: string): { exports?: unknown } => JSON.parse(readFileSync(path, 'utf8')) as { exports?: unknown };

describe('apply-publish-config', () => {
  let root: string;
  let deploy: string;
  let source: string;
  let injected: string;
  let registry: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'apply-publish-config-'));
    deploy = join(root, 'deploy');
    source = join(root, 'workspace', 'packages', 'build123d', 'package.json');
    write(join(deploy, 'package.json'), { name: '@taucad/cli', ...development });
    write(source, { name: '@taucad/build123d', ...development });
    // `pnpm deploy` hard-links an injected workspace package's files to its source.
    injected = join(
      deploy,
      'node_modules/.pnpm/@taucad+build123d@file+packages+build123d/node_modules/@taucad/build123d',
    );
    mkdirSync(injected, { recursive: true });
    linkSync(source, join(injected, 'package.json'));
    registry = join(deploy, 'node_modules/.pnpm/left-pad@1.3.0/node_modules/left-pad/package.json');
    write(registry, { name: 'left-pad', ...development });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('applies publishConfig to the deploy root and injected workspace packages only', () => {
    const output = execFileSync(process.execPath, [script, deploy], { encoding: 'utf8' });

    expect(output).toContain('publishConfig applied to 2 of 2 workspace manifests');
    for (const manifest of [join(deploy, 'package.json'), join(injected, 'package.json')]) {
      expect(read(manifest)).toMatchObject({ exports: { '.': './dist/index.mjs' }, imports: {} });
    }
    expect(read(registry).exports).toEqual({ '.': './src/index.ts' });
  });

  it('leaves the hard-linked workspace source unchanged', () => {
    execFileSync(process.execPath, [script, deploy]);

    expect(read(source).exports).toEqual({ '.': './src/index.ts' });
  });
});
