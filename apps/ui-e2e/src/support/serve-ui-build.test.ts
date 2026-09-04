// @vitest-environment node
/**
 * The serve-build gate: `nx run ui:build:serve` produces a directory a daemon
 * can actually serve.
 *
 * A node test, not a browser spec: everything asserted here is about bytes on
 * the wire (status, headers, the SPA fallback, the CSS bundle's candidate set),
 * and none of it needs a page. The browser half — a real chat placed on the
 * daemon — is `src/daemon-agent-host.spec.ts`.
 */

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createServer } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { WebSocketServer } from 'ws';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolvePath(here, '../../../..');
const binPath = resolvePath(repoRoot, 'packages/cli/src/bin.ts');
const uiRoot = resolvePath(repoRoot, 'apps/ui/serve/build/client');
const agentToken = 'serve-ui-integration-token-at-least-32-chars';

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
}): Promise<URL> => {
  const child: ChildProcess = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      binPath,
      'serve',
      '--trust-projects',
      '--agentPort=0',
      `--ui=${uiRoot}`,
      `--workspace=${options.workspace}`,
      `--relay=${options.relayUrl.href}`,
      `--gateway=${options.relayUrl.href}`,
      '--model=fixture-model',
      '--modelProvider=anthropic',
    ],
    {
      cwd: repoRoot,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables are not camelCase
      env: {
        ...process.env,
        TAU_CONFIG_DIR: options.configDirectory,
        TAU_HOST_AGENT_TOKEN: agentToken,
        /* Vitest sets `NODE_ENV=test`, which drops consola to `warn` and
         * silences the line naming the port this test connects to. */
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
  return Promise.race([origin.promise, deadline]);
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

  it('serves the document, the SPA fallback, real assets and the host descriptor', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'tau-serve-ui-ws-'));
    const configDirectory = await mkdtemp(join(tmpdir(), 'tau-serve-ui-cfg-'));
    disposers.push(async () => {
      await rm(workspace, { recursive: true, force: true });
      await rm(configDirectory, { recursive: true, force: true });
    });
    await mkdir(configDirectory, { recursive: true });
    await writeFile(
      join(configDirectory, 'host.json'),
      `${JSON.stringify({ v: 1, deviceId: 'device-serve-ui', credential: 'serve-ui-device-credential-32-chars-min' })}\n`,
      'utf8',
    );
    const relayUrl = await startStubRelay();
    const origin = await startServe({ workspace, configDirectory, relayUrl });

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
  }, 180_000);
});
