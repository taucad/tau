import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

import {
  parseTargetPylock,
  readUvLockVersions,
  renderProjectPylock,
  renderProjectPyproject,
} from '@taucad/python-kernel-core/template';
import { describe, expect, it } from 'vitest';

import { build123dProjectLibraries } from '#project-manifest.js';

const packageRoot = resolve(import.meta.dirname, '..');
/** `@taucad/python-kernel-core`, whose `python/interpreter.json` names the targets Build123d's closure exists for. */
const coreRoot = dirname(createRequire(import.meta.url).resolve('@taucad/python-kernel-core/package.json'));
const read = async (path: string, root = packageRoot): Promise<string> => readFile(resolve(root, path), 'utf8');
const owner = { packageName: '@taucad/build123d', project: 'build123d', kernelId: 'build123d' };

describe('the build123d project template', () => {
  it('is what the generator renders from the committed per-target pylocks', async () => {
    const interpreter = JSON.parse(await read('python/interpreter.json', coreRoot)) as {
      readonly targets: ReadonlyArray<{ readonly key: string }>;
    };
    const targets = await Promise.all(
      interpreter.targets.map(async ({ key }) => parseTargetPylock(await read(`python/pylock.${key}.toml`))),
    );

    expect(await read('project/pylock.toml')).toBe(renderProjectPylock(targets, owner));
    expect(await read('project/pyproject.toml')).toBe(
      renderProjectPyproject(build123dProjectLibraries, targets, owner),
    );
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
