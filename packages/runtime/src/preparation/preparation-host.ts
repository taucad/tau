import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { Topic } from '@taucad/events';
import { admitCapacityWrite, measureCapacityDomain } from '@taucad/filesystem';

import { computeClosureIntegrity, computeTreeIntegrity } from '#preparation/closure-receipt.js';
import { runSealStep, SealRefused } from '#preparation/closure-seal.js';
import { verifyClosureTree } from '#preparation/closure-verify.js';
import { detectHostIndicators } from '#preparation/host-indicators.js';
import { acquirePayload, locallyAvailable, OfflineMiss } from '#preparation/payload-source.js';
import type { AcquiredPayload, AcquisitionContext } from '#preparation/payload-source.js';
import { unpackedBytesOf, unpackPayload } from '#preparation/payload-install.js';
import { PreparationError } from '#preparation/preparation-error.js';
import {
  advanceGeneration,
  blobKey,
  collectStoreGarbage,
  createStaging,
  linkEntry,
  readLink,
  readReceipt,
  sealClosure,
  sha256Key,
  storeLayout,
  sweepStaging,
  writeAtomically,
  writeLink,
} from '#preparation/preparation-store.js';
import { targetKey } from '#preparation/plugin-deployment.js';
import { selectVariant } from '#preparation/select-variant.js';
import type {
  ClosureDescription,
  ClosureVerification,
  CollectGarbageInput,
  CreatePreparationHostOptions,
  GarbageReport,
  PluginPreparation,
  PluginSelection,
  PreparationHost,
  PreparationPlugin,
  PreparationState,
  PrepareInput,
  PrepareOutcome,
  VariantSelection,
  VerifyInput,
} from '#preparation/preparation-host.types.js';
import type {
  ClosureReceipt,
  DependencyPayload,
  DependencyTarget,
  DependencyVariant,
  HostIndicators,
  Integrity,
  ReceiptFile,
} from '#preparation/preparation.types.js';
import { packageVersion } from '#utils/package-info.js';

const downloadConcurrency = 4;
const extractionConcurrency = 2;
/** Byte progress is emitted at most this often per attempt; phase changes always are. Milliseconds. */
const progressInterval = 100;
const reportedFileLimit = 100;

type Resolved =
  | {
      readonly kind: 'selected';
      readonly dependency: string;
      readonly variant: DependencyVariant;
      readonly selection: Extract<VariantSelection, { status: 'selected' }>;
      readonly closureIntegrity: Integrity;
      readonly key: string;
    }
  | {
      readonly kind: 'blocked';
      readonly dependency: string;
      readonly message: string;
      readonly detail: {
        readonly axis: NonNullable<Extract<VariantSelection, { status: 'unsupported' }>['axis']>;
        readonly nearest?: DependencyTarget;
      };
    };

type DependencyState =
  | {
      readonly state: 'ready' | 'stale';
      readonly receipt: ClosureReceipt;
      readonly key: string;
      readonly better?: DependencyTarget;
      readonly resolved: Resolved;
    }
  | { readonly state: 'absent'; readonly resolved: Extract<Resolved, { kind: 'selected' }> }
  | { readonly state: 'unsupported'; readonly resolved: Extract<Resolved, { kind: 'blocked' }> };

type Attempt = {
  readonly id: string;
  readonly controller: AbortController;
  callers: number;
  readonly promise: Promise<PrepareOutcome>;
};

type WorkItem = Extract<Resolved, { kind: 'selected' }>;

const hostKeyOf = (indicators: HostIndicators): string =>
  indicators.os === 'linux'
    ? `linux-${indicators.arch}-${indicators.libc ?? 'unknown-libc'}`
    : `${indicators.os}-${indicators.arch}`;

const megabytes = (byteLength: number): string => `${(byteLength / 1e6).toFixed(1)} MB`;

const limiter = (limit: number): (<T>(task: () => Promise<T>) => Promise<T>) => {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= limit) {
      const turn = Promise.withResolvers<void>();
      waiting.push(turn.resolve);
      await turn.promise;
    }
    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  };
};

// Run every task with at most `limit` in flight; the first failure aborts the rest, and nothing is left running
// when this settles, so the caller may delete what the tasks were writing.
const runAll = async <T>(
  items: readonly T[],
  options: { readonly limit: number; readonly signal: AbortSignal },
  task: (item: T, signal: AbortSignal) => Promise<void>,
): Promise<void> => {
  const { limit, signal } = options;
  const controller = new AbortController();
  const combined = AbortSignal.any([signal, controller.signal]);
  let next = 0;
  let failure: { readonly error: unknown } | undefined;
  const lane = async (): Promise<void> => {
    while (next < items.length && failure === undefined) {
      const item = items[next] as T;
      next += 1;
      try {
        // oxlint-disable-next-line no-await-in-loop -- each lane runs one task at a time
        await task(item, combined);
      } catch (error) {
        failure ??= { error };
        controller.abort(error);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  if (failure !== undefined) {
    signal.throwIfAborted();
    throw failure.error instanceof Error ? failure.error : new Error(String(failure.error));
  }
};

/**
 * Create the preparation host (API 4) for a Node host: `tau mcp`, `tau export`, `tau prepare`, the daemon parent
 * and the desktop main process compose one each, over one shared store.
 *
 * `prepare` selects each dependency's variant from the host's indicators, takes every payload from the store, the
 * seed, the mirror or its pinned origins (in that order, four downloads at a time), verifies the bytes before
 * writing them, unpacks them into staging while hashing each file, writes the receipt last and publishes the closure
 * with one `rename`. Verified blobs are kept, so a failed or cancelled attempt resumes with what is missing. Two
 * calls for one selection in this host join one attempt; two processes race by `rename` and the loser adopts the
 * winner's receipt. Free space is admitted before any download.
 * @param options - Plugins, store root and the managed profile.
 * @returns The host.
 * @public
 * @example <caption>Prepare build123d's runtime for `tau mcp`</caption>
 * ```typescript
 * import { createPreparationHost, parsePluginDeployment } from '@taucad/runtime/preparation/node';
 *
 * const host = createPreparationHost({
 *   store: '/var/lib/tau/payloads',
 *   plugins: [{ package: '@taucad/build123d', deployment: parsePluginDeployment(manifest) }],
 * });
 * const outcome = await host.prepare({ package: '@taucad/build123d', signal: AbortSignal.timeout(900_000) });
 * ```
 */
export const createPreparationHost = (options: CreatePreparationHostOptions): PreparationHost => {
  const layout = storeLayout(resolve(options.store));
  const plugins = new Map(options.plugins.map((plugin) => [plugin.package, plugin]));
  const indicators = options.indicators ?? detectHostIndicators();
  const hostPath = resolve(options.hostPath ?? process.argv[1] ?? process.execPath);
  const tauVersion = options.tauVersion ?? packageVersion;
  const transport: typeof fetch = options.fetch ?? (async (input, init) => fetch(input, init));
  const events = new Topic<PluginPreparation>({ name: 'PreparationHost.preparation' });
  const revisions = new Map<string, number>();
  const attempts = new Map<string, Attempt>();
  const declaredKeys = new Map<string, Promise<ReadonlyMap<string, DependencyVariant>>>();
  let disposed = false;

  const pluginOf = (packageName: string): PreparationPlugin => {
    const plugin = plugins.get(packageName);
    if (plugin === undefined) {
      const known = [...plugins.keys()].join(', ') || 'none';
      throw new Error(`No plugin '${packageName}' is registered with this preparation host. Registered: ${known}.`);
    }
    return plugin;
  };

  const normalize = (
    selection: PluginSelection,
  ): { readonly plugin: PreparationPlugin; readonly dependencies: readonly string[]; readonly key: string } => {
    const plugin = pluginOf(selection.package);
    const declared = Object.keys(plugin.deployment.dependencies);
    const dependencies = [...new Set(selection.dependencies ?? declared)].toSorted();
    for (const dependency of dependencies) {
      if (!declared.includes(dependency)) {
        throw new Error(`${plugin.package} declares no dependency '${dependency}'. Declared: ${declared.join(', ')}.`);
      }
    }
    return { plugin, dependencies, key: `${plugin.package}\0${dependencies.join('\0')}` };
  };

  const nextRevision = (key: string): number => {
    const revision = (revisions.get(key) ?? 0) + 1;
    revisions.set(key, revision);
    return revision;
  };

  const emit = (selection: PluginSelection, key: string, state: PreparationState): void => {
    if (!disposed) {
      events.emit({ selection, revision: nextRevision(key), state });
    }
  };

  // Closure key to variant for every declared variant of a dependency, computed once per host.
  const declaredVariants = async (
    plugin: PreparationPlugin,
    dependency: string,
  ): Promise<ReadonlyMap<string, DependencyVariant>> => {
    const id = linkEntry(plugin.package, dependency);
    let variants = declaredKeys.get(id);
    if (variants === undefined) {
      const keyed = async (): Promise<ReadonlyMap<string, DependencyVariant>> => {
        const entries = await Promise.all(
          (plugin.deployment.dependencies[dependency] ?? []).map(
            async (variant) => [sha256Key(await computeClosureIntegrity(variant.payloads)), variant] as const,
          ),
        );
        return new Map(entries);
      };
      variants = keyed();
      declaredKeys.set(id, variants);
    }
    return variants;
  };

  const resolveDependency = async (plugin: PreparationPlugin, dependency: string): Promise<Resolved> => {
    if (indicators === undefined) {
      return {
        kind: 'blocked',
        dependency,
        message: `Tau has no native runtime for ${process.platform}-${process.arch}; ${plugin.package} cannot run on this machine.`,
        detail: { axis: 'os' },
      };
    }
    const variants = plugin.deployment.dependencies[dependency] ?? [];
    if (indicators.os === 'win32' && variants.some(({ target }) => target.runtime === 'native')) {
      return {
        kind: 'blocked',
        dependency,
        message: `Native kernels do not run on Windows yet: Tau has no Windows sandbox, and no native worker runs unsandboxed. Use macOS or Linux (glibc) for ${plugin.package}.`,
        detail: { axis: 'os' },
      };
    }
    const selection = selectVariant(variants, indicators, options.selection ?? {});
    if (selection.status === 'unsupported') {
      const nearest = selection.nearest === undefined ? 'none' : targetKey(selection.nearest);
      const forced = options.selection?.target;
      return {
        kind: 'blocked',
        dependency,
        message:
          forced === undefined
            ? `${plugin.package} declares no ${dependency} variant for this host (${hostKeyOf(indicators)}; failing axis: ${selection.axis}; nearest declared: ${nearest}).`
            : `TAU_PAYLOAD_TARGET=${forced} names no ${dependency} variant that ${plugin.package} declares for this host (failing axis: ${selection.axis}; nearest declared: ${nearest}).`,
        detail: { axis: selection.axis, ...(selection.nearest === undefined ? {} : { nearest: selection.nearest }) },
      };
    }
    const closureIntegrity = await computeClosureIntegrity(selection.variant.payloads);
    return {
      kind: 'selected',
      dependency,
      variant: selection.variant,
      selection,
      closureIntegrity,
      key: sha256Key(closureIntegrity),
    };
  };

  // What a launch would use: the closure this host recorded while it is still a declared variant, else the one
  // selection picks now. A sealed closure launches as recorded; a better variant is reported, never fetched here.
  const dependencyState = async (
    plugin: PreparationPlugin,
    dependency: string,
    link: Readonly<Record<string, string>>,
  ): Promise<DependencyState> => {
    const resolved = await resolveDependency(plugin, dependency);
    const recorded = link[linkEntry(plugin.package, dependency)];
    const declared = await declaredVariants(plugin, dependency);
    if (recorded !== undefined && declared.has(recorded)) {
      const receipt = await readReceipt(layout, recorded);
      if (receipt !== undefined) {
        const better = resolved.kind === 'selected' && resolved.key !== recorded ? resolved.variant.target : undefined;
        return {
          state: receipt.tauVersion === tauVersion ? 'ready' : 'stale',
          receipt,
          key: recorded,
          resolved,
          ...(better === undefined ? {} : { better }),
        };
      }
    }
    if (resolved.kind === 'blocked') {
      return { state: 'unsupported', resolved };
    }
    const receipt = await readReceipt(layout, resolved.key);
    if (receipt === undefined) {
      return { state: 'absent', resolved };
    }
    return { state: receipt.tauVersion === tauVersion ? 'ready' : 'stale', receipt, key: resolved.key, resolved };
  };

  const blockedState = (
    attemptId: string,
    resolved: Extract<Resolved, { kind: 'blocked' }>,
  ): Extract<PreparationState, { status: 'blocked' }> => ({
    status: 'blocked',
    attemptId,
    reason: 'unsupported-target',
    message: resolved.message,
    detail: resolved.detail,
  });

  const inspect = async (input: PluginSelection): Promise<PluginPreparation> => {
    const { plugin, dependencies, key } = normalize(input);
    const selection = { package: plugin.package, dependencies };
    const link = await readLink(layout, hostPath);
    const states = await Promise.all(dependencies.map(async (dependency) => dependencyState(plugin, dependency, link)));
    const unsupported = states.find((state) => state.state === 'unsupported');
    if (unsupported?.state === 'unsupported') {
      return { selection, revision: nextRevision(key), state: blockedState(randomUUID(), unsupported.resolved) };
    }
    const ready = states.filter(
      (state): state is Extract<DependencyState, { state: 'ready' | 'stale' }> => state.state === 'ready',
    );
    if (ready.length !== dependencies.length) {
      return { selection, revision: nextRevision(key), state: { status: 'idle' } };
    }
    const receipts: Record<string, ClosureReceipt> = {};
    const better: Record<string, DependencyTarget> = {};
    const used: Record<string, string> = {};
    for (const state of ready) {
      receipts[state.receipt.dependency] = state.receipt;
      used[linkEntry(plugin.package, state.receipt.dependency)] = state.key;
      if (state.better !== undefined) {
        better[state.receipt.dependency] = state.better;
      }
    }
    await writeLink(layout, hostPath, used);
    return {
      selection,
      revision: nextRevision(key),
      state: {
        status: 'ready',
        attemptId: randomUUID(),
        receipts,
        ...(Object.keys(better).length === 0 ? {} : { betterVariantAvailable: better }),
      },
    };
  };

  const silent = { onPhase: () => undefined, onBytes: () => undefined };
  const acquisitionContext = (
    plugin: PreparationPlugin,
    attempt: Pick<AcquisitionContext, 'staging' | 'offline' | 'signal' | 'indexes'> &
      Partial<Pick<AcquisitionContext, 'onPhase' | 'onBytes'>>,
  ): AcquisitionContext => ({
    layout,
    fetch: transport,
    ...(options.mirror === undefined ? {} : { mirror: options.mirror }),
    ...(options.seed === undefined ? {} : { seed: options.seed }),
    ...(plugin.directory === undefined ? {} : { directory: plugin.directory }),
    ...silent,
    ...attempt,
  });

  // Re-unpack, from verified blobs, only the payloads whose files differ, and remove files the receipt does not list.
  const repairClosure = async (input: {
    readonly plugin: PreparationPlugin;
    readonly receipt: ClosureReceipt;
    readonly variant: DependencyVariant;
    readonly payloads: readonly string[];
    readonly extra: readonly string[];
    /** Run the plugin's seal step again once the payloads are restored. */
    readonly reseal: boolean;
    readonly offline: boolean;
    readonly signal: AbortSignal;
  }): Promise<void> => {
    const { receipt, signal } = input;
    const staging = await createStaging(layout, `repair-${randomUUID()}`);
    try {
      const indexes: AcquisitionContext['indexes'] = new Map();
      for (const payload of input.variant.payloads.filter(({ name }) => input.payloads.includes(name))) {
        const context = acquisitionContext(input.plugin, { staging, offline: input.offline, signal, indexes });
        // oxlint-disable-next-line no-await-in-loop -- payloads are repaired one at a time
        const acquired = await acquirePayload(payload, context);
        const unpacked = join(staging, `unpack-${payload.name}`);
        // oxlint-disable-next-line no-await-in-loop -- ditto
        const rows = await unpackPayload({ payload, bytes: acquired.bytes, root: unpacked, signal });
        for (const row of rows) {
          const target = join(receipt.root, ...row.path.split('/'));
          // oxlint-disable-next-line no-await-in-loop -- each file replaces its damaged copy in place
          await mkdir(dirname(target), { recursive: true });
          // oxlint-disable-next-line no-await-in-loop -- ditto
          await rm(target, { recursive: true, force: true });
          // oxlint-disable-next-line no-await-in-loop -- ditto
          await rename(join(unpacked, ...row.path.split('/')), target);
        }
      }
      await Promise.all(
        input.extra.map(async (path) => rm(join(receipt.root, ...path.split('/')), { recursive: true, force: true })),
      );
      if (input.reseal) {
        // The seal step's files derive from the payloads' files, so every one is removed and the step runs again over
        // the repaired closure; a step that skips files it finds present then never keeps a stale one.
        await Promise.all(
          receipt.files
            .filter((row) => row.payload === undefined)
            .map(async (row) => rm(join(receipt.root, ...row.path.split('/')), { force: true })),
        );
        const resealed = await runSealStep({
          plugin: input.plugin,
          dependency: receipt.dependency,
          target: receipt.target,
          root: receipt.root,
          files: receipt.files.filter((row) => row.payload !== undefined),
          signal,
        });
        if ('refusal' in resealed) {
          throw new SealRefused(resealed.refusal);
        }
      }
      await advanceGeneration(layout);
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  };

  const verifyReceipt = async (input: {
    readonly plugin: PreparationPlugin;
    readonly receipt: ClosureReceipt;
    readonly key: string;
    readonly repair: boolean;
    readonly offline: boolean;
    readonly signal: AbortSignal;
  }): Promise<ClosureVerification> => {
    const { plugin, receipt, signal } = input;
    const base = {
      package: plugin.package,
      dependency: receipt.dependency,
      closureIntegrity: receipt.closureIntegrity,
    };
    const found = await verifyClosureTree(receipt, signal);
    if (found.changed.length === 0 && found.extra.length === 0) {
      return { ...base, status: 'intact', payloads: [], files: [] };
    }
    const declared = await declaredVariants(plugin, receipt.dependency);
    const variant = declared.get(input.key);
    const named = new Set(found.changed.map((row) => row.payload));
    const order = (variant?.payloads ?? []).map(({ name }) => name);
    // A row with no payload was written by the seal step: rerunning it restores the row, unless the plugin has none.
    const sealedRowChanged = named.has(undefined);
    const payloads = sealedRowChanged && plugin.seal === undefined ? order : order.filter((name) => named.has(name));
    const files = [...found.changed.map((row) => row.path), ...found.extra].toSorted().slice(0, reportedFileLimit);
    if (!input.repair || variant === undefined) {
      return { ...base, status: 'stale', payloads, files };
    }
    try {
      await repairClosure({
        plugin,
        receipt,
        variant,
        payloads,
        extra: found.extra,
        reseal: plugin.seal !== undefined && (sealedRowChanged || payloads.length > 0),
        offline: input.offline,
        signal,
      });
    } catch (error) {
      if (error instanceof OfflineMiss) {
        return { ...base, status: 'stale', payloads, files };
      }
      throw error;
    }
    const after = await verifyClosureTree(receipt, signal);
    if (after.changed.length > 0 || after.extra.length > 0) {
      throw new PreparationError(
        'INTEGRITY_MISMATCH',
        `Repairing ${plugin.package} ${receipt.dependency} did not restore ${after.changed[0]?.path ?? after.extra[0] ?? 'its files'}; the store at ${layout.root} is being changed by something else.`,
      );
    }
    return { ...base, status: 'repaired', payloads, files };
  };

  // Split the selected closures into those already sealed and those to build. A closure sealed by another Tau
  // version is re-verified file by file and repaired locally before it is trusted.
  const reuseSealed = async (input: {
    readonly plugin: PreparationPlugin;
    readonly selected: readonly WorkItem[];
    readonly offline: boolean;
    readonly signal: AbortSignal;
  }): Promise<{
    readonly receipts: Record<string, ClosureReceipt>;
    readonly work: WorkItem[];
    readonly unrepairable?: string;
  }> => {
    const { plugin, signal } = input;
    const receipts: Record<string, ClosureReceipt> = {};
    const work: WorkItem[] = [];
    for (const item of input.selected) {
      // oxlint-disable-next-line no-await-in-loop -- one receipt read per dependency
      const sealed = await readReceipt(layout, item.key);
      if (sealed === undefined) {
        work.push(item);
        continue;
      }
      if (sealed.tauVersion === tauVersion) {
        receipts[item.dependency] = sealed;
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- ditto
      const verified = await verifyReceipt({
        plugin,
        receipt: sealed,
        key: item.key,
        repair: true,
        offline: input.offline,
        signal,
      });
      if (verified.status === 'stale') {
        return { receipts, work, unrepairable: item.dependency };
      }
      const refreshed: ClosureReceipt = { ...sealed, tauVersion, preparedAt: new Date().toISOString() };
      // oxlint-disable-next-line no-await-in-loop -- ditto
      await writeAtomically(join(sealed.root, 'receipt.json'), `${JSON.stringify(refreshed, undefined, 2)}\n`);
      // oxlint-disable-next-line no-await-in-loop -- ditto
      await advanceGeneration(layout);
      receipts[item.dependency] = refreshed;
    }
    return { receipts, work };
  };

  // Payload names no local source holds: existence checks only, never a request.
  const missingLocally = async (
    plugin: PreparationPlugin,
    payloads: ReadonlyArray<{ readonly payload: DependencyPayload }>,
    attempt: Pick<AcquisitionContext, 'signal' | 'indexes'>,
  ): Promise<string[]> => {
    const missing: string[] = [];
    const context = acquisitionContext(plugin, { staging: layout.staging, offline: true, ...attempt });
    for (const { payload } of payloads) {
      // oxlint-disable-next-line no-await-in-loop -- the first local hit answers each payload
      const available = await locallyAvailable(payload, context);
      if (!available) {
        missing.push(payload.name);
      }
    }
    return missing;
  };

  // Admit the write before any download: the blobs still to fetch plus every closure to unpack.
  const admit = async (
    plugin: PreparationPlugin,
    input: {
      readonly payloads: ReadonlyArray<{ readonly payload: DependencyPayload }>;
      readonly work: readonly WorkItem[];
    },
  ): Promise<void> => {
    const stored = await Promise.all(input.payloads.map(async ({ payload }) => blobKey(layout, payload.integrity)));
    const downloadBytes = input.payloads.reduce(
      (sum, { payload }, index) => sum + (stored[index] === undefined ? payload.byteLength : 0),
      0,
    );
    const unpackBytes = input.work
      .flatMap((item) => item.variant.payloads)
      .reduce((sum, payload) => sum + unpackedBytesOf(payload), 0);
    await mkdir(layout.root, { recursive: true });
    const decision = admitCapacityWrite({
      measurement: await measureCapacityDomain({ kind: 'volume', path: layout.root }),
      request: { bytes: downloadBytes + unpackBytes, kind: 'cache' },
    });
    if (decision.decision === 'refuse' && decision.code !== 'capacity-unmeasured') {
      throw new PreparationError(
        'STORE_EXHAUSTED',
        `Preparing ${plugin.package} needs ${megabytes(downloadBytes + unpackBytes)} in ${layout.root} beyond the space kept free for project revisions; free ${megabytes(decision.shortfallBytes)} more. Run tau prepare --gc to remove closures no Tau installation uses, then try again.`,
      );
    }
  };

  const run = async (input: {
    readonly attemptId: string;
    readonly plugin: PreparationPlugin;
    readonly dependencies: readonly string[];
    readonly key: string;
    readonly offline: boolean;
    readonly signal: AbortSignal;
  }): Promise<PrepareOutcome> => {
    const { attemptId, plugin, key, signal } = input;
    const selection = { package: plugin.package, dependencies: input.dependencies };
    const finish = (state: PrepareOutcome): PrepareOutcome => {
      emit(selection, key, state);
      return state;
    };
    let staging: string | undefined;
    try {
      const resolved = await Promise.all(
        input.dependencies.map(async (dependency) => resolveDependency(plugin, dependency)),
      );
      const blocked = resolved.find((item) => item.kind === 'blocked');
      if (blocked?.kind === 'blocked') {
        return finish(blockedState(attemptId, blocked));
      }
      const selected = resolved as WorkItem[];
      // Name the closures this host is about to use before building them, so a concurrent GC keeps them.
      await writeLink(
        layout,
        hostPath,
        Object.fromEntries(selected.map((item) => [linkEntry(plugin.package, item.dependency), item.key])),
      );

      const reused = await reuseSealed({ plugin, selected, offline: input.offline, signal });
      if (reused.unrepairable !== undefined) {
        return finish({
          status: 'blocked',
          attemptId,
          reason: 'offline-miss',
          message: `${plugin.package} ${reused.unrepairable} needs repair from payloads that are not in the store, and this host may not download.`,
        });
      }
      const { receipts, work } = reused;
      if (work.length === 0) {
        return finish({ status: 'ready', attemptId, receipts });
      }

      // One acquisition per pin, however many closures name it.
      const unique = new Map<
        Integrity,
        {
          readonly payload: DependencyPayload;
          readonly uses: Array<{ readonly item: WorkItem; readonly payload: DependencyPayload }>;
        }
      >();
      for (const item of work) {
        for (const payload of item.variant.payloads) {
          const entry = unique.get(payload.integrity) ?? { payload, uses: [] };
          entry.uses.push({ item, payload });
          unique.set(payload.integrity, entry);
        }
      }
      const payloads = [...unique.values()];
      const indexes: AcquisitionContext['indexes'] = new Map();

      if (input.offline) {
        const missing = await missingLocally(plugin, payloads, { signal, indexes });
        if (missing.length > 0) {
          return finish({
            status: 'blocked',
            attemptId,
            reason: 'offline-miss',
            message: `${plugin.package} is not prepared and ${missing.length} of its payloads (${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', …' : ''}) are in neither the store nor the seed; this host may not download. Prepare it online or seed the store.`,
          });
        }
      }
      await admit(plugin, { payloads, work });

      await sweepStaging(layout, Date.now());
      const attemptStaging = await createStaging(layout, attemptId);
      staging = attemptStaging;
      await Promise.all(work.map(async (item) => mkdir(join(attemptStaging, item.key), { recursive: true })));

      const totalBytes = payloads.reduce((sum, { payload }) => sum + payload.byteLength, 0);
      const received = new Map<Integrity, number>();
      let completedPayloads = 0;
      let lastProgress = 0;
      const progress = (
        phase: 'downloading' | 'verifying' | 'extracting' | 'sealing',
        payload: string,
        force: boolean,
      ): void => {
        const now = Date.now();
        if (!force && now - lastProgress < progressInterval) {
          return;
        }
        lastProgress = now;
        const completedBytes = payloads.reduce(
          (sum, entry) => sum + Math.min(received.get(entry.payload.integrity) ?? 0, entry.payload.byteLength),
          0,
        );
        emit(selection, key, {
          status: 'preparing',
          attemptId,
          phase,
          payload,
          completedPayloads,
          totalPayloads: payloads.length,
          completedBytes,
          totalBytes,
        });
      };

      const rows = new Map<string, Map<string, readonly ReceiptFile[]>>(work.map((item) => [item.key, new Map()]));
      const sources = new Map<Integrity, AcquiredPayload['acquiredFrom']>();
      const keys = new Map<Integrity, string>();
      const extract = limiter(extractionConcurrency);
      await runAll(payloads, { limit: downloadConcurrency, signal }, async ({ payload, uses }, laneSignal) => {
        const acquired = await acquirePayload(
          payload,
          acquisitionContext(plugin, {
            staging: attemptStaging,
            offline: input.offline,
            signal: laneSignal,
            indexes,
            onPhase: (phase) => {
              progress(phase, payload.name, true);
            },
            onBytes: (bytes) => {
              received.set(payload.integrity, bytes);
              progress('downloading', payload.name, false);
            },
          }),
        );
        received.set(payload.integrity, payload.byteLength);
        sources.set(payload.integrity, acquired.acquiredFrom);
        keys.set(payload.integrity, acquired.key);
        await extract(async () => {
          for (const use of uses) {
            progress('extracting', use.payload.name, true);
            // oxlint-disable-next-line no-await-in-loop -- one closure at a time per payload
            const written = await unpackPayload({
              payload: use.payload,
              bytes: acquired.bytes,
              root: join(attemptStaging, use.item.key),
              signal: laneSignal,
            });
            rows.get(use.item.key)?.set(use.payload.name, written);
          }
        });
        completedPayloads += 1;
      });

      for (const item of work) {
        const unpacked = item.variant.payloads
          .flatMap(({ name }) => rows.get(item.key)?.get(name) ?? [])
          .toSorted((left, right) => (left.path < right.path ? -1 : 1));
        if (plugin.seal !== undefined) {
          progress('sealing', item.dependency, true);
        }
        // oxlint-disable-next-line no-await-in-loop -- one seal per dependency
        const sealed = await runSealStep({
          plugin,
          dependency: item.dependency,
          target: item.variant.target,
          root: join(attemptStaging, item.key),
          files: unpacked,
          signal,
        });
        if ('refusal' in sealed) {
          const { reason, message, detail } = sealed.refusal;
          return finish({ status: 'blocked', attemptId, reason, message, ...(detail === undefined ? {} : { detail }) });
        }
        const files = [...unpacked, ...sealed.rows].toSorted((left, right) => (left.path < right.path ? -1 : 1));
        // oxlint-disable-next-line no-await-in-loop -- ditto
        const treeIntegrity = await computeTreeIntegrity(files);
        const root = join(layout.closures, item.key);
        const receipt: ClosureReceipt = {
          package: plugin.package,
          dependency: item.dependency,
          target: item.variant.target,
          selection: { host: indicators!, candidates: item.selection.candidates, emulated: item.selection.emulated },
          root,
          closureIntegrity: item.closureIntegrity,
          treeIntegrity,
          files,
          payloads: item.variant.payloads.map((payload) => ({
            name: payload.name,
            integrity: payload.integrity,
            sha256: keys.get(payload.integrity) ?? '',
            acquiredFrom: sources.get(payload.integrity) ?? { kind: 'origin', location: '' },
          })),
          preparedAt: new Date().toISOString(),
          tauVersion,
        };
        signal.throwIfAborted();
        const staged = join(attemptStaging, item.key);
        // The receipt is the last file written inside staging: its presence after the rename is the seal.
        // oxlint-disable-next-line no-await-in-loop -- ditto
        await writeFile(join(staged, 'receipt.json'), `${JSON.stringify(receipt, undefined, 2)}\n`, { flag: 'wx' });
        // oxlint-disable-next-line no-await-in-loop -- ditto
        receipts[item.dependency] = await sealClosure(layout, staged, item.key);
      }
      await advanceGeneration(layout);
      return finish({ status: 'ready', attemptId, receipts });
    } catch (error) {
      if (signal.aborted) {
        return finish({ status: 'cancelled', attemptId });
      }
      if (error instanceof OfflineMiss) {
        return finish({ status: 'blocked', attemptId, reason: 'offline-miss', message: error.message });
      }
      if (error instanceof SealRefused) {
        const { reason, message, detail } = error.refusal;
        return finish({ status: 'blocked', attemptId, reason, message, ...(detail === undefined ? {} : { detail }) });
      }
      const failure =
        error instanceof PreparationError
          ? error
          : (error as NodeJS.ErrnoException).code === 'ENOSPC' || (error as NodeJS.ErrnoException).code === 'EDQUOT'
            ? new PreparationError(
                'STORE_EXHAUSTED',
                `The store at ${layout.root} ran out of space. Run tau prepare --gc, then try again.`,
                { cause: error },
              )
            : new PreparationError(
                'EXTRACTION_REFUSED',
                `Writing ${plugin.package} into the store at ${layout.root} failed: ${error instanceof Error ? error.message : String(error)}`,
                { cause: error },
              );
      emit(selection, key, { status: 'failed', attemptId, code: failure.code, message: failure.message });
      throw failure;
    } finally {
      if (staging !== undefined) {
        await rm(staging, { recursive: true, force: true });
      }
    }
  };

  // One caller's view of an attempt: its abort resolves `cancelled` for that caller alone; the attempt itself stops
  // only when every joined caller has left.
  const joinAttempt = async (attempt: Attempt, signal: AbortSignal): Promise<PrepareOutcome> => {
    attempt.callers += 1;
    const left = Promise.withResolvers<PrepareOutcome>();
    const onAbort = (): void => {
      left.resolve({ status: 'cancelled', attemptId: attempt.id });
    };
    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
    }
    try {
      return await Promise.race([attempt.promise, left.promise]);
    } finally {
      signal.removeEventListener('abort', onAbort);
      attempt.callers -= 1;
      if (attempt.callers === 0) {
        attempt.controller.abort(signal.reason);
      }
    }
  };

  const tracked = async (key: string, input: Parameters<typeof run>[0]): Promise<PrepareOutcome> => {
    try {
      return await run(input);
    } finally {
      attempts.delete(key);
    }
  };

  return {
    inspect,
    async prepare(input: PrepareInput): Promise<PrepareOutcome> {
      if (disposed) {
        throw new Error('This preparation host was disposed; create another to prepare.');
      }
      const { plugin, dependencies, key } = normalize(input);
      let attempt = attempts.get(key);
      if (attempt === undefined) {
        const controller = new AbortController();
        const attemptId = randomUUID();
        const promise = tracked(key, {
          attemptId,
          plugin,
          dependencies,
          key,
          offline: input.offline === true,
          signal: controller.signal,
        });
        attempt = { id: attemptId, controller, callers: 0, promise };
        attempts.set(key, attempt);
      }
      return joinAttempt(attempt, input.signal);
    },
    async verify(input: VerifyInput): Promise<readonly ClosureVerification[]> {
      const { plugin, dependencies } = normalize(input);
      const link = await readLink(layout, hostPath);
      const results: ClosureVerification[] = [];
      for (const dependency of dependencies) {
        // oxlint-disable-next-line no-await-in-loop -- closures are verified one at a time; each is already parallel
        const state = await dependencyState(plugin, dependency, link);
        if (state.state !== 'ready' && state.state !== 'stale') {
          results.push({
            package: plugin.package,
            dependency,
            ...(state.resolved.kind === 'selected' ? { closureIntegrity: state.resolved.closureIntegrity } : {}),
            status: 'absent',
            payloads: [],
            files: [],
          });
          continue;
        }
        // oxlint-disable-next-line no-await-in-loop -- ditto
        const verified = await verifyReceipt({
          plugin,
          receipt: state.receipt,
          key: state.key,
          repair: input.repair === true,
          offline: input.offline === true,
          signal: input.signal,
        }).catch((error: unknown) => {
          throw error instanceof SealRefused
            ? new PreparationError('EXTRACTION_REFUSED', error.message, { cause: error })
            : error;
        });
        results.push(verified);
      }
      return results;
    },
    async describe(): Promise<readonly ClosureDescription[]> {
      const link = await readLink(layout, hostPath);
      const rows = await Promise.all(
        [...plugins.values()].flatMap((plugin) =>
          Object.keys(plugin.deployment.dependencies).map(async (dependency): Promise<ClosureDescription> => {
            const state = await dependencyState(plugin, dependency, link);
            const base = { package: plugin.package, dependency };
            if (state.state === 'unsupported') {
              return { ...base, state: 'unsupported' };
            }
            const variant = state.resolved.kind === 'selected' ? state.resolved.variant : undefined;
            const byteLength = variant?.payloads.reduce((sum, payload) => sum + payload.byteLength, 0);
            if (state.state === 'absent') {
              return {
                ...base,
                state: 'absent',
                closureIntegrity: state.resolved.closureIntegrity,
                target: state.resolved.variant.target,
                ...(byteLength === undefined ? {} : { byteLength }),
              };
            }
            return {
              ...base,
              state: state.state,
              closureIntegrity: state.receipt.closureIntegrity,
              target: state.receipt.target,
              ...(byteLength === undefined ? {} : { byteLength }),
              ...(state.better === undefined ? {} : { betterVariantAvailable: state.better }),
            };
          }),
        ),
      );
      return rows;
    },
    async collectGarbage(input: CollectGarbageInput = {}): Promise<GarbageReport> {
      return collectStoreGarbage(layout, {
        dryRun: input.dryRun === true,
        now: Date.now(),
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      });
    },
    on(_event, handler, subscribeOptions) {
      return events.subscribe(handler, subscribeOptions);
    },
    dispose() {
      disposed = true;
      for (const attempt of attempts.values()) {
        attempt.controller.abort(new Error('The preparation host was disposed.'));
      }
      events.dispose();
    },
  };
};
