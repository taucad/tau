/**
 * The desktop's side of the native payload store (charter W6 phase 1, D5, D10, D21, D24).
 *
 * The app ships the sealed closures of its native kernels under `Contents/Resources/payloads/closures/sha256/<hex>`,
 * the store's own layout. At startup main seeds the shared store from them: each closure the store lacks is cloned
 * (`/bin/cp -c -R`, a copy only where a clone fails) into staging, verified file by file against its receipt, checked
 * against the pins `tau-plugin.json` declares, and published by `rename`, as a preparation publishes one. A closure
 * already sealed is never copied again. Main then reads the launch indexes and posts what each kernel runs from to
 * the kernel utilities, and collects the store's garbage. Nothing here downloads.
 *
 * @module
 */
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { nativeKernelIdsSupportedOn, preparationPluginsOf } from '@taucad/native-process-core/store';
import {
  computeTreeIntegrity,
  createPreparationHost,
  detectHostIndicators,
  readManagedPreparation,
  reverifyClosure,
} from '@taucad/runtime/preparation/node';
import type {
  ClosureDescription,
  ClosureReceipt,
  GarbageReport,
  Integrity,
  ManagedPreparation,
  PreparationHost,
  PreparationPlugin,
} from '@taucad/runtime/preparation/node';

import { desktopNativeDeployments } from '#tau/desktop-native-deployments.js';
import { nativeKernelsFrameType } from '#tau/native-kernels-frame.js';
import type { NativeKernelsFrame, NativeKernelSlot } from '#tau/native-kernels-frame.js';

const execFileAsync = promisify(execFile);

/**
 * The native packages the desktop bundles: each deployment's `tau-plugin.json` rows with its launch set, without its
 * seal step or package directory. Main only seeds sealed closures from the bundle and reads their launch indexes; it
 * never runs a seal, and nothing it prepares ships inside a package (its bundle holds no package tree).
 */
export const desktopNativePlugins: readonly PreparationPlugin[] = preparationPluginsOf(desktopNativeDeployments).map(
  ({ seal: _seal, directory: _directory, ...plugin }) => plugin,
);

/**
 * The native kernels this machine can run, advertised to the renderer's product catalog: every bundled kernel whose
 * required dependencies declare a variant for this host.
 * @returns Kernel names, in list order; none when the host cannot be identified.
 */
export const desktopNativeKernelIds = (): readonly string[] => {
  const indicators = detectHostIndicators();
  return indicators === undefined ? [] : nativeKernelIdsSupportedOn(desktopNativeDeployments, indicators);
};

/**
 * Open the preparation host main seeds and inspects through. It never downloads: main only seeds from the bundle and
 * reads receipts, and the managed profile's seed and selection apply as they do for every other host.
 * @param input - The store root, this installation's path (its GC root) and the managed profile.
 * @returns The host.
 */
export const openDesktopPreparationHost = (input: {
  readonly store: string;
  readonly hostPath: string;
  readonly managed: ManagedPreparation;
  readonly plugins?: readonly PreparationPlugin[];
}): PreparationHost =>
  createPreparationHost({
    plugins: input.plugins ?? desktopNativePlugins,
    store: input.store,
    hostPath: input.hostPath,
    ...(input.managed.seed === undefined ? {} : { seed: input.managed.seed }),
    selection: input.managed.selection,
  });

/**
 * Copy a directory tree whose target does not exist yet: an APFS clone on macOS (no new blocks), a reflink where a
 * Linux filesystem has one, and a plain copy only where neither works (D24). Never Node's `copyFile`.
 * @param source - The tree to copy.
 * @param target - The new tree; its parent exists.
 * @returns How the tree was copied.
 */
export const cloneTree = async (source: string, target: string): Promise<'clone' | 'copy'> => {
  if (process.platform === 'win32') {
    throw new Error('Native kernels do not run on Windows, so the desktop seeds no closure there.');
  }
  if (process.platform === 'darwin') {
    try {
      await execFileAsync('/bin/cp', ['-c', '-R', source, target]);
      return 'clone';
    } catch {
      // Another volume, or a filesystem without clonefile(2): copy instead.
      await rm(target, { recursive: true, force: true });
    }
    await execFileAsync('/bin/cp', ['-R', source, target]);
    return 'copy';
  }
  await execFileAsync('cp', ['-R', '--reflink=auto', source, target]);
  return 'clone';
};

/** The `closures/sha256/<hex>` key an SRI sha256 integrity names. */
const closureKey = (integrity: Integrity): string => {
  const [algorithm, digest] = integrity.split('-', 2);
  if (algorithm !== 'sha256' || digest === undefined) {
    throw new Error(`A closure key is a sha256 integrity, not ${integrity}.`);
  }
  return Buffer.from(digest, 'base64').toString('hex');
};

/** Rewrite `<store>/generation` atomically, as every seal does (D21). */
const advanceGeneration = async (store: string): Promise<void> => {
  const temporary = join(store, `generation.${randomUUID()}.tmp`);
  await writeFile(temporary, `${randomUUID()}\n`, { mode: 0o644 });
  await rename(temporary, join(store, 'generation'));
};

const exists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

/** What seeding did for one declared dependency. */
export type SeedOutcome = {
  readonly package: string;
  readonly dependency: string;
  /**
   * - `present`: the store already held it sealed; nothing was copied.
   * - `seeded`: it was cloned from the bundle, verified and published.
   * - `refused`: the bundled closure failed verification; nothing was published.
   * - `absent`: neither the store nor the bundle holds it.
   * - `unsupported`: no declared variant fits this host.
   */
  readonly status: 'present' | 'seeded' | 'refused' | 'absent' | 'unsupported';
  readonly closureIntegrity?: Integrity;
  /** For `seeded`, whether the tree was cloned or copied. */
  readonly copy?: 'clone' | 'copy';
  /** For `refused`, the closure-relative paths that differ, or the receipt fields that do not match. */
  readonly files?: readonly string[];
  readonly message?: string;
};

/**
 * Check a staged copy of a bundled closure through the store's identity path: its receipt names the package,
 * dependency and pins this host selects, its rows give the `treeIntegrity` it records, and every file matches its row
 * with no file the receipt does not list.
 * @returns What differs; empty when the copy is the sealed closure the manifest pins.
 */
const verifyStagedClosure = async (
  root: string,
  expected: ClosureDescription & { readonly closureIntegrity: Integrity },
  signal: AbortSignal,
): Promise<readonly string[]> => {
  let receipt: ClosureReceipt;
  try {
    receipt = JSON.parse(await readFile(join(root, 'receipt.json'), 'utf8')) as ClosureReceipt;
  } catch {
    return ['receipt.json'];
  }
  if (
    receipt.package !== expected.package ||
    receipt.dependency !== expected.dependency ||
    receipt.closureIntegrity !== expected.closureIntegrity ||
    !Array.isArray(receipt.files) ||
    receipt.treeIntegrity !== (await computeTreeIntegrity(receipt.files))
  ) {
    return ['receipt.json'];
  }
  return (await reverifyClosure(root, signal)) ?? ['receipt.json'];
};

/**
 * Seed the store from the closures the app bundles, through the identity path (D24): only a closure the store lacks
 * is copied, into staging; it is published only once every file matches its receipt and the receipt names the pins
 * `tau-plugin.json` declares for this host; and a closure another host published first is adopted. Idempotent: a
 * second run copies nothing.
 * @param input - The host, its store root, the bundled `payloads` directory and cancellation; `clone` for tests.
 * @returns One outcome per declared dependency.
 */
export const seedNativeStore = async (input: {
  readonly host: PreparationHost;
  readonly store: string;
  readonly bundle: string | undefined;
  readonly signal: AbortSignal;
  readonly clone?: typeof cloneTree;
}): Promise<readonly SeedOutcome[]> => {
  const { host, store, bundle, signal } = input;
  const clone = input.clone ?? cloneTree;
  const outcomes: SeedOutcome[] = [];
  for (const description of await host.describe()) {
    const { package: packageName, dependency, closureIntegrity } = description;
    const row = { package: packageName, dependency, ...(closureIntegrity === undefined ? {} : { closureIntegrity }) };
    if (description.state === 'unsupported') {
      outcomes.push({ ...row, status: 'unsupported' });
      continue;
    }
    if (description.state === 'ready') {
      outcomes.push({ ...row, status: 'present' });
      continue;
    }
    if (description.state === 'stale') {
      /* Sealed by another Tau version: preparing re-verifies it in place, offline, and downloads nothing. */
      // oxlint-disable-next-line no-await-in-loop -- one dependency at a time, in manifest order
      const outcome = await host.prepare({ package: packageName, dependencies: [dependency], offline: true, signal });
      outcomes.push({ ...row, status: outcome.status === 'ready' ? 'present' : 'absent' });
      continue;
    }
    const key = closureIntegrity === undefined ? undefined : closureKey(closureIntegrity);
    const source = bundle === undefined || key === undefined ? undefined : join(bundle, 'closures', 'sha256', key);
    // oxlint-disable-next-line no-await-in-loop -- ditto
    if (closureIntegrity === undefined || key === undefined || source === undefined || !(await exists(source))) {
      outcomes.push({ ...row, status: 'absent' });
      continue;
    }
    /* `tmp/` is the store's staging root, on the store's volume so the publish is one `rename`; an entry without an
     * owner record is swept only once it is a day old, so a concurrent GC leaves it alone. */
    const staging = join(store, 'tmp', `seed-${randomUUID()}`);
    const staged = join(staging, key);
    try {
      // oxlint-disable-next-line no-await-in-loop -- ditto
      await mkdir(staging, { recursive: true });
      // oxlint-disable-next-line no-await-in-loop -- ditto
      const copy = await clone(source, staged);
      if (process.platform === 'darwin') {
        /* A clone keeps the bundle's extended attributes, and an app opened from a download carries the quarantine
         * flag on every file it holds. The bytes are verified below, as a download's are, and a downloaded closure
         * carries no flag either. */
        // oxlint-disable-next-line no-await-in-loop -- ditto
        await execFileAsync('/usr/bin/xattr', ['-r', '-d', 'com.apple.quarantine', staged]).catch(() => undefined);
      }
      // oxlint-disable-next-line no-await-in-loop -- ditto
      const damaged = await verifyStagedClosure(staged, { ...description, closureIntegrity }, signal);
      if (damaged.length > 0) {
        outcomes.push({
          ...row,
          status: 'refused',
          files: damaged.slice(0, 100),
          message: `The ${packageName} closure in this app differs from its receipt (${damaged.slice(0, 3).join(', ')}); it was not installed. Reinstall Tau.`,
        });
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- ditto
      await mkdir(join(store, 'closures', 'sha256'), { recursive: true });
      try {
        // oxlint-disable-next-line no-await-in-loop -- ditto
        await rename(staged, join(store, 'closures', 'sha256', key));
      } catch (error) {
        const { code } = error as NodeJS.ErrnoException;
        if (code !== 'EEXIST' && code !== 'ENOTEMPTY' && code !== 'EPERM') {
          throw error;
        }
        // Another host published the same closure first; its receipt names the same pins.
      }
      /* A new seal changes what the store holds: every memo keyed on the old generation re-reads its receipts. */
      // oxlint-disable-next-line no-await-in-loop -- ditto
      await advanceGeneration(store);
      outcomes.push({ ...row, status: 'seeded', copy });
    } finally {
      // oxlint-disable-next-line no-await-in-loop -- ditto
      await rm(staging, { recursive: true, force: true });
    }
  }
  return outcomes;
};

/**
 * The frame main posts to the kernel utilities: each declared native kernel with the sealed closure its launch index
 * names, or why it has none, and the store it read them from. A kernel no declared variant fits this host is left out;
 * the utility reads the store for it, which says why it cannot run here.
 * @param input - The host, the store's real path, its plugins and what seeding did.
 * @returns The frame.
 */
export const composeDesktopNativeKernels = async (input: {
  readonly host: PreparationHost;
  readonly store: string;
  readonly plugins?: readonly PreparationPlugin[];
  readonly outcomes: readonly SeedOutcome[];
}): Promise<NativeKernelsFrame> => {
  const kernels: NativeKernelSlot[] = [];
  for (const plugin of input.plugins ?? desktopNativePlugins) {
    for (const [kernel, { requires, extensions }] of Object.entries(plugin.deployment.kernels)) {
      // oxlint-disable-next-line no-await-in-loop -- two small launch indexes, read in list order
      const state = await input.host.inspectLaunch({ package: plugin.package, dependencies: requires });
      const closure = state.status === 'ready' ? state.closures[requires[0]] : undefined;
      if (closure !== undefined) {
        kernels.push({ kernel, package: plugin.package, extensions, closure });
        continue;
      }
      if (state.status === 'blocked' && state.reason === 'unsupported-target') {
        continue;
      }
      const refused = input.outcomes.find((outcome) => outcome.package === plugin.package && outcome.message);
      kernels.push({
        kernel,
        package: plugin.package,
        extensions,
        refusal:
          refused?.message ??
          `The ${kernel} runtime is not in this machine's payload store. Run \`tau prepare ${kernel}\`, then open the file again.`,
      });
    }
  }
  return { type: nativeKernelsFrameType, store: input.store, kernels };
};

/** What main does with the store once per launch, for its log. */
export type NativeStoreReport = {
  readonly store: string;
  readonly seeding: readonly SeedOutcome[];
  readonly garbage?: GarbageReport;
};

/**
 * Main's startup work on the payload store: seed it from the bundle, post the native composition to the kernel
 * utilities (always exactly once, with every kernel refused when seeding failed, so no utility waits for ever), then
 * collect the store's garbage (D21). Never rejects.
 * @param input - The store root, the bundled `payloads` directory (absent unpackaged), this installation's path, the
 *   managed profile's environment, where to post the frame, a log and cancellation.
 * @returns What happened.
 */
export const startNativeStore = async (input: {
  readonly store: string;
  readonly bundle: string | undefined;
  readonly hostPath: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly post: (frame: NativeKernelsFrame) => void;
  readonly log: (level: 'info' | 'warn' | 'error', event: string, detail: unknown) => void;
  readonly signal: AbortSignal;
  readonly plugins?: readonly PreparationPlugin[];
  readonly clone?: typeof cloneTree;
}): Promise<NativeStoreReport | undefined> => {
  const plugins = input.plugins ?? desktopNativePlugins;
  let host: PreparationHost | undefined;
  let posted = false;
  try {
    /* The native sandbox grants a closure by its real path, so the store is composed by its real path too. */
    await mkdir(input.store, { recursive: true });
    const store = await realpath(input.store);
    host = openDesktopPreparationHost({
      store,
      hostPath: input.hostPath,
      managed: readManagedPreparation(input.environment),
      plugins,
    });
    const seeding = await seedNativeStore({
      host,
      store,
      bundle: input.bundle,
      signal: input.signal,
      ...(input.clone === undefined ? {} : { clone: input.clone }),
    });
    input.log(seeding.some(({ status }) => status === 'refused') ? 'error' : 'info', 'native.seed', { store, seeding });
    input.post(await composeDesktopNativeKernels({ host, store, plugins, outcomes: seeding }));
    posted = true;
    /* Every closure this installation uses is now linked, so a collection keeps them. */
    const garbage = await host.collectGarbage({ signal: input.signal });
    input.log('info', 'native.gc', garbage);
    return { store, seeding, garbage };
  } catch (error) {
    input.log('error', 'native.store', error);
    if (!posted) {
      const message = `Tau could not open its payload store at ${input.store}: ${error instanceof Error ? error.message : String(error)}`;
      input.post({
        type: nativeKernelsFrameType,
        store: input.store,
        kernels: plugins.flatMap((plugin) =>
          Object.entries(plugin.deployment.kernels).map(([kernel, { extensions }]) => ({
            kernel,
            package: plugin.package,
            extensions,
            refusal: message,
          })),
        ),
      });
    }
    return undefined;
  } finally {
    host?.dispose();
  }
};
