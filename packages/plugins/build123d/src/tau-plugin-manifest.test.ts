import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { integrityToHex } from '@taucad/archive-core';
import { parsePluginDeployment, selectVariant, targetKey } from '@taucad/runtime/preparation/node';
import type { DependencyTarget, HostIndicators, SelectVariantOptions } from '@taucad/runtime/preparation/node';
import { describe, expect, it } from 'vitest';

import { build123dKernel } from '#build123d.kernel.js';

const packageRoot = resolve(import.meta.dirname, '..');
const read = (path: string): string => readFileSync(join(packageRoot, ...path.split('/')), 'utf8');

const deployment = parsePluginDeployment(JSON.parse(read('tau-plugin.json')) as unknown, 'tau-plugin.json');
const interpreter = JSON.parse(read('python/interpreter.json')) as {
  readonly release: string;
  readonly targets: ReadonlyArray<{
    readonly key: string;
    readonly interpreter: { readonly asset: string; readonly sha256: string; readonly byteLength: number };
  }>;
};
const variants = deployment.dependencies['engine'] ?? [];

/** Each `[[packages.wheels]]` entry of a pylock file: its URL, size and the publisher's sha256. */
const lockedWheels = (key: string): Map<string, { readonly size: number; readonly sha256: string }> => {
  const wheels = new Map<string, { readonly size: number; readonly sha256: string }>();
  const pattern = /^url = "(?<url>[^"]+)"\nsize = (?<size>\d+)\nhashes = \{ sha256 = "(?<sha256>[\da-f]{64})" \}$/gmu;
  for (const match of read(`python/pylock.${key}.toml`).matchAll(pattern)) {
    wheels.set(match.groups!['url']!, { size: Number(match.groups!['size']), sha256: match.groups!['sha256']! });
  }
  return wheels;
};

describe('Build123d tau-plugin.json', () => {
  it('should declare one engine variant per pinned target, the kernel row matching the kernel', () => {
    expect(variants.map(({ target }) => targetKey(target))).toEqual(interpreter.targets.map(({ key }) => key));
    const kernel = build123dKernel({
      pythonExecutable: '/closure/python/bin/python3',
      pythonSha256: 'a'.repeat(64),
      workerPath: '/closure/tau-worker/worker.py',
      workerSha256: 'b'.repeat(64),
      supportFiles: [
        { path: '/closure/tau-worker/analyzer.py', sha256: 'c'.repeat(64) },
        { path: '/closure/tau-worker/glb.py', sha256: 'd'.repeat(64) },
      ],
    });
    expect(deployment.kernels).toEqual({ [kernel.id]: { requires: ['engine'], extensions: [...kernel.extensions] } });
  });

  it.each(variants.map((variant) => [targetKey(variant.target), variant] as const))(
    'should pin %s to the publisher digests, decoded back from each integrity',
    (key, variant) => {
      const wheels = lockedWheels(key);
      const pinned = interpreter.targets.find((target) => target.key === key)!.interpreter;
      const payloads = variant.payloads.map((payload) => ({ payload, hex: integrityToHex(payload.integrity).hex }));

      const python = payloads.find(({ payload }) => payload.name === 'python')!;
      expect(python.payload.origin).toEqual({
        kind: 'url',
        urls: [
          `https://github.com/astral-sh/python-build-standalone/releases/download/${interpreter.release}/${encodeURIComponent(pinned.asset)}`,
        ],
      });
      expect({ hex: python.hex, byteLength: python.payload.byteLength }).toEqual({
        hex: pinned.sha256,
        byteLength: pinned.byteLength,
      });

      const wheelPayloads = payloads.filter(({ payload }) => payload.format === 'wheel');
      expect(wheelPayloads).toHaveLength(wheels.size);
      for (const { payload, hex } of wheelPayloads) {
        const url = payload.origin.kind === 'url' ? payload.origin.urls[0] : undefined;
        expect(wheels.get(url ?? ''), payload.name).toEqual({ size: payload.byteLength, sha256: hex });
      }

      const workers = payloads.filter(({ payload }) => payload.origin.kind === 'packagePath');
      expect(workers.map(({ payload }) => payload.name)).toEqual(['worker.py', 'analyzer.py', 'glb.py']);
      for (const { payload, hex } of workers) {
        const bytes = readFileSync(join(packageRoot, 'python', payload.name));
        expect(payload).toMatchObject({ format: 'raw', destination: 'tau-worker', byteLength: bytes.byteLength });
        expect(hex, payload.name).toBe(createHash('sha256').update(bytes).digest('hex'));
      }
    },
  );

  it('should install only darwin-arm64 wheels its pylock pins', () => {
    const locked = new Set([...lockedWheels('darwin-arm64').values()].map(({ sha256 }) => sha256));
    const variant = variants.find(({ target }) => targetKey(target) === 'darwin-arm64')!;
    const wheels = variant.payloads.filter(({ format }) => format === 'wheel');

    expect(wheels.length).toBeGreaterThan(0);
    for (const wheel of wheels) {
      expect(locked.has(integrityToHex(wheel.integrity).hex), wheel.name).toBe(true);
    }
  });
});

type NativeTarget = Extract<DependencyTarget, { runtime: 'native' }>;

// The host that declared target describes, standing exactly on its floor.
const hostOf = (target: NativeTarget, version?: string): HostIndicators => {
  const floor = version ?? (target.os === 'linux' ? target.minimumLibcVersion : target.minimumOsVersion);
  return target.os === 'linux'
    ? {
        os: 'linux',
        arch: target.arch,
        libc: target.libc,
        ...(floor === undefined ? {} : { libcVersion: floor }),
        translated: false,
        wasm: { threads: false },
      }
    : {
        os: target.os,
        arch: target.arch,
        ...(floor === undefined ? {} : { osVersion: floor }),
        translated: false,
        wasm: { threads: false },
      };
};

// One step under a dotted floor: `2.31` → `2.30`, `12.0` → `11.99`.
const below = (floor: string): string => {
  const [major = 0, minor = 0] = floor.split('.').map(Number);
  return minor === 0 ? `${String(major - 1)}.99` : `${String(major)}.${String(minor - 1)}`;
};

const nearestOf = (target: DependencyTarget | undefined): string => (target === undefined ? 'none' : targetKey(target));

const answer = (host: HostIndicators, options?: SelectVariantOptions): string => {
  const selection = selectVariant(variants, host, options);
  return selection.status === 'selected'
    ? `${targetKey(selection.variant.target)}${selection.emulated ? ' (emulated)' : ''}`
    : `unsupported ${selection.axis}, nearest ${nearestOf(selection.nearest)}`;
};

describe('Build123d targets (charter D15–D18, W14)', () => {
  const natives = variants.map(({ target }) => target as NativeTarget);

  it('should declare darwin arm64 and x64 and glibc Linux arm64 and x64, each with a floor', () => {
    expect(natives.map((target) => targetKey(target)).toSorted()).toEqual([
      'darwin-arm64',
      'darwin-x64',
      'linux-arm64-glibc',
      'linux-x64-glibc',
    ]);
    for (const target of natives) {
      expect(target.os === 'linux' ? target.minimumLibcVersion : target.minimumOsVersion, targetKey(target)).toMatch(
        /^\d+\.\d+$/u,
      );
    }
  });

  it('should take every interpreter from the install_only_stripped assets', () => {
    for (const { key, interpreter: pinned } of interpreter.targets) {
      expect(pinned.asset, key).toMatch(/-install_only_stripped\.tar\.gz$/u);
    }
  });

  // Total over the declared targets: each one's own host selects it on its floor, and one step under the floor
  // either falls back through Rosetta 2 (darwin-arm64 only) or refuses on the floor axis before any download.
  it.each(natives.map((target) => [targetKey(target), target] as const))(
    'should select %s on its own host and refuse it under its floor',
    (key, target) => {
      const floor = target.os === 'linux' ? target.minimumLibcVersion! : target.minimumOsVersion!;
      const under = answer(hostOf(target, below(floor)));

      expect(answer(hostOf(target))).toBe(key);
      if (key === 'darwin-arm64') {
        expect(under).toBe('darwin-x64 (emulated)');
      } else {
        const axis = target.os === 'linux' ? 'minimumLibcVersion' : 'minimumOsVersion';
        expect(under).toBe(`unsupported ${axis}, nearest ${key}`);
      }
    },
  );

  const linux = (arch: HostIndicators['arch'], libc: 'glibc' | 'musl', libcVersion?: string): HostIndicators => ({
    os: 'linux',
    arch,
    libc,
    ...(libcVersion === undefined ? {} : { libcVersion }),
    translated: false,
    wasm: { threads: false },
  });
  const other = (os: 'darwin' | 'win32', arch: HostIndicators['arch'], osVersion: string): HostIndicators => ({
    os,
    arch,
    osVersion,
    translated: false,
    wasm: { threads: false },
  });

  it.each<{
    readonly name: string;
    readonly host: HostIndicators;
    readonly options?: SelectVariantOptions;
    readonly expected: string;
  }>([
    {
      name: 'glibc 2.28 (S17: OCP needs manylinux_2_31)',
      host: linux('x64', 'glibc', '2.28'),
      expected: 'unsupported minimumLibcVersion, nearest linux-x64-glibc',
    },
    { name: 'musl (alpine)', host: linux('x64', 'musl'), expected: 'unsupported libc, nearest linux-x64-glibc' },
    { name: 'musl on arm64', host: linux('arm64', 'musl'), expected: 'unsupported libc, nearest linux-arm64-glibc' },
    // The preparation host refuses every Windows native kernel before selection (D18); selection agrees.
    { name: 'win32-x64', host: other('win32', 'x64', '10.0.26100'), expected: 'unsupported os, nearest darwin-arm64' },
    {
      name: 'win32-arm64',
      host: other('win32', 'arm64', '10.0.26100'),
      expected: 'unsupported os, nearest darwin-arm64',
    },
    {
      name: 'macOS forced to the declared linux-x64-glibc',
      host: other('darwin', 'arm64', '26.0'),
      options: { target: 'linux-x64-glibc' },
      expected: 'linux-x64-glibc',
    },
    {
      name: 'macOS forced to the undeclared linux-x64-musl',
      host: other('darwin', 'arm64', '26.0'),
      options: { target: 'linux-x64-musl' },
      expected: 'unsupported libc, nearest linux-x64-glibc',
    },
  ])('should answer a $name host as declared', ({ host, options, expected }) => {
    expect(answer(host, options)).toBe(expected);
  });
});
