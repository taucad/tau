/* eslint-disable @typescript-eslint/naming-convention -- Environment variables retain their wire names. */
/**
 * The adaptive desktop renderer (adaptive app deployment mode charter W6): the shell decides funded or not from the
 * API's `GET /v1/deployment` answer at runtime, and nothing it shows waits for that answer.
 *
 * Every row launches this checkout's desktop (unpackaged, or the package `TAU_E2E_DESKTOP_EXECUTABLE` names) with its
 * shipped renderer, `adaptive` since the flip (W8); only the row that removes the Cloud chunk points
 * `TAU_DESKTOP_CLIENT_ROOT` at an altered copy. The API is the run's real one,
 * funded (`development`), reached through a pass-through proxy that can answer or hold the deployment route alone:
 * the one case the harness lacks, the route failing while the rest answers.
 *
 * A completed-artifact run is a locked release package: it ignores `TAU_API_URL`, so no row can put the proxy in front
 * of its API, and these rows skip there.
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
import { desktopE2EApiUrl, desktopE2ECompletedArtifact, desktopE2EFrontendUrl } from '#support/config.js';
import { launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { composerOf, expectSignedIn, expectVisible } from '#support/scenario.js';
import { deleteTauTestUser, seedTauTestUser, tauBillingAccountArgs, tauTestAccount } from '#support/tau-account.js';

const execFileAsync = promisify(execFile);
const workspaceRoot = resolvePath(import.meta.dirname, '../../..');
/** The shipped renderer of this checkout's unpackaged build: the copy the Cloud-chunk row alters. */
const shippedClientRoot = process.env['TAU_DESKTOP_CLIENT_ROOT'] ?? join(workspaceRoot, 'apps/ui/desktop/build/client');
const deploymentPath = '/v1/deployment';
const selfHostedApi = process.env['TAU_E2E_API_SELF_HOST'] === 'true';
const launchTimeout = 120_000;

/** What the proxy does with the deployment route; everything else passes through to the run's API. */
type DeploymentRoute = 'pass' | 'unfunded' | 'blackhole';

/**
 * The payment routes the proxy answers itself for one account (the relaunch row): no real Checkout exists here, so
 * the top-up is created as a hosted payment to open in the browser and is read back as fulfilled.
 */
type PaymentStubs = {
  readonly ownerId: string;
  readonly actionId: string;
  /** `GET /v1/billing/payment-actions/<id>` reads, by action id. */
  readonly reads: Map<string, number>;
};

type DeploymentProxy = {
  readonly url: string;
  route: DeploymentRoute;
  /** How many times the shell asked the deployment route. */
  asked: number;
  payments: PaymentStubs | undefined;
  readonly close: () => Promise<void>;
};

const paymentActionPath = '/v1/billing/payment-actions';

/** A manual top-up as the API reports it: opened in the browser, or fulfilled with its receipt. */
const paymentAction = (stubs: PaymentStubs, state: 'redirect_required' | 'fulfilled'): string =>
  JSON.stringify({
    version: 'payment-action-v1',
    actionId: stubs.actionId,
    environment: 'development',
    ownerId: stubs.ownerId,
    subjectId: 'subject-desktop-relaunch',
    purpose: 'manual_topup',
    state,
    frozen: {
      offerId: 'offer-desktop-relaunch',
      currency: 'usd',
      principalMinor: '2500',
      taxMinor: '0',
      grossMinor: '2500',
      maximumGrossMinor: '2500',
      creditAtoms: '250000000',
      paymentMethod: null,
    },
    redirectUrl: state === 'redirect_required' ? 'https://checkout.example.test/desktop-relaunch' : null,
    attention: null,
    receipt:
      state === 'fulfilled'
        ? {
            receiptId: 'receipt-desktop-relaunch',
            grantedCreditAtoms: '250000000',
            revision: '1',
            chargedPaymentMethod: null,
          }
        : null,
    updatedAt: new Date().toISOString(),
  });

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
    payments: undefined,
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
  const answerJson = (incoming: IncomingMessage, outgoing: ServerResponse, body: string): void => {
    outgoing.writeHead(200, {
      'content-type': 'application/json',
      'access-control-allow-origin': incoming.headers.origin ?? '*',
      'access-control-allow-credentials': 'true',
      vary: 'origin',
    });
    outgoing.end(body);
  };
  /* The entitlements as the API reports them, with payment collection on and no saved card, so the dialog offers a
   * hosted payment whatever this run's Stripe configuration is. */
  const forwardEntitlements = (incoming: IncomingMessage, outgoing: ServerResponse): void => {
    const upstream = httpRequest(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        method: incoming.method,
        path: incoming.url,
        headers: { ...incoming.headers, host: target.host, 'accept-encoding': 'identity' },
      },
      (answer) => {
        const parts: Array<Uint8Array<ArrayBuffer>> = [];
        answer.on('data', (part: Uint8Array<ArrayBuffer>) => parts.push(part));
        answer.on('end', () => {
          const headers = { ...answer.headers };
          delete headers['content-length'];
          let body = new TextDecoder().decode(Buffer.concat(parts));
          if (answer.statusCode === 200) {
            body = JSON.stringify({
              ...(JSON.parse(body) as Record<string, unknown>),
              paymentCollectionAvailable: true,
              paymentMethod: null,
            });
          }
          outgoing.writeHead(answer.statusCode ?? 502, headers);
          outgoing.end(body);
        });
      },
    );
    upstream.on('error', () => {
      outgoing.destroy();
    });
    incoming.pipe(upstream);
  };
  /** Answers a payment route itself while the stubs are on; `false` leaves the request to the API. */
  const answerPayment = (incoming: IncomingMessage, outgoing: ServerResponse, url: URL): boolean => {
    const stubs = proxy.payments;
    if (stubs === undefined || incoming.method === 'OPTIONS') {
      return false;
    }
    if (url.pathname === '/v1/billing/entitlements' && incoming.method === 'GET') {
      forwardEntitlements(incoming, outgoing);
      return true;
    }
    if (url.pathname === paymentActionPath && incoming.method === 'GET') {
      answerJson(incoming, outgoing, '[]');
      return true;
    }
    if (url.pathname === `${paymentActionPath}/topup` && incoming.method === 'POST') {
      incoming.resume();
      answerJson(incoming, outgoing, paymentAction(stubs, 'redirect_required'));
      return true;
    }
    const read = new RegExp(`^${paymentActionPath}/([^/]+)$`, 'u').exec(url.pathname);
    if (read?.[1] !== undefined && incoming.method === 'GET') {
      const actionId = decodeURIComponent(read[1]);
      stubs.reads.set(actionId, (stubs.reads.get(actionId) ?? 0) + 1);
      if (actionId === stubs.actionId) {
        answerJson(incoming, outgoing, paymentAction(stubs, 'fulfilled'));
      } else {
        outgoing.writeHead(404, { 'access-control-allow-origin': incoming.headers.origin ?? '*' });
        outgoing.end();
      }
      return true;
    }
    return false;
  };
  const server: Server = createServer((incoming, outgoing) => {
    const requestUrl = new URL(incoming.url ?? '/', 'http://proxy');
    if (answerPayment(incoming, outgoing, requestUrl)) {
      return;
    }
    const path = requestUrl.pathname;
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
  readonly last?: {
    readonly mode: string;
    readonly stage: string;
    readonly deadlinePassed?: boolean;
  };
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

/** The desktop's stored pending payments (`@taucad/billing-ui/lib/pending-payment-actions`). */
const pendingPaymentActionsKey = 'tau-pending-payment-actions';

const readPendingActionIds = async (current: DesktopSession): Promise<string[]> =>
  current.page.evaluate((key) => {
    const entries = JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{
      actionId: string;
    }>;
    return entries.map((entry) => entry.actionId);
  }, pendingPaymentActionsKey);

/** The signed-in account's user id, which the stubbed payment actions are owned by. */
const sessionUserId = async (token: string): Promise<string> => {
  const response = await fetch(`${desktopE2EApiUrl}/v1/auth/get-session`, {
    headers: { authorization: `Bearer ${token}`, origin: desktopE2EFrontendUrl },
  });
  const body = (await response.json()) as { readonly user?: { readonly id?: string } } | undefined;
  const id = body?.user?.id;
  if (id === undefined) {
    throw new Error(`The test account has no session (HTTP ${String(response.status)}).`);
  }
  return id;
};

/** The Cloud chunk's files in a renderer build, read from its emitted module graph. */
const cloudChunkFiles = async (clientRoot: string): Promise<string[]> => {
  /* The graph is an emitted asset, so it sits under `assets/`. */
  const names = await readdir(clientRoot, { recursive: true });
  const graphs = names.filter((name) =>
    /(?:^|\/)tau-module-graph(?:-[\w-]+)?\.json$/u.test(name.replaceAll('\\', '/')),
  );
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
      proxy.payments = undefined;
    }
  });

  afterAll(async () => {
    await proxy.close();
    await Promise.all(accounts.map(async (email) => deleteTauTestUser(email)));
    await Promise.all(temporary.map(async (path) => rm(path, { recursive: true, force: true })));
  });

  const launch = async (
    options: {
      clientRoot?: string;
      args?: readonly string[];
      signedIn?: boolean;
      /** Relaunch over this profile and account instead of a new one. */
      relaunch?: { readonly profileRoot: string; readonly token: string };
      /** Keep the profile when the session closes, for a relaunch. */
      preserveProfile?: boolean;
    } = {},
  ): Promise<{ session: DesktopSession; email?: string; token?: string }> => {
    let token = options.relaunch?.token ?? 'unused';
    let email: string | undefined;
    if (options.signedIn !== false && options.relaunch === undefined) {
      const account = tauTestAccount('adaptive');
      token = await seedTauTestUser(account);
      email = account.email;
      accounts.push(account.email);
    }
    session = await launchDesktopApp({
      token,
      ...(options.args === undefined ? {} : { args: options.args }),
      ...(options.relaunch === undefined ? {} : { profileRoot: options.relaunch.profileRoot }),
      ...(options.preserveProfile === true ? { preserveProfile: true } : {}),
      env: {
        TAU_API_URL: proxy.url,
        ...(options.clientRoot === undefined ? {} : { TAU_DESKTOP_CLIENT_ROOT: options.clientRoot }),
      },
    });
    return { session, ...(email === undefined ? {} : { email }), ...(token === 'unused' ? {} : { token }) };
  };

  it('announces after a quit and relaunch a payment opened before it, once, and drops an id older than a day (D14)', async () => {
    const { session: first, token } = await launch({ preserveProfile: true });
    const ownerId = await sessionUserId(token!);
    const stubs: PaymentStubs = { ownerId, actionId: `act_relaunch_${String(Date.now())}`, reads: new Map() };
    proxy.payments = stubs;
    await expectSignedIn(first.page);

    /* Start a top-up: the app stores the action's id itself and opens the hosted payment in the browser. */
    await first.page.goto('app://tau/?settings=billing', { waitUntil: 'load' });
    await first.page.getByRole('button', { name: 'Add credits' }).last().click({ timeout: launchTimeout });
    await first.page.getByRole('button', { name: /Continue to payment/u }).click({ timeout: launchTimeout });
    await expect.poll(async () => readPendingActionIds(first), { timeout: 30_000 }).toContain(stubs.actionId);

    /* An id opened 25 hours ago, beside it in the same record. */
    const expiredId = 'act_relaunch_expired';
    await first.page.evaluate(
      ({ key, entry }) => {
        const entries = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown[];
        localStorage.setItem(key, JSON.stringify([...entries, entry]));
      },
      {
        key: pendingPaymentActionsKey,
        entry: { actionId: expiredId, environment: 'development', ownerId, openedAt: Date.now() - 25 * 60 * 60 * 1000 },
      },
    );

    /* A real quit, as a person quits: main's own shutdown, which writes the page's storage on the way out. */
    const firstProcess = first.application.process();
    await first.application.evaluate(({ app }) => {
      app.quit();
    });
    await expect.poll(() => firstProcess.exitCode ?? firstProcess.signalCode, { timeout: 60_000 }).not.toBeNull();
    const { profileRoot } = first;
    await first.close();
    session = undefined;
    stubs.reads.clear();

    const { session: second } = await launch({ relaunch: { profileRoot, token: token! } });
    await expectVisible(second.page.getByText(/added to your balance/iu).first(), launchTimeout);
    expect(stubs.reads.get(stubs.actionId) ?? 0).toBeGreaterThan(0);
    /* Announced in an end state, so forgotten; the expired id was dropped without a read or an announcement. */
    await expect.poll(async () => readPendingActionIds(second), { timeout: 30_000 }).toEqual([]);
    expect(stubs.reads.get(expiredId)).toBeUndefined();
  });

  /* W9 D1 (research w9-desktop-acceptance-defects R1, R2; charter A2, A3). The renderer is taken offline the way the
   * operating system takes it: requests fail (session emulation) and the page reads offline (`navigator.onLine`). */
  it('shows the last-known person on an offline launch, then the user and Billing with no reload once the network returns', async () => {
    const accountName = 'Tau Desktop Smoke';
    const { session: first, token } = await launch({ preserveProfile: true });
    await expectSignedIn(first.page);
    const footerOf = (current: DesktopSession) =>
      current.page.getByRole('button', { name: new RegExp(accountName, 'u') }).first();
    /* Verified once online: the identity record is written. */
    await expectVisible(footerOf(first), launchTimeout);

    const firstProcess = first.application.process();
    await first.application.evaluate(({ app }) => {
      app.quit();
    });
    await expect
      .poll(() => firstProcess.exitCode ?? firstProcess.signalCode, {
        timeout: 60_000,
      })
      .not.toBeNull();
    const { profileRoot } = first;
    await first.close();
    session = undefined;

    const { session: second } = await launch({
      relaunch: { profileRoot, token: token! },
    });
    const setOffline = async (offline: boolean): Promise<void> => {
      await second.application.evaluate(async ({ session: electronSession }, isOffline) => {
        electronSession.defaultSession.enableNetworkEmulation({
          offline: isOffline,
        });
      }, offline);
      await second.application.context().setOffline(offline);
    };
    await setOffline(true);
    try {
      await second.page.reload({ waitUntil: 'load' });
      expect(await second.page.evaluate(() => navigator.onLine)).toBe(false);

      /* Offline: the footer names the person, never "Account", and the menu never offers "Sign in". */
      const footer = footerOf(second);
      await expectVisible(footer, launchTimeout);
      await expectVisible(composerOf(second.page), launchTimeout);
      await footer.click();
      const menu = second.page.getByRole('menu');
      await expectVisible(menu.getByText('Can’t reach Tau'), 30_000);
      expect(await menu.getByRole('menuitem', { name: 'Sign in' }).count()).toBe(0);
      await second.page.evaluate(() => {
        (globalThis as { w9NotReloaded?: boolean }).w9NotReloaded = true;
      });

      /* The network returns: within A3's 10 s, with no reload, the session verifies and Billing appears. */
      await setOffline(false);
      await expect
        .poll(async () => menu.getByText('Can’t reach Tau').count(), {
          timeout: 10_000,
        })
        .toBe(0);
      await expectVisible(menu.getByRole('menuitem', { name: /^(?:Billing|Upgrade to Pro)$/u }), 10_000);
      await expectVisible(footer, 10_000);
      expect(await second.page.evaluate(() => (globalThis as { w9NotReloaded?: boolean }).w9NotReloaded === true)).toBe(
        true,
      );
    } finally {
      await setOffline(false);
    }
  });

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
    await cp(shippedClientRoot, copy, { recursive: true });
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
