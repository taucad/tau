/**
 * The packaged app spawns each ACP adapter as `node <modulePath>` (see
 * `@taucad/host`'s `spawnAcpAdapter`), so the adapter and everything it imports
 * has to be a real file inside the app. `copyRuntimePackage` drops nested
 * `node_modules` because the engine packages beside it have none; the adapters
 * do, three levels deep and with two names at conflicting versions.
 *
 * This is the packaging proof that does not need a signed 300 MB bundle: stage
 * the closure exactly as `package-macos.mts` does, then spawn the staged module
 * and complete one ACP `initialize`. A missing dependency anywhere in the
 * closure fails the handshake — nothing else in the suite would notice.
 */

import { execFile, spawn } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { acpAgentProfiles } from '@taucad/host';

// oxlint-disable-next-line no-restricted-imports -- Operational scripts are outside the app's # source alias.
import { copyRuntimeClosure } from '../scripts/runtime-closure.mjs';

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

/**
 * Complete one ACP `initialize` against a spawned adapter module.
 *
 * @param modulePath - Adapter entry module to run with this process's `node`.
 * @param cwd - Working directory for the adapter.
 * @returns The agent's `initialize` result.
 */
const initialize = async (modulePath: string, cwd: string): Promise<Record<string, unknown>> => {
  const child = spawn(process.execPath, [modulePath], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });
  try {
    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: 1, clientCapabilities: { fs: {}, terminal: false } },
      })}\n`,
    );
    let pending = '';
    child.stdout.setEncoding('utf8');
    /* Typed at the seam: Node's `Readable` iterates `any`, and the encoding set
     * one line above is what makes each chunk a string. */
    const stdout: AsyncIterable<string> = child.stdout;
    for await (const chunk of stdout) {
      pending += chunk;
      for (const line of pending.split('\n').slice(0, -1)) {
        const frame = JSON.parse(line) as { readonly id?: number; readonly result?: Record<string, unknown> };
        if (frame.id === 1 && frame.result) {
          return frame.result;
        }
      }
      pending = pending.slice(pending.lastIndexOf('\n') + 1);
    }
    throw new Error(`${modulePath} answered no initialize result. stderr:\n${stderr}`);
  } finally {
    child.kill();
  }
};

describe('ACP adapter staging', () => {
  let stageRoot: string;
  let modulesRoot: string;

  beforeAll(async () => {
    stageRoot = await realpath(await mkdtemp(join(tmpdir(), 'tau-acp-stage-')));
    modulesRoot = resolve(stageRoot, 'node_modules');
    for (const name of adapters) {
      // oxlint-disable-next-line no-await-in-loop -- The closure nests packages; staging is serial by construction.
      await copyRuntimeClosure({ name, source: dirname(require.resolve(`${name}/package.json`)), modulesRoot });
    }
  }, 120_000);

  afterAll(async () => {
    await rm(stageRoot, { recursive: true, force: true });
  });

  it('gives each adapter its own copy of the names the other pins differently', () => {
    const identity = (name: string, from: string): string => {
      const manifest = require(resolve(modulesRoot, from, 'node_modules', name, 'package.json')) as {
        readonly version: string;
      };
      return manifest.version;
    };

    expect([
      identity('@agentclientprotocol/sdk', '@agentclientprotocol/codex-acp'),
      identity('@agentclientprotocol/sdk', '@agentclientprotocol/claude-agent-acp'),
    ]).toStrictEqual(['1.4.0', '1.3.0']);
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

      const result = await initialize(entry, stageRoot);
      expect(result).toMatchObject({ protocolVersion: 1 });
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
