import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import type { FormalContext, LeanPlatform, Pinned, ToolchainLock } from '#toolchain.js';
import { cacheDirectory, readLock, toolDirectories } from '#toolchain.js';

export type SetupTool = 'tlc' | 'apalache' | 'lean';

export type SetupOptions = {
  readonly tools: readonly SetupTool[];
  /** A local directory holding already-downloaded artefacts (jars or archives); searched before any download. */
  readonly from?: string;
  readonly lock?: ToolchainLock;
  readonly fetch?: typeof fetch;
  readonly log?: (line: string) => void;
};

export const sha256 = (file: string): string => createHash('sha256').update(readFileSync(file)).digest('hex');

/** Refuses bytes whose digest differs from the lock (FM-R11). */
export const verify = (file: string, expected: string, label: string): void => {
  const actual = sha256(file);
  if (actual !== expected) {
    throw new Error(`${label}: sha256 ${actual} does not match the lock (${expected}); refusing ${file}`);
  }
};

const findFile = (directory: string, name: string, depth = 3): string | undefined => {
  if (!existsSync(directory) || depth < 0) {
    return undefined;
  }
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    const found = entry.isFile()
      ? entry.name === name
        ? full
        : undefined
      : entry.isDirectory()
        ? findFile(full, name, depth - 1)
        : undefined;
    if (found) {
      return found;
    }
  }
  return undefined;
};

type Install = {
  readonly options: SetupOptions;
  readonly lock: ToolchainLock;
  readonly scratch: string;
  readonly directories: ReturnType<typeof toolDirectories>;
  readonly log: (line: string) => void;
};

type Obtain = {
  /** File names to look for under `--from`, in order. */
  readonly names: readonly string[];
  readonly pin: Pinned;
  readonly destination: string;
};

/** Places a verified copy at `destination`, from `--from` when it holds one of `names`, otherwise by download. */
const obtain = async (install: Install, { names, pin, destination }: Obtain): Promise<'local' | 'download'> => {
  const { from } = install.options;
  const local = from ? names.map((name) => findFile(from, name)).find(Boolean) : undefined;
  const staged = path.join(install.scratch, `${path.basename(destination)}.part`);
  if (local) {
    copyFileSync(local, staged);
  } else {
    const response = await (install.options.fetch ?? fetch)(pin.url);
    if (!response.ok) {
      throw new Error(`download ${pin.url}: HTTP ${response.status}`);
    }
    writeFileSync(staged, Buffer.from(await response.arrayBuffer()));
  }
  verify(staged, pin.sha256, names[0] ?? destination);
  mkdirSync(path.dirname(destination), { recursive: true });
  renameSync(staged, destination);
  return local ? 'local' : 'download';
};

const run = (command: string, arguments_: readonly string[], cwd: string): void => {
  const result = spawnSync(command, arguments_, { cwd, stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`${command} ${arguments_.join(' ')} exited ${String(result.status)}`);
  }
};

export const leanPlatform = (): LeanPlatform => (process.platform === 'darwin' ? 'darwin-arm64' : 'linux-x64');

const removeExcept = (directory: string, keep: (entry: string) => boolean): void => {
  for (const entry of readdirSync(directory)) {
    if (!keep(entry)) {
      rmSync(path.join(directory, entry), { recursive: true, force: true });
    }
  }
};

/** Keeps what `lean -o` and `lean --run` need over `Init` and `Std` (L5 F9); drops the rest of the ~1 GB release. */
export const trimLean = (home: string): void => {
  removeExcept(home, (entry) => ['bin', 'lib', 'LICENSE'].includes(entry));
  removeExcept(path.join(home, 'bin'), (entry) => entry === 'lean');
  removeExcept(
    path.join(home, 'lib'),
    (entry) => entry === 'lean' || entry.startsWith('libleanshared') || entry.startsWith('libc++'),
  );
  removeExcept(
    path.join(home, 'lib/lean'),
    (entry) =>
      /^(?:Init|Std)(?:\.|$)/.test(entry) || entry.startsWith('libleanshared') || entry.startsWith('libInit_shared'),
  );
};

const installTlc = async (install: Install): Promise<void> => {
  const { lock, directories } = install;
  const jar = path.join(directories.tlc, 'tla2tools.jar');
  const community = path.join(directories.tlc, 'CommunityModules-deps.jar');
  if (
    existsSync(jar) &&
    existsSync(community) &&
    sha256(jar) === lock.tlc.sha256 &&
    sha256(community) === lock.community.sha256
  ) {
    install.log(`tlc ${lock.tlc.build}: present`);
    return;
  }
  const [how] = await Promise.all([
    obtain(install, { names: ['tla2tools.jar'], pin: lock.tlc, destination: jar }),
    obtain(install, {
      names: ['CommunityModules-deps.jar', path.basename(lock.community.url)],
      pin: lock.community,
      destination: community,
    }),
  ]);
  install.log(`tlc ${lock.tlc.build}: installed (${how}) at ${directories.tlc}`);
};

const installApalache = async (install: Install): Promise<void> => {
  const { lock, directories } = install;
  const jar = path.join(directories.apalache, 'lib/apalache.jar');
  if (existsSync(jar) && sha256(jar) === lock.apalache.jarSha256) {
    install.log(`apalache ${lock.apalache.version}: present`);
    return;
  }
  const { from } = install.options;
  if (from && findFile(from, 'apalache.jar')) {
    await obtain(install, {
      names: ['apalache.jar'],
      pin: { url: '', sha256: lock.apalache.jarSha256 },
      destination: jar,
    });
  } else {
    const archive = path.join(install.scratch, 'apalache.tgz');
    await obtain(install, { names: [path.basename(lock.apalache.url)], pin: lock.apalache, destination: archive });
    run('tar', ['-xzf', archive], install.scratch);
    const extracted = findFile(install.scratch, 'apalache.jar');
    if (!extracted) {
      throw new Error('apalache: archive holds no apalache.jar');
    }
    verify(extracted, lock.apalache.jarSha256, 'apalache.jar');
    mkdirSync(path.dirname(jar), { recursive: true });
    renameSync(extracted, jar);
  }
  install.log(`apalache ${lock.apalache.version}: installed at ${directories.apalache}`);
};

const installLean = async (install: Install): Promise<void> => {
  const { lock, directories } = install;
  if (existsSync(path.join(directories.lean, 'bin/lean'))) {
    install.log(`lean ${lock.lean.version}: present`);
    return;
  }
  const asset = lock.lean.assets[leanPlatform()];
  const archive = path.join(install.scratch, 'lean.tar.zst');
  await obtain(install, { names: [path.basename(asset.url)], pin: asset, destination: archive });
  run('tar', ['--zstd', '-xf', archive], install.scratch);
  const top = readdirSync(install.scratch).find((entry) => entry.startsWith('lean-'));
  if (!top) {
    throw new Error('lean: archive holds no lean-* directory');
  }
  trimLean(path.join(install.scratch, top));
  rmSync(directories.lean, { recursive: true, force: true });
  renameSync(path.join(install.scratch, top), directories.lean);
  install.log(`lean ${lock.lean.version}: installed (trimmed) at ${directories.lean}`);
};

const installers = { tlc: installTlc, apalache: installApalache, lean: installLean } as const;

/** `formal setup`: provision each requested tool into `node_modules/.cache/formal`, verifying before extracting. */
export const setup = async (context: FormalContext, options: SetupOptions): Promise<void> => {
  const lock = options.lock ?? readLock();
  const log = options.log ?? ((line: string) => process.stdout.write(`${line}\n`));
  const directories = toolDirectories(context, lock);
  mkdirSync(cacheDirectory(context), { recursive: true });
  const scratches: string[] = [];
  try {
    await Promise.all(
      options.tools.map(async (tool) => {
        const scratch = mkdtempSync(path.join(cacheDirectory(context), `setup-${tool}-`));
        scratches.push(scratch);
        await installers[tool]({ options, lock, scratch, directories, log });
      }),
    );
  } finally {
    for (const scratch of scratches) {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
};
