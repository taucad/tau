/**
 * The packaged app spawns each ACP adapter as `node <modulePath>` (see
 * `@taucad/host`'s `spawnAcpAdapter`), so the adapter and everything it imports
 * has to be a real file inside the app. `copyRuntimePackage` drops nested
 * `node_modules` because the engine packages beside it have none; the adapters
 * do, three levels deep and with two names at conflicting versions.
 *
 * This is the packaging proof that does not need a signed 300 MB bundle: stage
 * the closure exactly as `package-macos.mts` does, resolve the adapters from
 * the staged tree as `tau serve` does, then spawn the staged module and
 * complete one ACP `initialize`. A missing dependency anywhere in the closure
 * fails the handshake — nothing else in the suite would notice. Claude also
 * opens a session against a stub `claude`, because the staged tree has no
 * vendor binary of its own and a session is where the adapter first needs one.
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { acpAgentProfiles, resolveAcpAdapters, spawnAcpAdapter } from '@taucad/host';
import type { AcpAdapter } from '@taucad/host';
import { copyRuntimeClosure } from '@taucad/nx/runtime-closure';

const appRoot = join(import.meta.dirname, '..');
const require = createRequire(join(appRoot, 'package.json'));
const execFileAsync = promisify(execFile);
const adapters = acpAgentProfiles.flatMap((profile) => (profile.package === undefined ? [] : [profile.package]));

/**
 * The entry module the adapter's `bin` entry names, inside a staged tree.
 *
 * @param modulesRoot - Staged `node_modules` directory.
 * @param name - Adapter package name.
 * @returns Absolute path to the adapter's entry module.
 */
const stagedEntry = (modulesRoot: string, name: string): string => {
  const manifest = require(`${name}/package.json`) as { readonly bin: Readonly<Record<string, string>> };
  return resolve(modulesRoot, name, Object.values(manifest.bin)[0]!);
};

/** Resolve the pinned installed CLI outside the staged app, matching production's external CLI contract. */
const installedCodexDirectory = async (): Promise<string> => {
  const architectures: Record<string, string> = { x64: 'x86_64', arm64: 'aarch64' };
  const platforms: Record<string, string> = {
    linux: 'unknown-linux-musl',
    darwin: 'apple-darwin',
    win32: 'pc-windows-msvc',
  };
  const architecture = architectures[process.arch];
  const platform = platforms[process.platform];
  if (!architecture || !platform) {
    throw new Error(`Unsupported installed Codex target: ${process.platform}-${process.arch}`);
  }
  const adapterRequire = createRequire(await realpath(require.resolve('@agentclientprotocol/codex-acp/package.json')));
  const codexRequire = createRequire(adapterRequire.resolve('@openai/codex/bin/codex.js'));
  const platformPackage = `@openai/codex-${process.platform}-${process.arch}`;
  const platformRoot = dirname(codexRequire.resolve(`${platformPackage}/package.json`));
  const directory = resolve(platformRoot, 'vendor', `${architecture}-${platform}`, 'bin');
  const executable = resolve(directory, process.platform === 'win32' ? 'codex.exe' : 'codex');
  const executableStat = await stat(executable);
  if (!executableStat.isFile()) {
    throw new Error(`Missing pinned external Codex executable: ${executable}`);
  }
  return directory;
};

/**
 * Complete ACP initialization, and optionally one `session/new`, with the real
 * spawn contract and isolated, credential-free configuration.
 */
const handshake = async (options: {
  readonly adapter: AcpAdapter;
  readonly cwd: string;
  readonly path: string;
  readonly openSession?: boolean;
}): Promise<{ readonly initialized: unknown; readonly session: unknown; readonly stderr: string }> => {
  const { adapter, cwd, path } = options;
  const home = resolve(cwd, `${adapter.id}-home`);
  const codexHome = resolve(home, 'codex');
  const claudeConfig = resolve(home, 'claude');
  await Promise.all([mkdir(codexHome, { recursive: true }), mkdir(claudeConfig, { recursive: true })]);
  const running = spawnAcpAdapter({
    adapter,
    cwd,
    // No inherited credentials, provider overrides, config or diagnostic logging.
    /* eslint-disable @typescript-eslint/naming-convention -- Child process environment names are external protocol keys. */
    environment: {
      PATH: path,
      HOME: home,
      USERPROFILE: home,
      CODEX_HOME: codexHome,
      CLAUDE_CONFIG_DIR: claudeConfig,
      ...(process.platform === 'win32' ? { SystemRoot: process.env['SystemRoot'] } : {}),
    },
    /* eslint-enable @typescript-eslint/naming-convention -- External environment keys end here. */
  });
  const writer = running.stream.writable.getWriter();
  const reader = running.stream.readable.getReader();
  const status = { timedOut: false };
  const handshakeTimeout = setTimeout(() => {
    status.timedOut = true;
    running.signal('SIGKILL');
  }, 30_000);
  const request = async (id: number, method: string, params: Record<string, unknown>): Promise<unknown> => {
    await writer.write({ jsonrpc: '2.0', id, method, params });
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- Consume ordered ACP frames until this request completes.
      const { done, value: frame } = await reader.read();
      if (done) {
        throw new Error(
          `${adapter.id} ${status.timedOut ? 'timed out' : 'exited'} before answering ${method}: ${running.stderr()}`,
        );
      }
      if ('id' in frame && frame.id === id) {
        if ('error' in frame) {
          return { error: frame.error };
        }
        if ('result' in frame) {
          return frame.result;
        }
      }
    }
  };
  try {
    const initialized = await request(1, 'initialize', {
      protocolVersion: 1,
      clientCapabilities: { fs: {}, terminal: false },
    });
    const session = options.openSession === true ? await request(2, 'session/new', { cwd, mcpServers: [] }) : undefined;
    return { initialized, session, stderr: running.stderr() };
  } finally {
    clearTimeout(handshakeTimeout);
    writer.releaseLock();
    reader.releaseLock();
    running.signal('SIGKILL');
  }
};

describe('ACP adapter staging', () => {
  let stageRoot: string;
  let modulesRoot: string;
  let path: string;
  let claudeCalls: string;

  beforeAll(async () => {
    stageRoot = await realpath(await mkdtemp(join(tmpdir(), 'tau-acp-stage-')));
    modulesRoot = resolve(stageRoot, 'node_modules');
    /* A stub `claude` that records how it was started; no vendor login is read. */
    const stubDirectory = resolve(stageRoot, 'bin');
    claudeCalls = resolve(stageRoot, 'claude-calls.log');
    await mkdir(stubDirectory);
    await writeFile(
      resolve(stubDirectory, 'claude'),
      `#!/bin/sh\necho "$@" >> '${claudeCalls}'\necho '2.1.301 (stub)'\n`,
    );
    await chmod(resolve(stubDirectory, 'claude'), 0o755);
    path = [stubDirectory, await installedCodexDirectory(), dirname(process.execPath)].join(delimiter);
    for (const name of adapters) {
      // oxlint-disable-next-line no-await-in-loop -- The closure nests packages; staging is serial by construction.
      await copyRuntimeClosure({ name, source: dirname(require.resolve(`${name}/package.json`)), modulesRoot });
    }
  }, 120_000);

  /** The adapter as `tau serve` resolves it from a staged root, executable included. */
  const stagedAdapter = (name: string): AcpAdapter => {
    const { agents } = resolveAcpAdapters({
      resolveFrom: pathToFileURL(resolve(stageRoot, 'package.json')).href,
      pins: acpAgentProfiles.filter((profile) => profile.package === name),
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Child process environment names are external protocol keys.
      environment: { PATH: path },
    });
    const [adapter] = agents;
    if (adapter === undefined) {
      throw new Error(`${name} does not resolve from the staged tree`);
    }
    return adapter;
  };

  afterAll(async () => {
    await rm(stageRoot, { recursive: true, force: true });
  });

  it('gives each adapter its own copy of the names the other pins differently', () => {
    const distinctAdapters = ['@agentclientprotocol/codex-acp', '@agentclientprotocol/claude-agent-acp'];
    const dependency = '@agentclientprotocol/sdk';
    const installedVersions = distinctAdapters.map((adapter) => {
      const adapterRequire = createRequire(require.resolve(`${adapter}/package.json`));
      const manifestPath = adapterRequire.resolve
        .paths(dependency)
        ?.map((directory) => resolve(directory, dependency, 'package.json'))
        .find((candidate) => existsSync(candidate));
      if (!manifestPath) {
        throw new Error(`Cannot locate ${dependency} installed for ${adapter}`);
      }
      const manifest = adapterRequire(manifestPath) as { readonly version: string };
      return manifest.version;
    });
    const identity = (name: string, from: string): string => {
      const manifest = require(resolve(modulesRoot, from, 'node_modules', name, 'package.json')) as {
        readonly version: string;
      };
      return manifest.version;
    };

    // Prove the installed conflict is retained by staging, even when either adapter updates its pin.
    expect(new Set(installedVersions).size).toBe(2);
    expect(distinctAdapters.map((adapter) => identity(dependency, adapter))).toStrictEqual(installedVersions);
  });

  it('should resolve a shared glTF core from the staged root', async () => {
    for (const name of ['@gltf-transform/core', '@gltf-transform/functions']) {
      // oxlint-disable-next-line no-await-in-loop -- The second closure must see the first staged package.
      await copyRuntimeClosure({ name, source: await realpath(resolve(appRoot, 'node_modules', name)), modulesRoot });
    }

    const fromFunctions = createRequire(resolve(modulesRoot, '@gltf-transform/functions/package.json'));
    expect(fromFunctions.resolve('@gltf-transform/core')).toBe(
      resolve(modulesRoot, '@gltf-transform/core/dist/index.cjs'),
    );
  });

  it.each(adapters)(
    'spawns %s from the staged tree and completes an ACP handshake',
    async (name) => {
      const entry = stagedEntry(modulesRoot, name);
      const entryStat = await stat(entry);
      expect(entryStat.isFile()).toBe(true);

      const adapter = stagedAdapter(name);
      expect(adapter.modulePath).toBe(entry);
      const { initialized } = await handshake({ adapter, cwd: stageRoot, path });
      expect(initialized).toMatchObject({ protocolVersion: 1 });
    },
    60_000,
  );

  it.skipIf(process.platform === 'win32')(
    'opens a Claude session from the staged tree on the user’s own claude',
    async () => {
      /* Staging follows no optional dependency, so the Agent SDK's platform
       * binary is absent; without `CLAUDE_CODE_EXECUTABLE` this fails "native
       * binary not found" (blueprint C2). */
      const vendor = resolve(modulesRoot, '@agentclientprotocol/claude-agent-acp/node_modules/@anthropic-ai');
      expect(await readdir(vendor)).toEqual(['claude-agent-sdk']);
      const adapter = stagedAdapter('@agentclientprotocol/claude-agent-acp');
      expect(adapter.executablePath).toBe(resolve(stageRoot, 'bin', 'claude'));
      const { stderr } = await handshake({ adapter, cwd: stageRoot, path, openSession: true });

      await expect
        .poll(async () => readFile(claudeCalls, 'utf8').catch(() => ''), { timeout: 20_000, interval: 100 })
        .toContain('--output-format stream-json');
      expect(stderr).not.toContain('native binary not found');
    },
    60_000,
  );
});

describe.runIf(process.platform === 'darwin' && process.arch === 'arm64')('desktop native runtime staging', () => {
  let stageRoot: string;
  let modulesRoot: string;
  let sharpVersions: readonly string[];

  beforeAll(async () => {
    stageRoot = await realpath(await mkdtemp(join(tmpdir(), 'tau-native-stage-')));
    modulesRoot = resolve(stageRoot, 'node_modules');
    const functionsRoot = await realpath(resolve(appRoot, 'node_modules/@gltf-transform/functions'));
    const functionsRequire = createRequire(resolve(functionsRoot, 'package.json'));
    const sharpRoot = dirname(dirname(functionsRequire.resolve('sharp')));
    const pixelsRequire = createRequire(functionsRequire.resolve('ndarray-pixels'));
    const nestedSharpRoot = dirname(dirname(pixelsRequire.resolve('sharp')));
    sharpVersions = await Promise.all(
      [sharpRoot, nestedSharpRoot].map(async (source) => {
        const manifest = JSON.parse(await readFile(resolve(source, 'package.json'), 'utf8')) as {
          readonly version: string;
        };
        return manifest.version;
      }),
    );
    for (const name of ['@parcel/watcher', 'sharp', '@gltf-transform/core', '@gltf-transform/functions']) {
      // oxlint-disable-next-line no-await-in-loop -- Each closure must see the earlier staged packages.
      await copyRuntimeClosure({
        name,
        // oxlint-disable-next-line no-await-in-loop -- Installed package paths preserve their dependency contexts.
        source: name === 'sharp' ? sharpRoot : await realpath(resolve(appRoot, 'node_modules', name)),
        modulesRoot,
        optionalDependencies: [
          '@img/sharp-libvips-darwin-arm64',
          '@img/sharp-darwin-arm64',
          '@parcel/watcher-darwin-arm64',
        ],
      });
    }
  }, 120_000);

  afterAll(async () => {
    await rm(stageRoot, { recursive: true, force: true });
  });

  it('should admit and close the staged native filesystem watcher', async () => {
    const watcherRequire = createRequire(resolve(modulesRoot, '@parcel/watcher/package.json'));
    expect(watcherRequire.resolve('@parcel/watcher-darwin-arm64')).toBe(
      resolve(modulesRoot, '@parcel/watcher/node_modules/@parcel/watcher-darwin-arm64/watcher.node'),
    );
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { createRequire } from 'node:module';
const require = createRequire(${JSON.stringify(resolve(modulesRoot, '@parcel/watcher/package.json'))});
const watcher = require('@parcel/watcher');
const subscription = await watcher.subscribe(process.cwd(), () => undefined);
await subscription.unsubscribe();
process.stdout.write('admitted-and-closed');`,
      ],
      { cwd: stageRoot, timeout: 5000 },
    );
    expect(stdout).toBe('admitted-and-closed');
    await expect(
      stat(resolve(modulesRoot, '@parcel/watcher/node_modules/@parcel/watcher-darwin-x64')),
    ).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('should load both Sharp consumers with their own staged native versions', async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { createRequire } from 'node:module';
const require = createRequire(${JSON.stringify(resolve(stageRoot, 'package.json'))});
const functionsRequire = createRequire(require.resolve('@gltf-transform/functions'));
const pixelsRequire = createRequire(functionsRequire.resolve('ndarray-pixels'));
const rootSharp = require('sharp');
const nestedSharp = pixelsRequire('sharp');
process.stdout.write(JSON.stringify([rootSharp.versions.sharp, nestedSharp.versions.sharp, typeof rootSharp, typeof nestedSharp]));`,
      ],
      { cwd: stageRoot, timeout: 5000 },
    );
    expect(JSON.parse(stdout)).toEqual([...sharpVersions, 'function', 'function']);
  });

  it('should exclude optional payloads when the caller selects none', async () => {
    const defaultStage = await realpath(await mkdtemp(join(tmpdir(), 'tau-default-native-stage-')));
    try {
      const defaultModules = resolve(defaultStage, 'node_modules');
      await copyRuntimeClosure({
        name: '@parcel/watcher',
        source: await realpath(resolve(appRoot, 'node_modules/@parcel/watcher')),
        modulesRoot: defaultModules,
      });
      expect(await readFile(resolve(defaultModules, '@parcel/watcher/index.js'))).toEqual(
        await readFile(resolve(appRoot, 'node_modules/@parcel/watcher/index.js')),
      );
      await expect(
        stat(resolve(defaultModules, '@parcel/watcher/node_modules/@parcel/watcher-darwin-arm64')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(defaultStage, { recursive: true, force: true });
    }
  });
});
