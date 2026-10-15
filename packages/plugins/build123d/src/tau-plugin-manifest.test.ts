import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { integrityToHex } from '@taucad/archive-core';
import { parsePluginDeployment, targetKey } from '@taucad/runtime/preparation/node';
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
