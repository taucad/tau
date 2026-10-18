// Two native kernel packages for the store tests, in a module of their own: a reported deployment is re-imported by
// its `entry`, which is this module's URL. One has Linux and macOS variants and a seal step; one is macOS only.
import { createHash } from 'node:crypto';
import { join } from 'node:path';

import type { ClosureLaunch } from '@taucad/runtime/preparation/node';
import { z } from 'zod';

import { defineNativeKernelDeployment } from '#native-kernel-adopter.js';

/** The URL every fixture deployment names as its entry. */
export const fixtureUrl = import.meta.url;

const payload = (name: string, byteLength: number) => ({
  name,
  integrity: `sha256-${createHash('sha256').update(name).digest('base64')}`,
  byteLength,
  format: 'tar.gz',
  origin: { kind: 'url', urls: [`https://example.test/${name}.tar.gz`] },
  destination: 'engine',
});

export const engineManifest = {
  schemaVersion: 1,
  kernels: { engine: { requires: ['runtime'], extensions: ['eng'] } },
  dependencies: {
    runtime: [
      {
        target: { runtime: 'native', os: 'linux', arch: 'x64', libc: 'glibc' },
        payloads: [payload('engine-linux', 3000)],
      },
      { target: { runtime: 'native', os: 'darwin', arch: 'arm64' }, payloads: [payload('engine-darwin', 2000)] },
    ],
  },
};
export const voxelManifest = {
  schemaVersion: 1,
  kernels: { voxel: { requires: ['runtime'], extensions: ['vox'] } },
  dependencies: {
    runtime: [{ target: { runtime: 'native', os: 'darwin', arch: 'arm64' }, payloads: [payload('voxel', 5000)] }],
  },
};

const options = z.object({ executable: z.string(), runtimePath: z.string() });
const optionsFromClosure = ({ root }: ClosureLaunch) => ({
  executable: join(root, 'bin', 'worker'),
  runtimePath: root,
});
export const seal = async (): Promise<undefined> => undefined;

export const engineNative = defineNativeKernelDeployment({
  package: '@acme/engine',
  ecosystem: 'none',
  manifest: engineManifest,
  moduleUrl: import.meta.url,
  packageRoot: 'file:///packages/engine/',
  optionsSchema: options,
  optionsFromClosure,
  seal,
  launchSet: () => ['bin/worker'],
});
export const voxelNative = defineNativeKernelDeployment({
  package: '@acme/voxel',
  ecosystem: 'nuget',
  manifest: voxelManifest,
  moduleUrl: import.meta.url,
  packageRoot: 'file:///packages/voxel/',
  optionsSchema: options,
  optionsFromClosure,
  launchSet: (files) => files.map(({ path }) => path),
});
export const deployments = [engineNative, voxelNative];
