import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

/** A downloadable artefact pinned by URL and sha256. */
export type Pinned = { readonly url: string; readonly sha256: string };

/** `tools/formal/toolchain.lock`: every external tool, pinned per FM-R11. */
export type ToolchainLock = {
  readonly java: { readonly ci: string; readonly minimum: number };
  readonly tlc: Pinned & { readonly build: string };
  readonly community: Pinned;
  readonly apalache: Pinned & { readonly version: string; readonly jarSha256: string };
  readonly lean: {
    readonly version: string;
    readonly assets: Readonly<Record<LeanPlatform, Pinned>>;
  };
};

export type LeanPlatform = 'linux-x64' | 'darwin-arm64';

export type ToolName = 'java' | 'tlc' | 'apalache' | 'lean';

/** Where the runner looks for tools and writes scratch; tests point it at a temporary root. */
export type FormalContext = {
  readonly root: string;
  readonly env: NodeJS.ProcessEnv;
};

export type LocatedTools = {
  readonly java?: { readonly bin: string; readonly major: number };
  readonly tlc?: { readonly jar: string; readonly community: string };
  readonly apalache?: { readonly jar: string };
  readonly lean?: { readonly bin: string; readonly lib: string };
};

export const workspaceRoot = path.resolve(import.meta.dirname, '../../..');
export const lockPath = path.join(workspaceRoot, 'tools/formal/toolchain.lock');

export const defaultContext = (): FormalContext => ({ root: workspaceRoot, env: process.env });

export const readLock = (file = lockPath): ToolchainLock => JSON.parse(readFileSync(file, 'utf8')) as ToolchainLock;

export const cacheDirectory = (context: FormalContext): string => path.join(context.root, 'node_modules/.cache/formal');

export type ToolDirectories = { readonly tlc: string; readonly apalache: string; readonly lean: string };

export const toolDirectories = (context: FormalContext, lock: ToolchainLock): ToolDirectories => {
  const cache = cacheDirectory(context);
  return {
    tlc: path.join(cache, `tlc-${lock.tlc.build}`),
    apalache: path.join(cache, `apalache-${lock.apalache.version}`),
    lean: path.join(cache, `lean-${lock.lean.version}`),
  };
};

/** Parses the major version out of `java -version` output ("26.0.2.1", "21.0.4", "1.8.0_392"). */
export const javaMajor = (versionOutput: string): number | undefined => {
  const match = /version "(\d+)(?:\.(\d+))?/.exec(versionOutput);
  if (!match) {
    return undefined;
  }
  const first = Number(match[1]);
  return first === 1 ? Number(match[2]) : first;
};

const findJava = (context: FormalContext, lock: ToolchainLock): LocatedTools['java'] => {
  const home = context.env['JAVA_HOME'];
  const bin = home ? path.join(home, 'bin/java') : 'java';
  const result = spawnSync(bin, ['-version'], { encoding: 'utf8', env: context.env });
  if (result.error ?? result.status !== 0) {
    return undefined;
  }
  const major = javaMajor(`${result.stderr}${result.stdout}`);
  return major !== undefined && major >= lock.java.minimum ? { bin, major } : undefined;
};

/** Finds every tool the lock names without installing anything. */
export const locateTools = (context: FormalContext, lock: ToolchainLock = readLock()): LocatedTools => {
  const directories = toolDirectories(context, lock);
  const jar = path.join(directories.tlc, 'tla2tools.jar');
  const community = path.join(directories.tlc, 'CommunityModules-deps.jar');
  const apalacheJar = path.join(directories.apalache, 'lib/apalache.jar');
  const elanHome = context.env['ELAN_HOME'] ?? path.join(homedir(), '.elan');
  const leanHomes = [directories.lean, path.join(elanHome, `toolchains/leanprover--lean4---v${lock.lean.version}`)];
  const leanHome = leanHomes.find((home) => existsSync(path.join(home, 'bin/lean')));
  const java = findJava(context, lock);
  return {
    ...(java ? { java } : {}),
    ...(existsSync(jar) && existsSync(community) ? { tlc: { jar, community } } : {}),
    ...(existsSync(apalacheJar) ? { apalache: { jar: apalacheJar } } : {}),
    ...(leanHome ? { lean: { bin: path.join(leanHome, 'bin/lean'), lib: path.join(leanHome, 'lib/lean') } } : {}),
  };
};

/**
 * One line naming each tool's identity, or `absent`. Nx reads it as a runtime input so that
 * skipped and real runs never share a cache entry (FM-R12).
 */
export const toolchainId = (tools: LocatedTools, lock: ToolchainLock = readLock()): string =>
  [
    `java:${tools.java ? String(tools.java.major) : 'absent'}`,
    `tlc:${tools.tlc ? `${lock.tlc.build}+${lock.community.sha256.slice(0, 12)}` : 'absent'}`,
    `apalache:${tools.apalache ? lock.apalache.version : 'absent'}`,
    `lean:${tools.lean ? lock.lean.version : 'absent'}`,
  ].join(' ');

/**
 * FM-R12: an absent tool prints `SKIPPED` and exits 0 locally, 1 under CI.
 * Returns the exit code to use when a tool is missing, or `undefined` when every tool is present.
 */
export const missingTools = (
  context: FormalContext,
  {
    tools,
    needed,
    target,
  }: { readonly tools: LocatedTools; readonly needed: readonly ToolName[]; readonly target: string },
  log: (line: string) => void,
): number | undefined => {
  const missing = needed.filter((tool) => tools[tool] === undefined);
  if (missing.length === 0) {
    return undefined;
  }
  log(`SKIPPED ${target}: ${missing.join(', ')} not found; run pnpm nx run formal:setup`);
  return context.env['CI'] ? 1 : 0;
};
