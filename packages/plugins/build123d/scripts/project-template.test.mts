import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { build123dProjectLibraries } from '#project-manifest.js';

// oxlint-disable-next-line no-restricted-imports -- The generator's own sibling module; scripts have no `#` alias.
import * as template from './project-template.mjs';

const { parseTargetPylock, readUvLockVersions, renderProjectPylock, renderProjectPyproject } = template;

const packageRoot = resolve(import.meta.dirname, '..');
const read = async (path: string): Promise<string> => readFile(resolve(packageRoot, path), 'utf8');

const targetPylock = (environment: string, packages: ReadonlyArray<readonly [string, string, string]>): string =>
  [
    'lock-version = "1.0"',
    `environments = [${JSON.stringify(environment)}]`,
    ...packages.flatMap(([name, version, wheel]) => [
      '',
      '[[packages]]',
      `name = "${name}"`,
      `version = "${version}"`,
      'index = "https://pypi.org/simple"',
      '',
      '[[packages.wheels]]',
      `name = "${wheel}"`,
      `url = "https://files.pythonhosted.org/${wheel}"`,
      'size = 7',
      `hashes = { sha256 = "${'a'.repeat(64)}" }`,
    ]),
  ].join('\n');

describe('the build123d project template', () => {
  it('is what the generator renders from the committed per-target pylocks', async () => {
    const interpreter = JSON.parse(await read('python/interpreter.json')) as {
      readonly targets: ReadonlyArray<{ readonly key: string }>;
    };
    const targets = await Promise.all(
      interpreter.targets.map(async ({ key }) => parseTargetPylock(await read(`python/pylock.${key}.toml`))),
    );

    expect(await read('project/pylock.toml')).toBe(renderProjectPylock(targets));
    expect(await read('project/pyproject.toml')).toBe(renderProjectPyproject(build123dProjectLibraries, targets));
  });

  it('locks in uv.lock exactly the versions of the closure, coverage aside', async () => {
    const closure = new Map<string, string>();
    for (const key of ['darwin-arm64', 'darwin-x64', 'linux-arm64-glibc', 'linux-x64-glibc']) {
      // oxlint-disable-next-line no-await-in-loop -- four small files, read in order.
      for (const { name, version } of parseTargetPylock(await read(`python/pylock.${key}.toml`)).packages) {
        closure.set(name, version);
      }
    }
    closure.delete('coverage');

    expect(Object.fromEntries(readUvLockVersions(await read('project/uv.lock')))).toEqual(Object.fromEntries(closure));
  });
});

describe('renderProjectPylock', () => {
  const darwin = "sys_platform == 'darwin'";
  const linux = "sys_platform == 'linux'";

  it('marks a package only some targets install and lists every target wheel once', () => {
    const text = renderProjectPylock([
      parseTargetPylock(
        targetPylock(darwin, [
          ['numpy', '2.0.0', 'numpy-mac.whl'],
          ['lib3mf', '2.5.0', 'lib3mf.whl'],
        ]),
      ),
      parseTargetPylock(
        targetPylock(linux, [
          ['numpy', '2.0.0', 'numpy-linux.whl'],
          ['coverage', '7.0', 'c.whl'],
        ]),
      ),
    ]);

    expect(text).toContain(`[[packages]]\nname = "lib3mf"\nversion = "2.5.0"\nmarker = "(${darwin})"\n`);
    expect(text).toContain('[[packages]]\nname = "numpy"\nversion = "2.0.0"\nindex = "https://pypi.org/simple"\n');
    expect(text.indexOf('numpy-linux.whl')).toBeLessThan(text.indexOf('numpy-mac.whl'));
    expect(text).not.toContain('coverage');
  });

  it('refuses targets that lock one package at different versions', () => {
    expect(() =>
      renderProjectPylock([
        parseTargetPylock(targetPylock(darwin, [['numpy', '2.0.0', 'a.whl']])),
        parseTargetPylock(targetPylock(linux, [['numpy', '2.1.0', 'b.whl']])),
      ]),
    ).toThrow('numpy is locked at 2.0.0 and 2.1.0 on different targets.');
  });

  it('refuses a pylock it did not write', () => {
    expect(() => parseTargetPylock('lock-version = "1.0"\n')).toThrow('expected exactly one environment');
    expect(() =>
      parseTargetPylock(targetPylock(darwin, [['numpy', '2.0.0', 'a.whl']]).replace(/^hashes.*$/mu, '')),
    ).toThrow('numpy has no sha256');
  });
});
