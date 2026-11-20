import { afterEach, describe, expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { cloudStandInCommands } from '#support/cloud-stand-ins.js';

/**
 * The adaptive web build (adaptive app deployment mode charter W7, `ui-e2e:test:e2e:adaptive`): `ui:build`, `adaptive`
 * since the flip (W8). The page decides funded or not from the API's `GET /v1/deployment`
 * answer, after first paint, and nothing it shows waits for that answer.
 *
 * No API runs: the cloud stand-ins answer the signed-in session and refuse every other API path, and each row gives
 * the deployment route its own answer, holds it, or leaves it refused. Other tiers skip these rows.
 */

type AdaptiveCommands = {
  uiRouteDeploymentAnswer(answer: 'funded' | 'unfunded'): Promise<void>;
  uiFailTargetRequests(pattern: string): Promise<void>;
  uiCloudChunkPaths(): Promise<readonly string[]>;
  uiIsAdaptiveTier(): Promise<boolean>;
  uiDelayTargetRequests(pattern: string, milliseconds: number | 'until-released'): Promise<void>;
  uiReleaseTargetRequests(): Promise<void>;
  uiStartObservedRequests(): Promise<void>;
  uiReadObservedRequests(settle?: boolean): Promise<readonly string[]>;
  uiStartSeededServer(answer: 'funded' | 'unfunded' | 'blackholed'): Promise<string>;
  uiStopSeededServers(): Promise<void>;
  uiFetchDocument(url: string): Promise<{ status: number; html: string; milliseconds: number }>;
};

const commands = target.commands as unknown as AdaptiveCommands;
const cloud = cloudStandInCommands(target.commands);
/** Only the adaptive tier runs these rows: it answers the deployment route itself and has no API behind it. */
const adaptiveTier = await commands.uiIsAdaptiveTier();
const deploymentPattern = String.raw`/v1/deployment(?:\?|$)`;
const apiOrigin = 'http://localhost:4000';
/** How long a settled page is watched for a late Cloud request. Milliseconds. */
const settleWindow = 5000;

const escapePattern = (text: string): string => text.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`);

const home = async (path = '/'): Promise<void> => {
  await target.navigate(path);
  await target.expectVisible(selectors.getByRole('main'), 60_000);
};

const cloudChunkRequested = async (paths: readonly string[]): Promise<boolean> => {
  const requested = await commands.uiReadObservedRequests();
  return requested.some((path) => paths.includes(path));
};

describe.skipIf(!adaptiveTier)('adaptive web build (W7)', () => {
  test('asks for the Cloud chunk once the answer is funded, and has no /usage (D8)', async () => {
    await cloud.uiInstallCloudStandIns();
    await commands.uiRouteDeploymentAnswer('funded');
    const chunks = await commands.uiCloudChunkPaths();
    expect(chunks.length).toBeGreaterThan(0);
    await commands.uiStartObservedRequests();
    await home();
    await expect.poll(async () => cloudChunkRequested(chunks), { timeout: 30_000 }).toBe(true);
    await target.navigate('/usage');
    await target.expectVisible(selectors.getByText(/not found/iu).first(), 30_000);
  });

  test('never asks for the Cloud chunk against an unfunded answer', async () => {
    await cloud.uiInstallCloudStandIns();
    await commands.uiRouteDeploymentAnswer('unfunded');
    const chunks = await commands.uiCloudChunkPaths();
    await commands.uiStartObservedRequests();
    await home();
    await target.delay(settleWindow);
    expect(await cloudChunkRequested(chunks)).toBe(false);
  });

  test('renders Home with the deployment route blackholed, and loads no Cloud code', async () => {
    await cloud.uiInstallCloudStandIns();
    await commands.uiDelayTargetRequests(deploymentPattern, 'until-released');
    const chunks = await commands.uiCloudChunkPaths();
    await commands.uiStartObservedRequests();
    await home();
    await target.expectVisible(selectors.getByCss('[aria-label="Ask Tau to build anything..."]').first(), 60_000);
    await target.delay(settleWindow);
    expect(await cloudChunkRequested(chunks)).toBe(false);
  });

  test('hydrates without a mismatch over a remembered funded answer (T-BA14, I13)', async () => {
    await cloud.uiInstallCloudStandIns();
    await commands.uiDelayTargetRequests(deploymentPattern, 'until-released');
    await target.addInitScript(
      ({ key, record }: { key: string; record: string }) => {
        localStorage.setItem(key, record);
        const seen: string[] = [];
        (globalThis as unknown as { tauHydrationErrors: string[] }).tauHydrationErrors = seen;
        const original = console.error.bind(console);
        console.error = (...values: unknown[]) => {
          seen.push(values.map(String).join(' '));
          original(...values);
        };
        globalThis.addEventListener('error', (event) => {
          seen.push(String(event.message));
        });
      },
      {
        key: `tau-ui-deployment-mode:${apiOrigin}`,
        record: JSON.stringify({ version: 1, state: 'funded', environment: 'development', confirmedAt: Date.now() }),
      },
    );
    await home();
    await target.delay(settleWindow);
    const errors = await target.evaluate(
      () => (globalThis as unknown as { tauHydrationErrors: string[] }).tauHydrationErrors,
    );
    expect(errors.filter((message) => /hydrat|did not match|#418|#423|#425/iu.test(message))).toEqual([]);
  });

  test('leaves a payment_action landing alone while the mode is unknown, and reads it after a funded answer', async () => {
    await cloud.uiInstallCloudStandIns();
    await commands.uiRouteDeploymentAnswer('funded');
    await commands.uiDelayTargetRequests(deploymentPattern, 'until-released');
    await commands.uiStartObservedRequests();
    await home('/?payment_action=act_adaptive_e2e');
    await target.delay(settleWindow);
    expect(await target.currentUrl()).toContain('payment_action=act_adaptive_e2e');
    const beforeAnswer = await commands.uiReadObservedRequests();
    expect(beforeAnswer.filter((path) => path.includes('/payment-actions/'))).toEqual([]);
    await commands.uiReleaseTargetRequests();
    await expect
      .poll(
        async () => {
          const requested = await commands.uiReadObservedRequests();
          return requested.some((path) => path.endsWith('/v1/billing/payment-actions/act_adaptive_e2e'));
        },
        { timeout: 30_000 },
      )
      .toBe(true);
  });

  test('keeps the shell usable with the Cloud chunk blocked', async () => {
    await cloud.uiInstallCloudStandIns();
    await commands.uiRouteDeploymentAnswer('funded');
    const chunks = await commands.uiCloudChunkPaths();
    await commands.uiFailTargetRequests(chunks.map((path) => escapePattern(path)).join('|'));
    await home();
    await target.delay(settleWindow);
    await target.expectVisible(selectors.getByCss('[aria-label="Ask Tau to build anything..."]').first(), 60_000);
    expect(new URL(await target.currentUrl()).pathname).toBe('/');
  });

  test('keeps the shell usable with the Cloud chunk stalled, and loads it when it arrives', async () => {
    await cloud.uiInstallCloudStandIns();
    await commands.uiRouteDeploymentAnswer('funded');
    const chunks = await commands.uiCloudChunkPaths();
    await commands.uiDelayTargetRequests(chunks.map((path) => escapePattern(path)).join('|'), 'until-released');
    await commands.uiStartObservedRequests();
    await home();
    await target.expectVisible(selectors.getByCss('[aria-label="Ask Tau to build anything..."]').first(), 60_000);
    await expect.poll(async () => cloudChunkRequested(chunks), { timeout: 30_000 }).toBe(true);
    await commands.uiReleaseTargetRequests();
    await target.expectVisible(selectors.getByCss('[aria-label="Ask Tau to build anything..."]').first(), 30_000);
  });
});

/** A function-rendered page: Home and the project route are static shells on the deployed site, and carry no seed. */
const functionPage = '/w/acme/demo';
const seedPattern = /window\.__tauDeploymentSeed = (\{[^<]*\})/u;

const documentSeed = (html: string): unknown => {
  const match = seedPattern.exec(html);
  return match?.[1] === undefined ? undefined : (JSON.parse(match[1]) as unknown);
};

/** Record console errors and page errors from the first script on, for the hydration-parity check (T-BA14). */
const recordPageErrors = async (): Promise<void> => {
  await target.addInitScript(() => {
    const seen: string[] = [];
    (globalThis as unknown as { tauHydrationErrors: string[] }).tauHydrationErrors = seen;
    const original = console.error.bind(console);
    console.error = (...values: unknown[]) => {
      seen.push(values.map(String).join(' '));
      original(...values);
    };
    globalThis.addEventListener('error', (event) => {
      seen.push(String(event.message));
    });
  });
};

const hydrationErrors = async (): Promise<readonly string[]> => {
  const errors = await target.evaluate(
    () => (globalThis as unknown as { tauHydrationErrors: string[] }).tauHydrationErrors,
  );
  return errors.filter((message) => /hydrat|did not match|#418|#423|#425/iu.test(message));
};

describe.skipIf(!adaptiveTier)('server-supplied first snapshot (W11, T-BA14 extended)', () => {
  afterEach(async () => {
    await commands.uiStopSeededServers();
  });

  test('renders a funded document with the funded snapshot, hydrates it without a mismatch and loads the Cloud chunk', async () => {
    const origin = await commands.uiStartSeededServer('funded');
    const page = await commands.uiFetchDocument(`${origin}${functionPage}`);
    expect(page.status).toBe(200);
    expect(documentSeed(page.html)).toEqual({ state: 'funded', basis: 'confirmed', environment: 'development' });
    const chunks = await commands.uiCloudChunkPaths();
    await recordPageErrors();
    await commands.uiStartObservedRequests();
    await target.navigate(`${origin}${functionPage}`);
    await target.expectVisible(selectors.getByRole('main'), 60_000);
    await expect.poll(async () => cloudChunkRequested(chunks), { timeout: 30_000 }).toBe(true);
    await target.delay(settleWindow);
    expect(await hydrationErrors()).toEqual([]);
  });

  test('renders an unfunded document with the unfunded snapshot, hydrates it without a mismatch and loads no Cloud code', async () => {
    const origin = await commands.uiStartSeededServer('unfunded');
    const page = await commands.uiFetchDocument(`${origin}${functionPage}`);
    expect(documentSeed(page.html)).toEqual({ state: 'unfunded', basis: 'confirmed' });
    const chunks = await commands.uiCloudChunkPaths();
    await recordPageErrors();
    await commands.uiStartObservedRequests();
    await target.navigate(`${origin}${functionPage}`);
    await target.expectVisible(selectors.getByRole('main'), 60_000);
    await target.delay(settleWindow);
    expect(await cloudChunkRequested(chunks)).toBe(false);
    expect(await hydrationErrors()).toEqual([]);
  });

  test('renders within the server deadline with the route blackholed, with no snapshot, and the client resolves (I15)', async () => {
    const origin = await commands.uiStartSeededServer('blackholed');
    const page = await commands.uiFetchDocument(`${origin}${functionPage}`);
    expect(page.status).toBe(200);
    expect(page.milliseconds).toBeLessThan(5000);
    expect(documentSeed(page.html)).toBeUndefined();
    const chunks = await commands.uiCloudChunkPaths();
    await recordPageErrors();
    await commands.uiStartObservedRequests();
    await target.navigate(`${origin}${functionPage}`);
    await target.expectVisible(selectors.getByRole('main'), 60_000);
    await target.delay(settleWindow);
    expect(await cloudChunkRequested(chunks)).toBe(false);
    expect(await hydrationErrors()).toEqual([]);
  });

  test('carries no snapshot on a static-shell path such as Home', async () => {
    const origin = await commands.uiStartSeededServer('funded');
    const page = await commands.uiFetchDocument(`${origin}/`);
    expect(page.status).toBe(200);
    expect(documentSeed(page.html)).toBeUndefined();
  });
});
