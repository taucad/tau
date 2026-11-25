// @vitest-environment node
/**
 * The serve-build gate: `nx run ui:build:serve` produces a directory a daemon
 * can actually serve, holding no cadmpeg engine: the daemon serves the ones its
 * own `cadmpeg-ts` installed, same-origin, and only when the build expects
 * exactly those (cadmpeg engine delivery charter W6, D12, I1, EQ1 option A).
 *
 * A node test, not a browser spec: everything asserted here is about bytes on
 * the wire (status, headers, the SPA fallback, the CSS bundle's candidate set),
 * and none of it needs a page. The browser half — a real chat placed on the
 * daemon — is `src/daemon-agent-host.spec.ts`.
 */

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createServer } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { access, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { WebSocketServer } from 'ws';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolvePath(here, '../../../..');
const binPath = resolvePath(repoRoot, 'packages/cli/src/bin.ts');
const uiRoot = resolvePath(repoRoot, 'apps/ui/serve/build/client');
const agentToken = 'serve-ui-integration-token-at-least-32-chars';

type FileDigest = { readonly sha256: string; readonly byteLength: number };

/** The `cadmpeg-ts` the CLI under test loads (through `@taucad/cadmpeg`), and the digests it states. */
const installedCadmpeg = async (): Promise<{
  readonly version: string;
  readonly digests: Readonly<Record<string, { readonly wasm: FileDigest; readonly gzip: FileDigest }>>;
}> => {
  const plugin = createRequire(resolvePath(repoRoot, 'packages/plugins/cadmpeg/package.json'));
  const { version } = JSON.parse(await readFile(plugin.resolve('cadmpeg-ts/package.json'), 'utf8')) as {
    readonly version: string;
  };
  const { digests } = (await import(pathToFileURL(plugin.resolve('cadmpeg-ts/digests')).href)) as {
    readonly digests: Readonly<Record<string, { readonly wasm: FileDigest; readonly gzip: FileDigest }>>;
  };
  return { version, digests };
};

const sha256Of = async (path: string): Promise<string> => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Uint8Array<ArrayBuffer>);
  }
  return hash.digest('hex');
};

/** Every file under a directory, as absolute paths. */
const filesUnder = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name));
};

const disposers: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) {
    // oxlint-disable-next-line no-await-in-loop -- teardown is ordered: child first, then its servers.
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
    sockets.handleUpgrade(request, socket, head, (accepted) => {
      accepted.on('message', () => undefined);
    });
  });
  const port = await listen(server);
  return new URL(`http://127.0.0.1:${String(port)}`);
};

const startServe = async (options: {
  readonly workspace: string;
  readonly configDirectory: string;
  readonly relayUrl: URL;
  /** The UI to serve; the build under test by default. */
  readonly ui?: string;
}): Promise<{ readonly origin: URL; readonly output: () => string }> => {
  const child: ChildProcess = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      binPath,
      'serve',
      '--trust-projects',
      '--agentPort=0',
      `--ui=${options.ui ?? uiRoot}`,
      `--workspace=${options.workspace}`,
      `--relay=${options.relayUrl.href}`,
      `--gateway=${options.relayUrl.href}`,
      '--model=fixture-model',
      '--modelProvider=anthropic',
    ],
    {
      cwd: repoRoot,
      /* eslint-disable @typescript-eslint/naming-convention -- child-process environment variable names. */
      env: {
        ...process.env,
        TAU_CONFIG_DIR: options.configDirectory,
        TAU_HOST_AGENT_TOKEN: agentToken,
        /* Vitest sets `NODE_ENV=test`, which drops consola to `warn` and
         * silences the line naming the port this test connects to. */
        CONSOLA_LEVEL: '4',
      },
      /* eslint-enable @typescript-eslint/naming-convention -- environment literal ends here. */
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const output: string[] = [];
  const origin = Promise.withResolvers<URL>();
  const scan = (chunk: Uint8Array<ArrayBuffer>): void => {
    const text = Buffer.from(chunk).toString('utf8');
    output.push(text);
    const match = /http:\/\/127\.0\.0\.1:(\d+)/u.exec(text);
    if (match) {
      origin.resolve(new URL(`http://127.0.0.1:${match[1]!}`));
    }
  };
  child.stdout?.on('data', scan);
  child.stderr?.on('data', scan);
  const report = (reason: string): Error => {
    process.stderr.write(`\n--- tau serve output ---\n${output.join('')}\n--- end ---\n`);
    return new Error(reason);
  };
  child.once('exit', (code) => {
    origin.reject(report(`tau serve exited early with code ${String(code)}`));
  });
  disposers.push(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise<void>((resolve) => {
        child.once('exit', () => {
          resolve();
        });
      });
      child.kill('SIGTERM');
      await Promise.race([
        exited,
        new Promise((resolve) => {
          setTimeout(resolve, 5000);
        }),
      ]);
      child.kill('SIGKILL');
    }
  });
  const deadline = new Promise<never>((_resolve, reject) => {
    const timer = setTimeout(() => {
      reject(report('tau serve never announced its agent channel'));
    }, 90_000);
    timer.unref();
  });
  return { origin: await Promise.race([origin.promise, deadline]), output: () => output.join('') };
};

/** A workspace, a paired config directory and a stub relay, removed after the test. */
const serveFixture = async (): Promise<{
  readonly workspace: string;
  readonly configDirectory: string;
  readonly relayUrl: URL;
}> => {
  const workspace = await mkdtemp(join(tmpdir(), 'tau-serve-ui-ws-'));
  const configDirectory = await mkdtemp(join(tmpdir(), 'tau-serve-ui-cfg-'));
  disposers.push(async () => {
    /* A revision store the stopped daemon was still writing can hold `.git`
       for a moment after the process exits: retry rather than fail on teardown. */
    await rm(workspace, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 });
    await rm(configDirectory, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 });
  });
  await mkdir(configDirectory, { recursive: true });
  await writeFile(
    join(configDirectory, 'host.json'),
    `${JSON.stringify({ v: 1, deviceId: 'device-serve-ui', credential: 'serve-ui-device-credential-32-chars-min' })}\n`,
    'utf8',
  );
  return { workspace, configDirectory, relayUrl: await startStubRelay() };
};

describe('tau serve --ui (the serve build)', () => {
  beforeAll(async () => {
    try {
      await access(join(uiRoot, 'index.html'));
    } catch {
      throw new Error(`The serve build is missing. Run: pnpm nx run ui:build:serve (expected ${uiRoot}/index.html)`);
    }
  });

  it('ships every app utility class in its stylesheet', async () => {
    /* Tailwind's automatic source detection is rooted at the Vite `root`, which
     * this build moves to `apps/ui/serve` — three files. Without the `@source`
     * directives in `app/styles/global.css` the bundle would ship roughly half
     * the utilities, and the missing ones include `h-dvh`, whose absence
     * collapses the whole workbench column to `height: 0`. Assert the class,
     * not the file's existence. */
    const assets = join(uiRoot, 'assets');
    const entries = await readdir(assets);
    const stylesheet = entries.find((entry) => /^global-.*\.css$/u.test(entry));
    expect(stylesheet).toBeDefined();
    const css = await readFile(join(assets, stylesheet!), 'utf8');
    for (const utility of ['h-dvh', 'text-muted-foreground', 'shrink-0']) {
      expect(css).toContain(utility);
    }
  });

  it('holds no cadmpeg engine, and names the cadmpeg-ts engines it loads from the daemon', async () => {
    const { version, digests } = await installedCadmpeg();
    const stated = new Map<number, Set<string>>();
    for (const { wasm, gzip } of Object.values(digests)) {
      for (const file of [wasm, gzip]) {
        stated.set(file.byteLength, (stated.get(file.byteLength) ?? new Set()).add(file.sha256));
      }
    }
    /* I1: no file of the build is an engine, raw or gzipped, by digest; only files of a stated length are hashed. */
    for (const file of await filesUnder(uiRoot)) {
      expect(file, 'a wasm-bindgen engine file name').not.toMatch(/_bg\.wasm(?:\.gz)?$/u);
      // oxlint-disable-next-line no-await-in-loop -- one stat per file; the build has a few thousand.
      const { size } = await stat(file);
      const candidates = stated.get(size);
      if (candidates) {
        // oxlint-disable-next-line no-await-in-loop -- hashed only on a length match, which no build file should have.
        expect(candidates.has(await sha256Of(file)), `${file} is a cadmpeg engine`).toBe(false);
      }
    }
    const manifest: unknown = JSON.parse(await readFile(join(uiRoot, 'cadmpeg-engines.json'), 'utf8'));
    expect(manifest).toEqual({
      schemaVersion: 1,
      package: 'cadmpeg-ts',
      version,
      path: '/cadmpeg-engines/',
      modules: Object.fromEntries(Object.entries(digests).map(([id, digest]) => [id, digest.wasm])),
    });
  });

  it('serves the document, the SPA fallback, real assets, the host descriptor and the installed engines', async () => {
    const fixture = await serveFixture();
    const { workspace } = fixture;
    const { origin } = await startServe(fixture);

    // The document, cross-origin isolated so the UI may use SharedArrayBuffer.
    const document = await fetch(new URL('/', origin));
    expect(document.status).toBe(200);
    expect(document.headers.get('content-type')).toContain('text/html');
    expect(document.headers.get('cross-origin-opener-policy')).toBe('same-origin');
    expect(document.headers.get('cross-origin-embedder-policy')).toBe('require-corp');
    const html = await document.text();
    expect(html).toContain('/assets/entry.client-');
    /* The serve root keeps the shared loader precisely so this is baked: a
     * daemon has no preload to inject `window.ENV`, unlike the Electron
     * shell, so a bundle without it would have no API origin at all. */
    expect(html).toContain('window.ENV');
    expect(html).toContain('TAU_API_URL');

    // Every client route falls back to the same document — there is no server.
    const deepLink = await fetch(new URL('/w/some-workspace/some-project', origin));
    expect(deepLink.status).toBe(200);
    await expect(deepLink.text()).resolves.toBe(html);

    // Assets are served as themselves, not as the fallback document.
    const assetHref = /\/assets\/[^"']+\.js/u.exec(html)?.[0];
    expect(assetHref).toBeDefined();
    const asset = await fetch(new URL(assetHref!, origin));
    expect(asset.status).toBe(200);
    expect(asset.headers.get('content-type')).toContain('javascript');

    // Rung-1 discovery, from the same origin the page was served from.
    const descriptor = await fetch(new URL('/.well-known/tau-host', origin));
    expect(descriptor.status).toBe(200);
    expect(descriptor.headers.get('cache-control')).toBe('no-store');
    await expect(descriptor.json()).resolves.toMatchObject({ v: 1, agent: true, workspaceRoot: workspace });

    // One engine, fetched as the page fetches it, carries exactly the bytes `cadmpeg-ts/digests` states (I2, I9).
    const { digests } = await installedCadmpeg();
    const [id, { wasm }] = Object.entries(digests).toSorted(
      ([, left], [, right]) => left.wasm.byteLength - right.wasm.byteLength,
    )[0]!;
    const engine = await fetch(new URL(`/cadmpeg-engines/${id}_bg.wasm`, origin), { redirect: 'error' });
    expect(engine.status).toBe(200);
    expect(engine.headers.get('content-type')).toBe('application/wasm');
    expect(engine.headers.get('cross-origin-embedder-policy')).toBe('require-corp');
    expect(engine.headers.get('cross-origin-opener-policy')).toBe('same-origin');
    expect(engine.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    const bytes = new Uint8Array(await engine.arrayBuffer());
    expect(bytes.byteLength).toBe(wasm.byteLength);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(wasm.sha256);

    // The mount answers engines only: no glue, no package file, no traversal, no SPA fallback.
    for (const path of [
      '/cadmpeg-engines/step.js',
      '/cadmpeg-engines/..%2fpackage.json',
      '/cadmpeg-engines/wasm/x.wasm',
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- each refusal is checked in turn.
      const refused = await fetch(new URL(path, origin));
      expect(refused.status, path).toBe(403);
      // oxlint-disable-next-line no-await-in-loop -- drain before the next request.
      await refused.body?.cancel();
    }
  }, 180_000);

  it('refuses to serve engines to a UI built against another cadmpeg-ts, and says why (EQ1 option A)', async () => {
    const { version, digests } = await installedCadmpeg();
    const skewed = await mkdtemp(join(tmpdir(), 'tau-serve-ui-skew-'));
    disposers.push(async () => rm(skewed, { recursive: true, force: true }));
    await writeFile(join(skewed, 'index.html'), '<!doctype html><title>Tau</title>');
    await writeFile(
      join(skewed, 'cadmpeg-engines.json'),
      JSON.stringify({
        schemaVersion: 1,
        package: 'cadmpeg-ts',
        version: '0.0.0-skewed',
        path: '/cadmpeg-engines/',
        modules: Object.fromEntries(Object.entries(digests).map(([id, digest]) => [id, digest.wasm])),
      }),
    );
    const { origin, output } = await startServe({ ...(await serveFixture()), ui: skewed });

    const engine = await fetch(new URL(`/cadmpeg-engines/${Object.keys(digests)[0]!}_bg.wasm`, origin));
    expect(engine.status).toBe(404);
    await engine.body?.cancel();
    const log = output().replaceAll(/\s+/gu, ' ');
    expect(log).toContain(
      `built against cadmpeg-ts 0.0.0-skewed engines, and this CLI has cadmpeg-ts ${version} installed`,
    );
    expect(log).toContain('Native CAD import');
  }, 180_000);
});
