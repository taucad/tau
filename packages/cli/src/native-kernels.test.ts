import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { build123dNative } from '@taucad/build123d/native';
import type { NativeKernelDeployment } from '@taucad/native-process-core/adopter';
import type { NativeDeploymentReport } from '@taucad/native-process-core/store';
import { picogkNative } from '@taucad/picogk/native';
import type { KernelIssue } from '@taucad/runtime/kernel';
import { parsePluginDeployment } from '@taucad/runtime/preparation/node';
import type * as PreparationNode from '@taucad/runtime/preparation/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  describeRuntime,
  inspectReportedClosure,
  openNativePreparation,
  preparableKernelsOf,
  preparationPluginsFor,
  shippedDeploymentsOf,
  shippedKernelsOf,
  unpreparedKernelError,
  verifyStoreClosure,
} from '#native-kernels.js';

/* The stores each preparation host is opened over; the hosts themselves are the real ones. */
const opened = vi.hoisted(() => ({ stores: [] as string[] }));
vi.mock('@taucad/runtime/preparation/node', async (importOriginal) => {
  const actual = await importOriginal<typeof PreparationNode>();
  return {
    ...actual,
    createPreparationHost: (options: Parameters<typeof actual.createPreparationHost>[0]) => {
      opened.stores.push(options.store);
      return actual.createPreparationHost(options);
    },
  };
});

const rowOf = (deployment: NativeKernelDeployment, kernels: readonly string[]): NativeDeploymentReport[number] => ({
  package: deployment.package,
  entry: deployment.entry,
  packageRoot: deployment.packageRoot,
  manifest: deployment.manifest,
  kernels,
});

/* What a thread building the CLI runtime reports for the built-in native kernels. */
const builtIns: NativeDeploymentReport = [rowOf(build123dNative, ['build123d']), rowOf(picogkNative, ['picogk'])];

const requestOf = (deployment: NativeKernelDeployment, kernel: string) => ({
  package: deployment.package,
  kernel,
  manifest: deployment.manifest,
  packageRoot: deployment.packageRoot,
});

describe('native kernels from the payload store', () => {
  let configDirectory: string;

  beforeEach(async () => {
    configDirectory = await mkdtemp(join(tmpdir(), 'tau-native-kernels-'));
    vi.stubEnv('TAU_CONFIG_DIR', configDirectory);
    vi.stubEnv('TAU_ACQUISITION', '');
    vi.stubEnv('TAU_PAYLOAD_DIR', '');
    vi.stubEnv('TAU_PAYLOAD_MIRROR', '');
    vi.stubEnv('TAU_PAYLOAD_TARGET', '');
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(configDirectory, { recursive: true, force: true });
  });

  it(
    'should describe the CLI runtime from a thread, reporting the native deployments it lists and its plugins',
    { timeout: 180_000 },
    async () => {
      const described = await describeRuntime({
        projectRoot: configDirectory,
        plugin: [],
        execArgv: ['--import', 'tsx'],
      });

      expect(described.report).toEqual(builtIns);
      expect(described.plugins).toEqual(expect.arrayContaining(['@taucad/build123d', '@taucad/picogk']));
    },
  );

  it('should list every kernel a report declares, with its extensions, from the manifests alone', () => {
    expect(preparableKernelsOf(builtIns)).toEqual([
      { kernel: 'build123d', extensions: ['py'] },
      { kernel: 'picogk', extensions: ['cs'] },
    ]);
  });

  it('should prepare a report with each package root and seal step, imported by the entry it names', async () => {
    const plugins = await preparationPluginsFor(builtIns);

    expect(plugins.map((plugin) => plugin.package)).toEqual(['@taucad/build123d', '@taucad/picogk']);
    expect(plugins.every((plugin) => typeof plugin.directory === 'string')).toBe(true);
    expect(plugins.find((plugin) => plugin.package === '@taucad/build123d')?.seal).toBeTypeOf('function');
  });

  it("should prepare from this CLI's own deployments of the packages it ships, whatever entry a report names", async () => {
    const foreign = { ...rowOf(picogkNative, ['picogk']), entry: 'file:///project/node_modules/evil/native.mjs' };
    const rustcad = { ...foreign, package: '@acme/rustcad', kernels: ['rustcad'] };

    const shipped = await shippedDeploymentsOf([rowOf(build123dNative, ['build123d']), foreign, rustcad]);

    expect(shipped.map(({ package: name, entry }) => ({ name, entry }))).toEqual([
      { name: '@taucad/build123d', entry: build123dNative.entry },
      { name: '@taucad/picogk', entry: picogkNative.entry },
    ]);
    await expect(shippedKernelsOf([...builtIns, rustcad])).resolves.toEqual(new Set(['build123d', 'picogk']));
    await expect(shippedKernelsOf([rustcad])).resolves.toEqual(new Set());
  });

  it('should name what differs when a worker exits before its handshake, and the repair', async () => {
    const root = join(configDirectory, 'closure');
    await mkdir(join(root, 'lib'), { recursive: true });
    const sha256 = createHash('sha256').update('bytes').digest('hex');
    await writeFile(join(root, 'lib', 'a.pyc'), 'bytes', { mode: 0o644 });
    await writeFile(
      join(root, 'receipt.json'),
      JSON.stringify({ files: [{ path: 'lib/a.pyc', byteLength: 5, sha256, mode: 0o644 }] }),
    );
    const signal = AbortSignal.timeout(10_000);

    await expect(verifyStoreClosure(root, signal)).resolves.toBeUndefined();
    await writeFile(join(root, 'lib', 'a.pyc'), 'BYTES');
    await expect(verifyStoreClosure(root, signal)).resolves.toEqual({
      files: ['lib/a.pyc'],
      remedy: 'Run `tau prepare --verify` to repair it.',
    });
    await rm(join(root, 'receipt.json'));
    await expect(verifyStoreClosure(root, signal)).resolves.toMatchObject({ files: ['receipt.json'] });
  });

  it("should answer a child's closure requests on a cold store with the bytes preparing downloads, downloading nothing", async () => {
    vi.stubEnv('TAU_PAYLOAD_TARGET', 'linux-x64-glibc');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const variant = parsePluginDeployment(build123dNative.manifest, 'build123d').dependencies['engine']?.find(
      ({ target }) => target.runtime === 'native' && target.os === 'linux' && target.arch === 'x64',
    );
    const expectedBytes = (variant?.payloads ?? []).reduce((sum, payload) => sum + payload.byteLength, 0);

    const build123d = await inspectReportedClosure(requestOf(build123dNative, 'build123d'));
    const picogk = await inspectReportedClosure(requestOf(picogkNative, 'picogk'));

    expect(expectedBytes).toBeGreaterThan(0);
    expect(build123d).toEqual({
      answer: { status: 'unavailable', reason: 'not-prepared', byteLength: expectedBytes },
      roots: [],
    });
    expect(picogk).toMatchObject({ answer: { status: 'unavailable', reason: 'unsupported-target' }, roots: [] });
    expect(fetchSpy).not.toHaveBeenCalled();
    const entries = await readdir(configDirectory, { recursive: true });
    expect(entries.filter((entry) => entry.includes('closures') || entry.includes('blobs'))).toEqual([]);
  });

  it('should read the store by its real path when it is reached through a link', async () => {
    /* As under macOS's `/tmp` (a link to `/private/tmp`), whose spelling a sandboxed worker cannot start through. */
    const realConfig = join(configDirectory, 'real');
    await mkdir(join(realConfig, 'payloads'), { recursive: true });
    const linkedConfig = join(configDirectory, 'linked');
    await symlink(realConfig, linkedConfig);
    vi.stubEnv('TAU_CONFIG_DIR', linkedConfig);
    opened.stores.length = 0;

    await inspectReportedClosure(requestOf(build123dNative, 'build123d'));

    const realStore = await realpath(join(linkedConfig, 'payloads'));
    expect(realStore).not.toBe(join(linkedConfig, 'payloads'));
    expect(new Set(opened.stores)).toEqual(new Set([realStore]));
  });

  it('should reject a malformed managed profile as a usage error', async () => {
    vi.stubEnv('TAU_ACQUISITION', 'not-a-profile');

    await expect(inspectReportedClosure(requestOf(build123dNative, 'build123d'))).rejects.toMatchObject({
      code: 'MANAGED_PROFILE_INVALID',
      exit: 2,
    });
  });

  it('should refuse to prepare an unknown kernel as a usage error, naming the kernels that can be prepared', async () => {
    const preparation = openNativePreparation({
      deployments: async () => [build123dNative, picogkNative],
      fetch: async () => {
        throw new Error('no request expected');
      },
    });
    try {
      await expect(preparation.prepare('nope', { signal: new AbortController().signal })).rejects.toMatchObject({
        code: 'UNKNOWN_KERNEL',
        exit: 2,
        message: "No native kernel is called 'nope'. Kernels that can be prepared: build123d, picogk.",
      });
    } finally {
      await preparation.dispose();
    }
  });
});

describe('unpreparedKernelError', () => {
  const issue = (code: KernelIssue['code'], details: Record<string, unknown>): KernelIssue => ({
    code,
    type: 'kernel',
    severity: 'error',
    message: `${code} message`,
    details,
  });

  it('should name the command that prepares a kernel that is not prepared', () => {
    expect(unpreparedKernelError([issue('KERNEL_NOT_PREPARED', { kernel: 'build123d' })])).toMatchObject({
      code: 'KERNEL_NOT_PREPARED',
      exit: 3,
      message:
        'The build123d kernel is not prepared on this machine. Run `tau prepare build123d` once, then export again.',
    });
  });

  it('should report a host the kernel declares no runtime for, in its own words', () => {
    expect(
      unpreparedKernelError([issue('KERNEL_CAPABILITY_MISSING', { kernel: 'picogk', reason: 'unsupported-target' })]),
    ).toMatchObject({ code: 'UNSUPPORTED_TARGET', exit: 3, message: 'KERNEL_CAPABILITY_MISSING message' });
  });

  it('should leave every other issue to the export', () => {
    expect(unpreparedKernelError([issue('KERNEL_CAPABILITY_MISSING', {})])).toBeUndefined();
    expect(unpreparedKernelError([issue('RUNTIME', { kernel: 'replicad' })])).toBeUndefined();
  });
});
