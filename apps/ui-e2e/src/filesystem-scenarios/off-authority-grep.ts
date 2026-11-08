/**
 * S19's grep and glob as production runs them: off the authority, in the agent
 * host, over a rooted bridge port onto the file-manager worker.
 *
 * The agent host composes the agent's view itself over a `'working-copy'`
 * bridge proxy, relayed as a provider (`createRelayedFileSystemProvider` in
 * `apps/ui/app/workers/agent-host.impl.ts`, mirrored by {@link relayedProvider}:
 * the members a search uses, the index's `statTree` with the view's mask
 * applied to its rows), and runs the chat RPC handlers over agent-tools'
 * `createProviderRpcFileSystem`; the scenario page plays that host. Every call the proxy sends is one call the authority serves, so the
 * tally here is the authority's own count of what it served this consumer.
 *
 * @module
 */
import { ResourceQueue } from '@taucad/filesystem';
import type { FileSystemProvider } from '@taucad/filesystem';
import { composeView } from '@taucad/filesystem/composed-view';
import type { ComposedView } from '@taucad/filesystem/composed-view';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import { createTransferredFileSystemBridgeProxy } from '@taucad/fs-bridge';
import type { FileSystemBridgeProxy } from '@taucad/fs-bridge';
import { handleGlobSearch, handleGrep } from '@taucad/chat/rpc';
import { createProviderRpcFileSystem } from '@taucad/agent-tools/registry';
import { fixtureMarker } from '#filesystem-scenarios/fixture.js';
import type { FixturePlan } from '#filesystem-scenarios/fixture.js';
import { countsAsFixtureRead } from '#filesystem-scenarios/scenarios.js';

/** Calls whose work is a grep or glob: one the authority serves runs the search on its own thread. */
const searchCalls = new Set(['grep', 'glob']);

/**
 * The bridge as the agent host's provider, as `createRelayedFileSystemProvider` builds it for a search.
 *
 * @param proxy - The page's end of the bridge, counted.
 * @returns The provider the agent's view composes over.
 */
const relayedProvider = (
  proxy: FileSystemBridgeProxy,
): FileSystemProvider & Required<Pick<ComposedView, 'pendingPaths' | 'statTree' | 'facts'>> => {
  const { payload } = proxy.hello;
  if (payload.state !== 'ready') {
    throw new Error(`The scenario bridge is ${payload.state}.`);
  }
  function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  function readFile(path: string, encoding: 'utf8'): Promise<string>;
  async function readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    return encoding === 'utf8' ? proxy.readFile(path, encoding) : proxy.readFile(path);
  }
  const admittedRow = (path: string, admits: (path: string, kind: 'file' | 'dir') => boolean): boolean => {
    const segments = path.split('/');
    for (let depth = 1; depth < segments.length; depth += 1) {
      if (!admits(segments.slice(0, depth).join('/'), 'dir')) {
        return false;
      }
    }
    return admits(path, 'file');
  };
  return {
    id: 'scenario-agent-host-relay',
    capabilities: payload.capabilities,
    readFile,
    writeFile: proxy.writeFile.bind(proxy),
    writeFileChecked: proxy.writeFileChecked.bind(proxy),
    appendFile: proxy.appendFile.bind(proxy),
    readdir: proxy.readdir.bind(proxy),
    stat: proxy.stat.bind(proxy),
    mkdir: proxy.mkdir.bind(proxy),
    unlink: proxy.unlink.bind(proxy),
    rmdir: async (path) => proxy.rmdir(path),
    rename: proxy.rename.bind(proxy),
    exists: proxy.exists.bind(proxy),
    lstat: proxy.lstat.bind(proxy),
    statTree: async (path, options) => {
      const rows = await proxy.statTree(path, options?.signal === undefined ? undefined : { signal: options.signal });
      const { admits } = options ?? {};
      return admits === undefined ? rows : rows.filter((row) => admittedRow(row.path, admits));
    },
    facts: async (paths, options) =>
      proxy.facts(paths, {
        ...(options?.lineCount === undefined ? {} : { lineCount: options.lineCount }),
        ...(options?.byteCap === undefined ? {} : { byteCap: options.byteCap }),
        ...(options?.digests === undefined ? {} : { digests: options.digests }),
        ...(options?.signal === undefined ? {} : { signal: options.signal }),
      }),
    pendingPaths: async (paths) => proxy.pendingPaths(paths),
    dispose: () => undefined,
  };
};

/** What one grep-and-glob measured, and what the authority served for it. */
export type OffAuthorityGrep = Readonly<{
  grepDuration: number;
  globDuration: number;
  /** Grep and glob calls the authority served (S19.off-authority: 0). */
  authoritySearchCalls: number;
  /** Every call the authority served, the reads included (information). */
  authorityCalls: number;
  /** Fixture-file reads the authority served (S19.compute-worker: 0); the concurrent save's file is left out. */
  authorityReads: number;
  binaryBytesRead: number;
}>;

/** One agent host's view of a project, over a port the authority serves. */
export type OffAuthorityAgent = Readonly<{
  /** Run the S12 grep and glob once, tallying what the authority served. */
  grepAndGlob: () => Promise<OffAuthorityGrep>;
  dispose: () => void;
}>;

/**
 * Open the agent host's filesystem over `port`.
 *
 * @param port - The page's end of a `'working-copy'` bridge connection the authority serves.
 * @param plan - The fixture, to tell a binary's bytes from text.
 * @returns The agent's grep-and-glob and its disposer.
 */
export const openOffAuthorityAgent = async (port: MessagePort, plan: FixturePlan): Promise<OffAuthorityAgent> => {
  const kinds = new Map(plan.entries.map((entry) => [entry.path, entry.kind]));
  const proxy = createTransferredFileSystemBridgeProxy(port);
  await proxy.ready;
  const tally = { calls: new Map<string, number>(), binaryBytesRead: 0, fixtureReads: 0 };
  const counted = new Proxy(proxy, {
    get: (target, property, receiver) => {
      const value: unknown = Reflect.get(target, property, receiver);
      if (typeof value !== 'function' || typeof property !== 'string' || property === 'dispose') {
        return value;
      }
      const call = value as (...values: unknown[]) => unknown;
      if (property === 'readFile') {
        return async (...parameters: unknown[]): Promise<unknown> => {
          tally.calls.set(property, (tally.calls.get(property) ?? 0) + 1);
          if (countsAsFixtureRead(kinds, String(parameters[0]))) {
            tally.fixtureReads += 1;
          }
          const read = (await Reflect.apply(call, target, parameters)) as Uint8Array<ArrayBuffer> | string;
          if (typeof read !== 'string' && kinds.get(String(parameters[0])) === 'binary') {
            tally.binaryBytesRead += read.byteLength;
          }
          return read;
        };
      }
      return (...parameters: unknown[]): unknown => {
        tally.calls.set(property, (tally.calls.get(property) ?? 0) + 1);
        return Reflect.apply(call, target, parameters);
      };
    },
  }) satisfies FileSystemBridgeProxy;
  const view = composeView({ filesystem: relayedProvider(counted) }, { consumer: 'agent', policy: tauPathPolicy });
  const fileSystem = createProviderRpcFileSystem({ provider: view, mutations: new ResourceQueue() });
  return {
    grepAndGlob: async () => {
      tally.calls.clear();
      tally.binaryBytesRead = 0;
      tally.fixtureReads = 0;
      const grepStart = performance.now();
      const grep = await handleGrep({ pattern: fixtureMarker, path: '' }, fileSystem);
      const grepDuration = performance.now() - grepStart;
      if (!grep.success) {
        throw new Error(`grep failed: ${JSON.stringify(grep)}`);
      }
      const globStart = performance.now();
      const glob = await handleGlobSearch({ pattern: '**/*.ts' }, fileSystem);
      const globDuration = performance.now() - globStart;
      if (!glob.success) {
        throw new Error(`glob failed: ${JSON.stringify(glob)}`);
      }
      const calls = [...tally.calls];
      return {
        grepDuration,
        globDuration,
        authoritySearchCalls: calls.reduce((sum, [name, count]) => sum + (searchCalls.has(name) ? count : 0), 0),
        authorityCalls: calls.reduce((sum, [, count]) => sum + count, 0),
        authorityReads: tally.fixtureReads,
        binaryBytesRead: tally.binaryBytesRead,
      };
    },
    dispose: () => {
      proxy.dispose();
    },
  };
};
