/* eslint-disable @typescript-eslint/naming-convention -- Environment variables retain their wire names. */
/**
 * The adaptive desktop renderer (adaptive app deployment mode charter W6): the shell decides funded or not from the
 * API's `GET /v1/deployment` answer at runtime, and nothing it shows waits for that answer.
 *
 * Every row launches this checkout's desktop (unpackaged, or the package `TAU_E2E_DESKTOP_EXECUTABLE` names) with the
 * adaptive renderer (`ui:build:desktop-adaptive`) through `TAU_DESKTOP_CLIENT_ROOT`. The API is the run's real one,
 * funded (`development`), reached through a pass-through proxy that can answer or hold the deployment route alone:
 * the one case the harness lacks, the route failing while the rest answers.
 *
 * A completed-artifact run is a locked release package that ignores `TAU_DESKTOP_CLIENT_ROOT`; until the shipped
 * renderer is adaptive (W8) these rows skip there.
 */
import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { desktopE2EApiUrl, desktopE2ECompletedArtifact } from '#support/config.js';
import { launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { composerOf, expectSignedIn, expectVisible } from '#support/scenario.js';
import { deleteTauTestUser, seedTauTestUser, tauBillingAccountArgs, tauTestAccount } from '#support/tau-account.js';

const execFileAsync = promisify(execFile);
const workspaceRoot = resolvePath(import.meta.dirname, '../../..');
const adaptiveClientRoot =
  process.env['TAU_E2E_ADAPTIVE_CLIENT_ROOT'] ?? join(workspaceRoot, 'apps/ui/desktop/build-adaptive/client');
const deploymentPath = '/v1/deployment';
const selfHostedApi = process.env['TAU_E2E_API_SELF_HOST'] === 'true';
const launchTimeout = 120_000;

/** What the proxy does with the deployment route; everything else passes through to the run's API. */
type DeploymentRoute = 'pass' | 'unfunded' | 'blackhole';

type DeploymentProxy = {
  readonly url: string;
  route: DeploymentRoute;
  /** How many times the shell asked the deployment route. */
  asked: number;
  readonly close: () => Promise<void>;
};

const unfundedAnswer = JSON.stringify({
  version: 1,
  edition: 'self-host',
  billing: { funded: false },
  maxAgeSeconds: 60,
});

const startDeploymentProxy = async (): Promise<DeploymentProxy> => {
  const target = new URL(desktopE2EApiUrl);
  const held: ServerResponse[] = [];
  const proxy: DeploymentProxy = {
    url: '',
    route: 'pass',
    asked: 0,
    close: async () => undefined,
  };
  const forward = (incoming: IncomingMessage, outgoing: ServerResponse): void => {
    const upstream = httpRequest(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        method: incoming.method,
        path: incoming.url,
        headers: { ...incoming.headers, host: target.host },
      },
      (answer) => {
        outgoing.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(outgoing);
      },
    );
    upstream.on('error', () => {
      outgoing.destroy();
    });
    incoming.pipe(upstream);
  };
  const server: Server = createServer((incoming, outgoing) => {
    const path = new URL(incoming.url ?? '/', 'http://proxy').pathname;
    if (path !== deploymentPath || proxy.route === 'pass') {
      if (path === deploymentPath) {
        proxy.asked += 1;
      }
      forward(incoming, outgoing);
      return;
    }
    proxy.asked += 1;
    if (proxy.route === 'blackhole') {
      /* Accepted and never answered: the ask's own deadline is all that ends it. */
      held.push(outgoing);
      return;
    }
    outgoing.writeHead(200, {
      'content-type': 'application/json',
      'access-control-allow-origin': incoming.headers.origin ?? '*',
      'access-control-allow-credentials': 'true',
      vary: 'origin',
    });
    outgoing.end(unfundedAnswer);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return Object.assign(proxy, {
    url: `http://127.0.0.1:${String(port)}`,
    close: async () => {
      for (const response of held.splice(0)) {
        response.destroy();
      }
      server.closeAllConnections();
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    },
  });
};

type BootLedger = {
  readonly unhealthyCount: number;
  readonly last?: { readonly mode: string; readonly stage: string; readonly deadlinePassed?: boolean };
};

const readBootLedger = async (session: DesktopSession): Promise<BootLedger | undefined> => {
  try {
    return JSON.parse(await readFile(join(session.profileRoot, 'boot-health.json'), 'utf8')) as BootLedger;
  } catch {
    return undefined;
  }
};

/** The launch reached `home-ready` inside the watchdog's deadlines and was recorded healthy. */
const expectHealthyLaunch = async (session: DesktopSession): Promise<void> => {
  await expect
    .poll(
      async () => {
        const ledger = await readBootLedger(session);
        return ledger?.last?.stage;
      },
      { timeout: launchTimeout },
    )
    .toBe('home-ready');
  const ledger = await readBootLedger(session);
  expect(ledger?.last?.deadlinePassed ?? false).toBe(false);
  expect(ledger?.unhealthyCount).toBe(0);
};

const openUsage = async (session: DesktopSession): Promise<void> => {
  await session.page.goto('app://tau/usage', { waitUntil: 'load' });
};

const usageHeading = (session: DesktopSession) => session.page.getByText('Tau usage', { exact: true });

/** The Cloud chunk's files in a renderer build, read from its emitted module graph. */
const cloudChunkFiles = async (clientRoot: string): Promise<string[]> => {
  const names = await readdir(clientRoot);
  const graphs = names.filter((name) => /^tau-module-graph-.+\.json$/u.test(name));
  const files = new Set<string>();
  for (const graph of graphs) {
    // oxlint-disable-next-line no-await-in-loop -- one or two graph files.
    const { chunks } = JSON.parse(await readFile(join(clientRoot, graph), 'utf8')) as {
      chunks: Array<{ fileName: string; moduleIds: string[] }>;
    };
    for (const chunk of chunks) {
      if (chunk.moduleIds.some((id) => id.replaceAll('\\', '/').endsWith('app/cloud/cloud-surfaces.lazy.tsx'))) {
        files.add(chunk.fileName);
      }
    }
  }
  return [...files];
};

describe.skipIf(desktopE2ECompletedArtifact || selfHostedApi)('adaptive desktop renderer (W6)', () => {
  let proxy: DeploymentProxy;
  let session: DesktopSession | undefined;
  const accounts: string[] = [];
  const temporary: string[] = [];

  beforeAll(async () => {
    proxy = await startDeploymentProxy();
  });

  afterEach(async ({ task }) => {
    try {
      if (task.result?.state === 'fail') {
        await session?.capture(`desktop-adaptive-mode-${task.name.slice(0, 40).replaceAll(/\W+/gu, '-')}`);
      }
    } finally {
      await session?.close();
      session = undefined;
      proxy.route = 'pass';
      proxy.asked = 0;
    }
  });

  afterAll(async () => {
    await proxy.close();
    await Promise.all(accounts.map(async (email) => deleteTauTestUser(email)));
    await Promise.all(temporary.map(async (path) => rm(path, { recursive: true, force: true })));
  });

  const launch = async (
    options: { clientRoot?: string; args?: readonly string[]; signedIn?: boolean } = {},
  ): Promise<{ session: DesktopSession; email?: string; token?: string }> => {
    let token = 'unused';
    let email: string | undefined;
    if (options.signedIn !== false) {
      const account = tauTestAccount('adaptive');
      token = await seedTauTestUser(account);
      email = account.email;
      accounts.push(account.email);
    }
    session = await launchDesktopApp({
      token,
      ...(options.args === undefined ? {} : { args: options.args }),
      env: {
        TAU_API_URL: proxy.url,
        TAU_DESKTOP_CLIENT_ROOT: options.clientRoot ?? adaptiveClientRoot,
      },
    });
    return { session, ...(email === undefined ? {} : { email }), ...(token === 'unused' ? {} : { token }) };
  };

  it('shows the funded surfaces against a funded API, and /usage with the balance', async () => {
    const { session: current } = await launch();
    await expectSignedIn(current.page);
    await expectVisible(composerOf(current.page), launchTimeout);
    await openUsage(current);
    await expectVisible(usageHeading(current), launchTimeout);
    await expectVisible(current.page.getByTestId('purchased-balance'), launchTimeout);
    expect(proxy.asked).toBeGreaterThan(0);
  });

  it('shows no funded surface against an unfunded answer: /usage is not found', async () => {
    proxy.route = 'unfunded';
    const { session: current } = await launch();
    await expectVisible(composerOf(current.page), launchTimeout);
    await openUsage(current);
    await expectVisible(current.page.getByText(/not found/iu).first(), launchTimeout);
    await expect.poll(async () => usageHeading(current).count()).toBe(0);
  });

  it('boots healthy with the deployment route blackholed: both boot signals arrive within the deadlines', async () => {
    proxy.route = 'blackhole';
    const { session: current } = await launch();
    await expectVisible(composerOf(current.page), launchTimeout);
    await expectHealthyLaunch(current);
    expect(proxy.asked).toBeGreaterThan(0);
    /* No answer ever came: the funded-only page says which wait it is, never the page itself. */
    await openUsage(current);
    await expect.poll(async () => usageHeading(current).count(), { timeout: 10_000 }).toBe(0);
  });

  it('keeps the shell usable with the Cloud chunk removed from the renderer', async () => {
    const copy = await mkdtemp(join(tmpdir(), 'tau-desktop-adaptive-client-'));
    temporary.push(copy);
    await cp(adaptiveClientRoot, copy, { recursive: true });
    const removed = await cloudChunkFiles(copy);
    expect(removed.length).toBeGreaterThan(0);
    await Promise.all(removed.map(async (file) => rm(join(copy, file), { force: true })));
    const { session: current } = await launch({ clientRoot: copy });
    await expectVisible(composerOf(current.page), launchTimeout);
    await expectHealthyLaunch(current);
    /* The failed load goes to the stale-build recovery; once it settles the shell still answers. */
    await expectVisible(composerOf(current.page), launchTimeout);
    expect(current.application.windows().some((page) => page.url().endsWith('/recovery/index.html'))).toBe(false);
  });

  it('shows no Cloud surface in safe mode, and never asks the route (D10)', async () => {
    const { session: current } = await launch({ args: ['--safe-mode'] });
    await expectVisible(current.page.locator('[data-slot="safe-mode-bar"]'), launchTimeout);
    await openUsage(current);
    await expect.poll(async () => usageHeading(current).count(), { timeout: 10_000 }).toBe(0);
    expect(proxy.asked).toBe(0);
  });

  it('refetches the balance when the window regains focus without hiding (D14)', async () => {
    const { session: current, email } = await launch();
    await openUsage(current);
    const balance = current.page.getByTestId('purchased-balance');
    await expectVisible(balance, launchTimeout);
    const before = await balance.textContent();
    await execFileAsync(process.execPath, [...tauBillingAccountArgs('fund', email!), '--atoms', '7000000000'], {
      cwd: workspaceRoot,
      encoding: 'utf8',
    });
    /* A blur and a focus with the window never hidden: no visibility change, so only the focus listener can refetch. */
    await current.page.evaluate(() => {
      globalThis.dispatchEvent(new Event('blur'));
      globalThis.dispatchEvent(new Event('focus'));
    });
    await expect.poll(async () => balance.textContent(), { timeout: 30_000 }).not.toBe(before);
  });
});
