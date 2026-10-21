/* eslint-disable @typescript-eslint/naming-convention -- environment variables and wire fields keep their names. */
/**
 * Native kernels over `tau serve` (charter W11, D37; the daemon row of W22's consumer conformance suite).
 *
 * The built `tau serve` runs as a real process, so its runtime children are the built `host-runtime-child.mjs` under
 * Node's permission model, which refuses them `child_process`: every native worker they need is started by the
 * daemon on their behalf (North Star S2). An agent over the daemon speaks through the agent channel to a scripted
 * model gateway that calls Tau's tools in a fixed order; each tool's answer reaches the gateway in the next request,
 * which is where these cases read it. Two stubs stand in for the network: a relay that accepts the control socket and
 * the gateway.
 *
 * - PicoGK, on any host: a synthetic closure (the checked-in kernel row, archives shaped like Microsoft's runtime and
 *   the Tau layer) served by a loopback mirror under no-fallback for a forced darwin-arm64 target, as W5's tier 4a.
 *   `.cs` answers `KERNEL_NOT_PREPARED`, `prepare_kernel` prepares it, and the next `.cs` call composes PicoGK and
 *   launches its worker through the daemon; the synthetic runtime cannot evaluate, so the call reports the worker's
 *   failure, never the permission model's refusal. Real `.cs` geometry is tier 4b (macOS, the published layer).
 * - Build123d, where the seed `pnpm nx run build123d:seed` fills is present (`cli:test` depends on it): `.py`
 *   answers `KERNEL_NOT_PREPARED`, `prepare_kernel` prepares it from the seed under the locked profile, and the next
 *   `.py` call evaluates with geometry from a worker the daemon started in the sandbox.
 */

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { gzipSync } from 'node:zlib';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';

import { createAgentChannelClient } from '@taucad/agent-host/channel-client';
import { detectHostIndicators, parsePluginDeployment, selectVariant } from '@taucad/runtime/preparation/node';
import { getBoundingBoxFromInspect, getInspectReport } from '@taucad/runtime-testing';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolvePath(here, '../../../..');
/* Built, so the runtime children are the shipped child under `--permission`. `cli:test` depends on `build`. */
const builtBin = resolvePath(repoRoot, 'packages/cli/dist/bin/tau.mjs');
const agentToken = 'serve-native-agent-token-at-least-32-characters';
/** Milliseconds one agent run may take: kernel loads, a preparation and a cold native worker. */
const runLimit = 420_000;
/** Milliseconds the darwin-arm64 run (tier 4b) may take: two real preparations and two cold native workers. */
const realRunLimit = 900_000;

const disposers: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) {
    // oxlint-disable-next-line no-await-in-loop -- teardown is ordered: the daemon first, then its stubs.
    await dispose();
  }
});

const listen = async (server: HttpServer): Promise<number> => {
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new TypeError('Expected a TCP address.');
  }
  disposers.push(
    async () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  );
  return address.port;
};

/** A relay that accepts the daemon's control socket and offers it nothing. */
const startStubRelay = async (): Promise<URL> => {
  const server = createServer((_request, response) => {
    response.writeHead(404).end();
  });
  const sockets = new WebSocketServer({ noServer: true });
  server.on('upgrade', (request, socket, head) => {
    sockets.handleUpgrade(request, socket, head, () => undefined);
  });
  disposers.push(() => {
    sockets.close();
  });
  return new URL(`http://127.0.0.1:${String(await listen(server))}`);
};

/** One tool call the scripted model makes. */
type ToolCall = { readonly name: string; readonly input: Readonly<Record<string, string>> };

const sse = (delta: unknown, finish?: string): string =>
  `data: ${JSON.stringify({ id: 'chatcmpl-serve-native', choices: [{ index: 0, delta, finish_reason: finish ?? null }] })}\n\n`;

/**
 * A model gateway that answers its n-th request with the n-th scripted tool call, then ends the turn, and keeps
 * every request body: the answer to call n arrives in request n + 1 as the `tool` message `call-n`.
 */
const startScriptedGateway = async (
  script: readonly ToolCall[],
): Promise<{ readonly url: URL; readonly answers: () => Map<string, string> }> => {
  const bodies: unknown[] = [];
  const server = createServer((request, response) => {
    // async-iife: bootstrap -- node's request listener is synchronous.
    void (async () => {
      const chunks: Array<Uint8Array<ArrayBuffer>> = [];
      for await (const chunk of request) {
        chunks.push(chunk as Uint8Array<ArrayBuffer>);
      }
      if (request.method !== 'POST') {
        response.writeHead(404).end();
        return;
      }
      bodies.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      const step = script[bodies.length - 1];
      /* The transport binds every stream to the gateway's operation identity (D16). */
      response.writeHead(200, { 'content-type': 'text/event-stream', 'x-tau-operation-id': 'stub-serve-native' });
      if (step === undefined) {
        response.write(sse({ content: 'Done.' }));
        response.write(sse({}, 'stop'));
      } else {
        const id = `call-${String(bodies.length)}`;
        const call = { index: 0, id, function: { name: step.name, arguments: JSON.stringify(step.input) } };
        response.write(sse({ tool_calls: [call] }, 'tool_calls'));
      }
      response.write('data: [DONE]\n\n');
      response.end();
    })();
  });
  const port = await listen(server);
  return {
    url: new URL(`http://127.0.0.1:${String(port)}`),
    answers: () => {
      const answers = new Map<string, string>();
      for (const body of bodies) {
        const messages = (body as { messages?: unknown[] }).messages ?? [];
        for (const message of messages as Array<{ role?: string; tool_call_id?: string; content?: unknown }>) {
          if (message.role === 'tool' && typeof message.tool_call_id === 'string') {
            answers.set(
              message.tool_call_id,
              typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
            );
          }
        }
      }
      return answers;
    },
  };
};

/** Start the built `tau serve` and wait for the agent channel's origin. */
const startServe = async (options: {
  readonly workspace: string;
  readonly relayUrl: URL;
  readonly gatewayUrl: URL;
  readonly environment: Readonly<Record<string, string>>;
  readonly imports?: readonly string[];
}): Promise<URL> => {
  /* The daemon's own temp directory, which each runtime child may write, apart from the config directory where it
   * keeps the directories its native workers are granted. */
  const daemonTemporaryDirectory = join(dirname(options.workspace), 'tmp');
  await mkdir(daemonTemporaryDirectory, { recursive: true });
  const child: ChildProcess = spawn(
    process.execPath,
    [
      '--import',
      '@oxc-node/core/register',
      ...(options.imports ?? []).flatMap((specifier) => ['--import', specifier]),
      builtBin,
      'serve',
      '--trust-projects',
      '--agentPort=0',
      '--no-external-agents',
      '--no-test-model',
      '--computeMode=off',
      `--workspace=${options.workspace}`,
      `--relay=${options.relayUrl.href}`,
      `--gateway=${options.gatewayUrl.href}`,
      '--model=fixture-model',
      '--modelProvider=vertexai',
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...options.environment,
        TMPDIR: daemonTemporaryDirectory,
        TAU_HOST_AGENT_TOKEN: agentToken,
        NX_PREFER_NODE_STRIP_TYPES: 'true',
        /* Vitest's `NODE_ENV=test` drops consola to `warn`, which hides the line naming the port. */
        CONSOLA_LEVEL: '4',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const output: string[] = [];
  const origin = Promise.withResolvers<URL>();
  const scan = (chunk: Uint8Array<ArrayBuffer>): void => {
    const text = Buffer.from(chunk).toString('utf8');
    output.push(text);
    const match = /agent channel ready at http:\/\/127\.0\.0\.1:(\d+)/u.exec(text);
    if (match) {
      origin.resolve(new URL(`http://127.0.0.1:${match[1]!}`));
    }
  };
  child.stdout?.on('data', scan);
  child.stderr?.on('data', scan);
  /* The output is printed, never thrown: vitest reads the files a stack-shaped message names. */
  const report = (reason: string): Error => {
    process.stderr.write(`\n--- tau serve output ---\n${output.join('')}\n--- end ---\n`);
    return new Error(reason);
  };
  child.once('exit', (code) => {
    origin.reject(report(`tau serve exited early with code ${String(code)}`));
  });
  disposers.push(async () => {
    const directory = process.env['TAU_TEST_FRAME_LOG_DIR'];
    if (directory !== undefined && directory !== '') {
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, `serve-${String(child.pid)}.log`), output.join(''));
    }
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise<void>((resolve) => {
        child.once('exit', () => {
          resolve();
        });
      });
      child.kill('SIGTERM');
      await Promise.race([exited, sleep(10_000)]);
      child.kill('SIGKILL');
    }
  });
  const deadline = new Promise<never>((_resolve, reject) => {
    setTimeout(() => {
      reject(report('tau serve never announced its agent channel'));
    }, 120_000).unref();
  });
  return Promise.race([origin.promise, deadline]);
};

/** Run one agent turn over the daemon and wait for it to settle. */
const runAgent = async (origin: URL, limit = runLimit): Promise<string | undefined> => {
  const client = createAgentChannelClient({
    connect: () =>
      new WebSocket(new URL('/agent', origin).href.replace('http:', 'ws:'), {
        headers: { authorization: `Bearer ${agentToken}` },
      }),
    livenessTimeout: 30_000,
  });
  const started = await client.execute({
    type: 'start',
    commandId: 'start-1',
    payload: {
      chatId: 'chat-1',
      runId: 'run-1',
      trigger: 'submit',
      message: { id: 'user-1', role: 'user', content: 'Evaluate the native models.' },
    },
  });
  expect(started).toMatchObject({ status: 'applied', effect: 'durable' });
  const settled = new Set(['completed', 'failed', 'cancelled']);
  const deadline = performance.now() + limit - 30_000;
  for (let attempt = 0; ; attempt++) {
    // oxlint-disable-next-line no-await-in-loop -- polling the run projection is sequential.
    const answer = await client.execute({
      type: 'attach',
      commandId: `attach-${String(attempt)}`,
      payload: { chatId: 'chat-1' },
    });
    const snapshot = answer.status === 'applied' && 'details' in answer ? answer.details['snapshot'] : undefined;
    const state = (snapshot as { readonly state?: string } | undefined)?.state;
    if ((state !== undefined && settled.has(state)) || performance.now() > deadline) {
      client.close();
      return state;
    }
    // oxlint-disable-next-line no-await-in-loop -- ditto.
    await sleep(250);
  }
};

/** A stored credential, so the daemon serves without pairing. */
const configDirectoryWithCredential = async (root: string): Promise<string> => {
  const configDirectory = join(root, 'config');
  await mkdir(configDirectory, { recursive: true });
  await writeFile(
    join(configDirectory, 'host.json'),
    `${JSON.stringify({ v: 1, deviceId: 'device-1', credential: 'serve-native-device-credential-32-chars' })}\n`,
  );
  return configDirectory;
};

const projectFiles = {
  'main.py': [
    'from dataclasses import dataclass',
    '',
    'from build123d import Box',
    '',
    '',
    '@dataclass(frozen=True)',
    'class Params:',
    '    width: float = 10.0',
    '',
    '',
    'def main(params: Params):',
    '    return Box(params.width, 20, 30)',
    '',
  ].join('\n'),
  'main.cs': 'using PicoGK;\n\npublic static class Model {}\n',
  'tau.json': `${JSON.stringify({ $schema: 'https://tau.new/schemas/tau-v1.json', name: 'serve native', description: '', tags: [], assets: { main: { entryPath: 'main.scad' } } })}\n`,
};

const workspaceIn = async (root: string): Promise<string> => {
  const workspace = join(root, 'workspace');
  await mkdir(workspace, { recursive: true });
  for (const [name, text] of Object.entries(projectFiles)) {
    // oxlint-disable-next-line no-await-in-loop -- three small files.
    await writeFile(join(workspace, name), text);
  }
  return workspace;
};

/* A gzipped ustar archive of regular files, the shape every PicoGK payload has. */
const tarGz = (
  members: ReadonlyArray<{ name: string; bytes: Uint8Array<ArrayBuffer>; executable?: boolean }>,
): Uint8Array<ArrayBuffer> => {
  const blocks: Array<Uint8Array<ArrayBuffer>> = [];
  for (const { name, bytes, executable } of members) {
    const header = Buffer.alloc(512);
    header.write(name, 0);
    header.write(`${(executable === true ? 0o755 : 0o644).toString(8).padStart(7, '0')}\0`, 100);
    header.write('0000000\0', 108);
    header.write('0000000\0', 116);
    header.write(`${bytes.length.toString(8).padStart(11, '0')}\0`, 124);
    header.write('00000000000\0', 136);
    header.write('0', 156);
    header.write('ustar\u000000', 257);
    header.fill(0x20, 148, 156);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148);
    blocks.push(header, bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512));
  }
  return new Uint8Array(gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)])));
};

const text = (value: string): Uint8Array<ArrayBuffer> => new Uint8Array(Buffer.from(value, 'utf8'));
const runtimeVersion = '10.0.11';
const synthetic = {
  dotnet: tarGz([
    { name: 'dotnet', bytes: text('muxer'), executable: true },
    { name: `host/fxr/${runtimeVersion}/libhostfxr.dylib`, bytes: text('hostfxr') },
    { name: `shared/Microsoft.NETCore.App/${runtimeVersion}/libhostpolicy.dylib`, bytes: text('hostpolicy') },
    { name: `shared/Microsoft.NETCore.App/${runtimeVersion}/libcoreclr.dylib`, bytes: text('coreclr') },
    { name: `shared/Microsoft.NETCore.App/${runtimeVersion}/libclrjit.dylib`, bytes: text('clrjit') },
    { name: `shared/Microsoft.NETCore.App/${runtimeVersion}/System.Private.CoreLib.dll`, bytes: text('lib') },
  ]),
  worker: tarGz([
    { name: 'Tau.PicoGK.Worker.dll', bytes: text('worker') },
    { name: 'Tau.PicoGK.Worker.runtimeconfig.json', bytes: text('{}') },
    { name: 'Tau.PicoGK.Worker.deps.json', bytes: text('{}') },
    { name: 'PicoGK.dll', bytes: text('picogk') },
    { name: 'picogk.26.2.dylib', bytes: text('engine') },
  ]),
  notices: tarGz([{ name: 'NOTICES.txt', bytes: text('notices') }]),
} as const;
const destinations = { dotnet: 'dotnet', worker: 'tau-worker', notices: 'tau-notices' } as const;
const hexOf = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');

/** The PicoGK kernel row with one darwin-arm64 variant pinning the synthetic archives. */
const syntheticManifest = {
  schemaVersion: 1,
  kernels: { picogk: { requires: ['runtime'], extensions: ['cs'] } },
  dependencies: {
    runtime: [
      {
        target: { runtime: 'native', os: 'darwin', arch: 'arm64', minimumOsVersion: '14.0' },
        payloads: Object.entries(synthetic).map(([name, bytes]) => ({
          name,
          integrity: `sha256-${createHash('sha256').update(bytes).digest('base64')}`,
          byteLength: bytes.byteLength,
          format: 'tar.gz',
          /* Never fetched: the mirror serves every payload, with no fallback. */
          origin: { kind: 'url', urls: [`https://payloads.invalid/${name}.tar.gz`] },
          destination: destinations[name as keyof typeof destinations],
        })),
      },
    ],
  },
};

/** A digest-addressed loopback mirror of the synthetic archives. */
const startMirror = async (): Promise<string> => {
  const blobs = new Map(Object.values(synthetic).map((bytes) => [hexOf(bytes), bytes]));
  const server = createServer((request, response) => {
    const hex = /\/blobs\/sha256\/(?<hex>[\da-f]{64})$/u.exec(request.url ?? '')?.groups?.['hex'] ?? '';
    const bytes = blobs.get(hex);
    if (bytes === undefined) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': String(bytes.length) });
    response.end(bytes);
  });
  return `http://127.0.0.1:${String(await listen(server))}/`;
};

/** The Build123d seed for this host, as `build123d-export.integration.test.ts` finds it. */
const seedDirectory = resolvePath(repoRoot, 'out/cache/build123d-seed');
const seedPresent = (() => {
  const deployment = parsePluginDeployment(
    JSON.parse(readFileSync(createRequire(import.meta.url).resolve('@taucad/build123d/tau-plugin.json'), 'utf8')),
    '@taucad/build123d tau-plugin.json',
  );
  const indicators = detectHostIndicators();
  const selection =
    indicators === undefined ? undefined : selectVariant(deployment.dependencies['engine'] ?? [], indicators);
  return (
    selection?.status === 'selected' &&
    selection.variant.payloads.every(
      (payload) =>
        payload.origin.kind !== 'url' ||
        existsSync(
          join(
            seedDirectory,
            'blobs',
            'sha256',
            Buffer.from(payload.integrity.slice('sha256-'.length), 'base64').toString('hex'),
          ),
        ),
    )
  );
})();

/** The kernel issue codes an `evaluate_model` answer carries. */
const issueCodes = (answer: string | undefined): string[] =>
  [...(answer ?? '').matchAll(/"code":"(?<code>[A-Z_]+)"/gu)].map((match) => match.groups!['code']!);

/** The child's own spawn refusal under the permission model, which a brokered launch never meets. */
const permissionRefusal = /ERR_ACCESS_DENIED|Access to this API has been restricted/u;

describe('tau serve native kernels (W11, W22 daemon row)', () => {
  let scratch = '';

  beforeAll(async () => {
    scratch = await mkdtemp(join(tmpdir(), 'tau-serve-native-'));
  });

  afterAll(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it(
    'refuses an unprepared .py and .cs with KERNEL_NOT_PREPARED, prepares PicoGK over the daemon, then launches its worker through the daemon',
    async () => {
      const root = await mkdtemp(join(scratch, 'picogk-'));
      const workspace = await workspaceIn(root);
      const manifest = join(root, 'picogk-tau-plugin.json');
      await writeFile(manifest, JSON.stringify(syntheticManifest));
      const rosterHook = join(root, 'native-roster.mjs');
      await writeFile(
        rosterHook,
        `import { registerHooks } from 'node:module';
registerHooks({
  resolve: (specifier, context, next) =>
    specifier === '@taucad/picogk/tau-plugin.json'
      ? { url: ${JSON.stringify(pathToFileURL(manifest).href)}, format: "json", shortCircuit: true }
      : next(specifier, context),
});
`,
      );
      const script: ToolCall[] = [
        { name: 'evaluate_model', input: { targetFile: 'main.py' } },
        { name: 'evaluate_model', input: { targetFile: 'main.cs' } },
        { name: 'prepare_kernel', input: { kernel: 'picogk' } },
        { name: 'evaluate_model', input: { targetFile: 'main.cs' } },
      ];
      const gateway = await startScriptedGateway(script);
      const origin = await startServe({
        workspace,
        relayUrl: await startStubRelay(),
        gatewayUrl: gateway.url,
        imports: [pathToFileURL(rosterHook).href],
        environment: {
          TAU_CONFIG_DIR: await configDirectoryWithCredential(root),
          TAU_PAYLOAD_MIRROR: await startMirror(),
          TAU_PAYLOAD_MIRROR_NO_FALLBACK: '1',
          TAU_PAYLOAD_TARGET: 'darwin-arm64',
          TAU_ACQUISITION: '',
          TAU_PAYLOAD_DIR: '',
          /* A loopback mirror must bypass any proxy the runner sets (S7). */
          NO_PROXY: '127.0.0.1,localhost',
          no_proxy: '127.0.0.1,localhost',
        },
      });

      const state = await runAgent(origin);
      const answers = gateway.answers();
      process.stderr.write(`serve native (PicoGK) answers: ${JSON.stringify(Object.fromEntries(answers))}\n`);

      expect(state).toBe('completed');
      expect(issueCodes(answers.get('call-1'))[0]).toBe('KERNEL_NOT_PREPARED');
      expect(answers.get('call-1')).toContain('"kernel":"build123d"');
      expect(issueCodes(answers.get('call-2'))[0]).toBe('KERNEL_NOT_PREPARED');
      expect(answers.get('call-2')).toContain('"prepare":{"tool":"prepare_kernel","input":{"kernel":"picogk"}}');
      expect(answers.get('call-3')).toMatch(/"status":"ready"/u);
      expect(answers.get('call-3')).toContain('"kernel":"picogk"');
      /* Composed and launched: the synthetic runtime cannot run, so the worker fails, never the permission model. */
      expect(issueCodes(answers.get('call-4'))).not.toContain('KERNEL_NOT_PREPARED');
      expect(answers.get('call-4')).not.toMatch(permissionRefusal);
      expect(answers.get('call-4')).toMatch(/PicoGK C# exited \(\d+\)|sandbox could not start/u);
    },
    runLimit,
  );

  it.runIf(seedPresent)(
    'refuses an unprepared .py, prepares Build123d from the seed over the daemon, then evaluates it in a worker the daemon started',
    async () => {
      const root = await mkdtemp(join(scratch, 'build123d-'));
      const workspace = await workspaceIn(root);
      const script: ToolCall[] = [
        { name: 'evaluate_model', input: { targetFile: 'main.py' } },
        { name: 'prepare_kernel', input: { kernel: 'build123d' } },
        { name: 'evaluate_model', input: { targetFile: 'main.py' } },
      ];
      const gateway = await startScriptedGateway(script);
      const origin = await startServe({
        workspace,
        relayUrl: await startStubRelay(),
        gatewayUrl: gateway.url,
        environment: {
          TAU_CONFIG_DIR: await configDirectoryWithCredential(root),
          /* The store and the seed only: nothing is fetched. */
          TAU_ACQUISITION: 'locked',
          TAU_PAYLOAD_DIR: seedDirectory,
          TAU_PAYLOAD_MIRROR: '',
          TAU_PAYLOAD_TARGET: '',
        },
      });

      const state = await runAgent(origin);
      const answers = gateway.answers();
      process.stderr.write(`serve native (Build123d) answers: ${JSON.stringify(Object.fromEntries(answers))}\n`);

      expect(state).toBe('completed');
      expect(issueCodes(answers.get('call-1'))[0]).toBe('KERNEL_NOT_PREPARED');
      expect(answers.get('call-2')).toMatch(/"status":"ready"/u);
      // The kernel evaluated the model through a brokered worker: a ready render with no kernel issue at all.
      expect(answers.get('call-3')).toMatch(/"status":"ready"/u);
      expect(issueCodes(answers.get('call-3'))).toEqual([]);
      expect(answers.get('call-3')).not.toMatch(permissionRefusal);
    },
    runLimit,
  );
});

/*
 * Tier 4b (W11, D30): the same daemon on a darwin-arm64 host with real bytes and real models. The store starts empty;
 * one `prepare_kernel` per kernel over the daemon prepares Build123d (from the seed `build123d:seed` fills, the
 * digest-keyed cache the `native-darwin` job restores) and PicoGK (Microsoft's .NET runtime and the published Tau
 * layer, downloaded from the manifest's origins). Then a real `.py` and a real `.cs` model evaluate and export geometry
 * from workers the daemon started in the sandbox. Each model fails its evaluation if its worker can open a socket, and
 * a loopback canary must see no connection: the worker keeps zero egress (I7). It runs only where the `native-darwin`
 * CI job opts in with `TAU_NATIVE_DARWIN=1`.
 */
const nativeDarwin =
  process.env['TAU_NATIVE_DARWIN'] === '1' && process.platform === 'darwin' && process.arch === 'arm64';

/** A loopback listener the models try to reach; it counts every connection it accepts. */
const startCanary = async (): Promise<{ readonly port: number; readonly connections: () => number }> => {
  let connections = 0;
  const server = createServer((_request, response) => {
    response.writeHead(204).end();
  });
  server.on('connection', () => {
    connections += 1;
  });
  return { port: await listen(server), connections: () => connections };
};

const egressCheckedPython = (canaryPort: number): string => `import socket
from dataclasses import dataclass

from build123d import Box


@dataclass(frozen=True)
class Params:
    width: float = 10.0


def reachable():
    for address in (("1.1.1.1", 53), ("127.0.0.1", ${String(canaryPort)})):
        try:
            socket.create_connection(address, timeout=5).close()
            return "%s:%d" % address
        except Exception:
            pass
    return None


def main(params: Params):
    leak = reachable()
    if leak is not None:
        raise RuntimeError("worker egress allowed to " + leak)
    return Box(params.width, 20, 30)
`;

const egressCheckedCsharp = (canaryPort: number): string => `using System;
using System.ComponentModel.DataAnnotations;
using System.Net.Sockets;
using System.Numerics;
using PicoGK;

var leak = Egress.Reachable();
if (leak.Length > 0)
{
    throw new InvalidOperationException("worker egress allowed to " + leak);
}

Library.Go(Params.VoxelSizeMm, () =>
{
    Library.oViewer().Add(Voxels.voxSphere(Vector3.Zero, Params.RadiusMm));
});

public static class Params
{
    [Range(0.05, 5.0)]
    public static float VoxelSizeMm { get; set; } = 1.0f;

    [Range(1.0, 100.0)]
    public static float RadiusMm { get; set; } = 20.0f;
}

public static class Egress
{
    public static string Reachable()
    {
        foreach (var (host, port) in new[] { ("1.1.1.1", 53), ("127.0.0.1", ${String(canaryPort)}) })
        {
            try
            {
                using var client = new TcpClient();
                if (client.ConnectAsync(host, port).Wait(5000))
                {
                    return host + ":" + port;
                }
            }
            catch (Exception)
            {
            }
        }
        return "";
    }
}
`;

/** The bounding-box extents of the GLB an `export_model` answer names, in metres, smallest first. */
const exportedExtents = async (workspace: string, answer: string | undefined): Promise<number[]> => {
  const artifactPath = /"artifactPath":"(?<path>[^"]+)"/u.exec(answer ?? '')?.groups?.['path'];
  if (artifactPath === undefined) {
    throw new Error(`The export answer names no artifact: ${answer ?? '(none)'}`);
  }
  const glb = new Uint8Array(await readFile(join(workspace, artifactPath)));
  const bounds = getBoundingBoxFromInspect(await getInspectReport(glb));
  return [...(bounds?.size ?? [])].toSorted((left, right) => left - right);
};

describe.runIf(nativeDarwin)('tau serve native kernels on darwin-arm64 (W11 tier 4b, native-darwin)', () => {
  let scratch = '';

  beforeAll(async () => {
    /* A short root: the daemon's temp directory sits inside it, and the sandbox runtime listens on a Unix socket
     * there, whose path macOS limits to 104 bytes; the runner's own temp directory is already about 50. Not resolved:
     * macOS's `/tmp` is a link to `/private/tmp`, so the store is reached through a link, as a linked home is. */
    scratch = await mkdtemp(join(process.platform === 'darwin' ? '/tmp' : tmpdir(), 'tsd-'));
  });

  afterAll(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it(
    'should refuse .py and .cs from an empty store, prepare each kernel once over the daemon, then evaluate and export both models with no egress',
    async ({ annotate }) => {
      const root = await mkdtemp(join(scratch, 'r-'));
      const workspace = join(root, 'workspace');
      await mkdir(workspace, { recursive: true });
      const canary = await startCanary();
      await writeFile(join(workspace, 'main.py'), egressCheckedPython(canary.port));
      await writeFile(join(workspace, 'main.cs'), egressCheckedCsharp(canary.port));
      await writeFile(
        join(workspace, 'tau.json'),
        `${JSON.stringify({ $schema: 'https://tau.new/schemas/tau-v1.json', name: 'serve native darwin', description: '', tags: [], assets: { main: { entryPath: 'main.scad' } } })}\n`,
      );
      const script: ToolCall[] = [
        { name: 'evaluate_model', input: { targetFile: 'main.py' } },
        { name: 'evaluate_model', input: { targetFile: 'main.cs' } },
        { name: 'prepare_kernel', input: { kernel: 'build123d' } },
        { name: 'prepare_kernel', input: { kernel: 'picogk' } },
        { name: 'evaluate_model', input: { targetFile: 'main.py' } },
        { name: 'evaluate_model', input: { targetFile: 'main.cs' } },
        { name: 'export_model', input: { targetFile: 'main.py', to: 'glb' } },
        { name: 'export_model', input: { targetFile: 'main.cs', to: 'glb' } },
      ];
      const gateway = await startScriptedGateway(script);
      const origin = await startServe({
        workspace,
        relayUrl: await startStubRelay(),
        gatewayUrl: gateway.url,
        environment: {
          TAU_CONFIG_DIR: await configDirectoryWithCredential(root),
          /* Open acquisition: Build123d's bytes come from the seed when it is present, PicoGK's from its origins. */
          TAU_ACQUISITION: '',
          TAU_PAYLOAD_DIR: seedPresent ? seedDirectory : '',
          TAU_PAYLOAD_MIRROR: '',
          TAU_PAYLOAD_MIRROR_NO_FALLBACK: '',
          TAU_PAYLOAD_TARGET: '',
        },
      });

      const started = performance.now();
      const state = await runAgent(origin, realRunLimit);
      await annotate(`agent run settled ${String(state)} in ${String(Math.round(performance.now() - started))} ms`);
      const answers = gateway.answers();
      process.stderr.write(`serve native darwin answers: ${JSON.stringify(Object.fromEntries(answers))}\n`);

      expect(state).toBe('completed');
      expect(issueCodes(answers.get('call-1'))[0]).toBe('KERNEL_NOT_PREPARED');
      expect(answers.get('call-1')).toContain('"kernel":"build123d"');
      expect(issueCodes(answers.get('call-2'))[0]).toBe('KERNEL_NOT_PREPARED');
      expect(answers.get('call-2')).toContain('"kernel":"picogk"');
      expect(answers.get('call-3')).toMatch(/"status":"ready"/u);
      expect(answers.get('call-3')).toContain('"kernel":"build123d"');
      expect(answers.get('call-4')).toMatch(/"status":"ready"/u);
      expect(answers.get('call-4')).toContain('"kernel":"picogk"');
      for (const call of ['call-5', 'call-6']) {
        expect(answers.get(call), call).toMatch(/"status":"ready"/u);
        expect(issueCodes(answers.get(call)), call).toEqual([]);
        expect(answers.get(call), call).not.toMatch(permissionRefusal);
      }
      expect(await exportedExtents(workspace, answers.get('call-7'))).toEqual([
        expect.closeTo(0.01, 6),
        expect.closeTo(0.02, 6),
        expect.closeTo(0.03, 6),
      ]);
      const sphere = await exportedExtents(workspace, answers.get('call-8'));
      expect(sphere).toHaveLength(3);
      for (const extent of sphere) {
        expect(extent).toBeGreaterThan(0.038);
        expect(extent).toBeLessThan(0.042);
      }
      expect(canary.connections()).toBe(0);
    },
    realRunLimit,
  );
});
