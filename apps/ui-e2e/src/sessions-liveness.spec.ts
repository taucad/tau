/**
 * S48(16) and S48(18) — real browser liveness and policy-close evidence (V21).
 *
 * Dedicated workers come from Playwright, not product instrumentation. The
 * basename Vite gives the project kernel entry counts.
 */

/* oxlint-disable eslint/no-await-in-loop -- projects and sidebar pages must open in browser-observed order. */

import { describe, expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

const seedRoute = '/__e2e/project-file-tree';
const liveProjectBudget = 8;
const projectUrlPattern = /\/w\/[^/]+\/[^/]+/u;
const projectKernelBasename = /^runtime(?:-debug)?\.worker(?:-[A-Za-z0-9_-]+)?\.(?:js|ts)$/u;
const composer = '[aria-label="Ask Tau to build anything..."]';

/** Every run parks on its one provider response. */
const concurrentRunScript = [
  {
    text: 'The liveness run is waiting at its deterministic gate.',
    gated: true,
    usage: { inputTokens: 20, outputTokens: 8 },
  },
] as const;

type WorkerFact = Awaited<ReturnType<typeof target.workers>>[number];
type WorkerSet = Readonly<{ kernels: readonly WorkerFact[] }>;

const classifyWorkers = async (): Promise<WorkerSet> => {
  const running = await target.workers();
  const matches = (worker: WorkerFact, pattern: RegExp): boolean => {
    const basename = new URL(worker.url).pathname.split('/').at(-1) ?? '';
    return pattern.test(basename);
  };
  const kernels = running.filter((worker) => matches(worker, projectKernelBasename));
  return { kernels };
};

const waitForKernelCount = async (count: number): Promise<WorkerSet> => {
  await expect
    .poll(
      async () => {
        const workers = await classifyWorkers();
        return workers.kernels.length;
      },
      { timeout: 120_000 },
    )
    .toBe(count);
  return classifyWorkers();
};

const currentPath = async (): Promise<string> => {
  const url = await target.currentUrl();
  return new URL(url).pathname;
};

const seedProject = async (): Promise<string> => {
  await target.navigate(seedRoute);
  await target.expectUrl(projectUrlPattern, 180_000);
  /* URL arrival alone used to pass even when the sole slug resolver rendered
   * Project Not Found. This surface requires the project revision client, so
   * it proves that creation has reached a resolved project route. */
  await target.expectVisible(selectors.getByRole('button', { name: /^Open Revisions\./u }), 120_000);
  return target.currentUrl();
};

const authenticateAgentSession = async (): Promise<void> => {
  await target.authenticateTauTestUser({
    creditAtoms: '100000000',
    email: `sessions-liveness-${globalThis.crypto.randomUUID()}@e2e.tau`,
    name: 'Sessions Liveness E2E',
    password: 'Tau-test-password-7!',
  });
};

/** Page the sidebar until it has no next page, waiting on the list itself. */
const expandSidebar = async (): Promise<void> => {
  for (let page = 0; page < 8; page += 1) {
    const result = await target.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find(
        (entry) => entry.textContent.trim() === 'Show more projects',
      );
      const before = document.querySelectorAll('a[href^="/w/"]').length;
      button?.click();
      return { clicked: Boolean(button), before };
    });
    if (!result.clicked) {
      return;
    }
    await expect
      .poll(
        async () =>
          target.evaluate(
            (before) =>
              document.querySelectorAll('a[href^="/w/"]').length > before ||
              ![...document.querySelectorAll('button')].some(
                (entry) => entry.textContent.trim() === 'Show more projects',
              ),
            result.before,
          ),
        { timeout: 60_000 },
      )
      .toBe(true);
  }
};

const openFromSidebar = async (path: string): Promise<void> => {
  const listed = async (): Promise<boolean> =>
    target.evaluate((href) => Boolean(document.querySelector(`a[href="${href}"]`)), path);
  await expect
    .poll(
      async () => {
        if (await listed()) {
          return true;
        }
        await expandSidebar();
        return listed();
      },
      { timeout: 60_000 },
    )
    .toBe(true);
  await target.evaluate((href) => {
    document.querySelector<HTMLAnchorElement>(`a[href="${href}"]`)?.click();
  }, path);
  await expect.poll(currentPath, { timeout: 120_000 }).toBe(path);
};

const projectRowDescription = async (path: string): Promise<string> =>
  target.evaluate((href) => {
    const link = document.querySelector<HTMLAnchorElement>(`a[href="${href}"]`);
    return (link?.getAttribute('aria-describedby') ?? '')
      .split(/\s+/u)
      .map((id) => document.querySelector<HTMLElement>(`#${id}`)?.textContent ?? '')
      .join(' ');
  }, path);

/** Wait until the real Sync and project-row surfaces say this fresh project is closable. */
const waitForCurrentProjectToSettle = async (path: string): Promise<void> => {
  /* The viewer header's revision action opens the Revisions panel whether or
   * not the restored workbench layout already carries its tab (a reopened
   * project restores its own layout; the panel title also gains a marker). The
   * action renders once the revision projection has arrived, which a reopened
   * project delivers well after its route settles. */
  const openRevisions = selectors.getByRole('button', {
    name: /^Open Revisions\./u,
  });
  await target.expectVisible(openRevisions, 120_000);
  await target.click(openRevisions);
  const openSync = selectors.getByText('Back up to Tau Cloud', { exact: true }).last();
  if (await target.isVisible(openSync)) {
    await target.click(openSync);
  }
  const noRemote = selectors.getByRole('radio', { name: 'No remote' });
  await target.expectVisible(noRemote, 60_000);
  await expect
    .poll(async () => target.getAttribute(noRemote, 'aria-checked'), {
      timeout: 60_000,
    })
    .toBe('true');
  await target.expectHidden(selectors.getByText('Checking…', { exact: true }), 120_000);
  /* A seeded project is `live, unsaved edits` until a revision records its
   * files (I24: a dirty checkout is never policy-closable), so save one the
   * way a person does — `Mod+S` is the checkout's own save cut. */
  if (/unsaved edits/u.test(await projectRowDescription(path))) {
    const saveShortcut = await target.evaluate(() => {
      const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform;
      return /mac/i.test(platform ?? navigator.userAgent) ? 'Meta+s' : 'Control+s';
    });
    await target.keyboardPress(saveShortcut);
  }
  await expect.poll(async () => projectRowDescription(path), { timeout: 120_000 }).toMatch(/, live\.$/u);
};

const rowHasBudgetReason = async (path: string): Promise<boolean> =>
  target.evaluate((href) => {
    const link = document.querySelector<HTMLAnchorElement>(`a[href="${href}"]`);
    return [...(link?.parentElement?.children ?? [])].some(
      (element) => element !== link && element.textContent.trim() === 'Closed · memory budget · reopen any time',
    );
  }, path);

const waitForGatewayRequestCount = async (count: number): Promise<void> => {
  try {
    await expect
      .poll(
        async () => {
          const requests = await target.readAgentHostGatewayRequests();
          return requests.length;
        },
        { timeout: 120_000 },
      )
      .toBe(count);
  } catch (error) {
    throw new Error(
      `Gateway request count did not reach ${String(count)}: ${JSON.stringify({
        events: await target.events(),
        liveness: await readLivenessSnapshot(),
        path: await currentPath(),
      })}`,
      { cause: error },
    );
  }
};

type LivenessSnapshot = Readonly<{
  projects: Readonly<Record<string, readonly string[]>>;
  chats: Readonly<
    Record<
      string,
      Readonly<{
        projectId?: string;
        status: string;
        phase?: string;
        machineState?: unknown;
        activeRunId?: string;
        pendingSettlement?: unknown;
      }>
    >
  >;
}>;

const readLivenessSnapshot = async (): Promise<LivenessSnapshot> =>
  target.evaluate(() => {
    const snapshot = (
      globalThis as typeof globalThis & {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- fixed debug bridge exposed by the UI.
        __TAU_CHAT_SESSION_LIVENESS__?: () => LivenessSnapshot;
      }
    ).__TAU_CHAT_SESSION_LIVENESS__;
    if (snapshot === undefined) {
      throw new Error('TAU_DEBUG chat-session liveness snapshot is unavailable.');
    }
    return snapshot();
  });

const closeRunningProject = async (path: string): Promise<void> => {
  await expandSidebar();
  const moreId = await target.evaluate((href) => {
    const trigger = document
      .querySelector<HTMLAnchorElement>(`a[href="${href}"]`)
      ?.closest<HTMLElement>('[data-slot="project-trigger"]');
    const more = [...(trigger?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find((button) =>
      button.ariaLabel?.startsWith('More actions for '),
    );
    return more?.id;
  }, path);
  expect(moreId).toBeTypeOf('string');
  await target.click(selectors.getByCss(`#${moreId!}`));
  const close = selectors.getByRole('menuitem', { name: /^Close /u });
  await target.expectVisible(close, 30_000);
  await target.click(close);
  try {
    await target.expectVisible(selectors.getByRole('heading', { name: /^Stop 1 agent and close /u }), 30_000);
  } catch (error) {
    throw new Error(
      `Running-project close confirmation did not open: ${JSON.stringify({
        liveness: await readLivenessSnapshot(),
        path,
        row: await projectRowDescription(path),
        visibleDialogs: await target.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>('[role="alertdialog"], [role="dialog"]')]
            .filter((element) => element.offsetParent !== null)
            .map((element) => element.textContent),
        ),
      })}`,
      { cause: error },
    );
  }
  await target.click(selectors.getByRole('button', { name: 'Stop and close' }));
};

const expectProjectBusy = async (path: string): Promise<void> => {
  await expect.poll(async () => projectRowDescription(path), { timeout: 120_000 }).toMatch(/, live, busy/u);
};

const expectProjectIdle = async (path: string): Promise<void> => {
  try {
    await expect.poll(async () => projectRowDescription(path), { timeout: 120_000 }).toMatch(/, live\.$/u);
  } catch (error) {
    throw new Error(`Project did not become idle: ${JSON.stringify(await readLivenessSnapshot())}`, {
      cause: error,
    });
  }
};

const expectProjectClosed = async (path: string): Promise<void> => {
  await expect.poll(async () => projectRowDescription(path), { timeout: 120_000 }).toMatch(/, closed\.$/u);
};

/** Start a real browser-host run against the already-installed gateway. */
const startAgent = async (projectMarker: string): Promise<void> => {
  if (!(await target.isVisible(selectors.getByCss(composer)))) {
    await target.click(selectors.getByCss('[aria-label="Toggle Chat lane"]'));
  }
  await target.expectVisible(selectors.getByCss(composer), 60_000);
  await target.type(composer, `Keep ${projectMarker} live while I inspect another project.`);
  await target.click(selectors.getByCss('button:has(svg.lucide-arrow-up)').last());
  await target.expectVisible(selectors.getByCss('button:has(svg.lucide-square)').last(), 60_000);
};

describe('liveness across navigation (S48(16), V21)', () => {
  test('keeps two running projects live, settles one, and releases the other on manual Close', async () => {
    await authenticateAgentSession();
    await target.setViewport({ width: 1440, height: 900 });
    const first = await seedProject();
    const second = await seedProject();
    expect(second).not.toBe(first);
    const firstPath = new URL(first).pathname;
    const secondPath = new URL(second).pathname;
    await waitForKernelCount(1);
    await openFromSidebar(firstPath);
    const kernels = await waitForKernelCount(2);

    await target.installAgentHostGatewayFixture(concurrentRunScript);
    await startAgent('project-one');
    await waitForGatewayRequestCount(1);
    await expectProjectBusy(firstPath);
    await openFromSidebar(secondPath);
    await startAgent('project-two');
    await waitForGatewayRequestCount(2);
    await expectProjectBusy(secondPath);
    await expectProjectBusy(firstPath);
    const running = await waitForKernelCount(2);
    expect(running.kernels).toEqual(kernels.kernels);

    await openFromSidebar(firstPath);
    const away = await waitForKernelCount(2);
    expect(away.kernels, 'navigation away replaced a live project kernel').toEqual(running.kernels);
    await expectProjectBusy(firstPath);
    await expectProjectBusy(secondPath);
    await openFromSidebar(secondPath);
    const returned = await waitForKernelCount(2);
    expect(returned.kernels, 'navigation back replaced a live project kernel').toEqual(running.kernels);

    const gatewayRequests = await target.readAgentHostGatewayRequests();
    expect(JSON.stringify(gatewayRequests[1]), 'the released gateway request must be project two').toContain(
      'project-two',
    );
    const beforeRelease = await readLivenessSnapshot();
    expect(Object.values(beforeRelease.projects).filter((runs) => runs.length > 0)).toHaveLength(2);
    expect(
      Object.values(beforeRelease.chats).filter(({ status, phase }) => status === 'streaming' && phase === 'running'),
    ).toHaveLength(2);

    await target.releaseAgentHostGatewayFixture();
    await target.expectHidden(selectors.getByCss('button:has(svg.lucide-square)').last(), 120_000);
    await expect
      .poll(
        async () => {
          const snapshot = await readLivenessSnapshot();
          return Object.values(snapshot.chats).filter(({ status }) => status === 'ready').length;
        },
        { timeout: 120_000 },
      )
      .toBeGreaterThan(0);
    const afterRelease = await readLivenessSnapshot();
    expect(afterRelease, 'authoritative liveness facts after releasing project two').toBeDefined();
    await expectProjectIdle(secondPath);
    await expectProjectBusy(firstPath);
    await closeRunningProject(firstPath);
    await expectProjectClosed(firstPath);
    let afterClose: WorkerSet;
    try {
      afterClose = await waitForKernelCount(1);
    } catch (error) {
      throw new Error(
        `Closed project retained a kernel: ${JSON.stringify({
          liveness: await readLivenessSnapshot(),
          workers: await classifyWorkers(),
        })}`,
        { cause: error },
      );
    }
    expect(running.kernels).toContainEqual(afterClose.kernels[0]);
    await expectProjectIdle(secondPath);
  }, 900_000);
});

type BudgetResult = Readonly<{
  baseline: WorkerSet;
  samples: readonly WorkerSet[];
  victimPath: string;
}>;

const openPastTheBudget = async (): Promise<BudgetResult> => {
  await target.setViewport({ width: 1440, height: 900 });
  const paths: string[] = [];
  for (let index = 0; index <= liveProjectBudget; index += 1) {
    const url = await seedProject();
    paths.push(new URL(url).pathname);
  }

  const victim = paths.at(-1) ?? '';
  await target.navigate(victim);
  await expect.poll(currentPath, { timeout: 120_000 }).toBe(victim);
  await expandSidebar();
  await waitForCurrentProjectToSettle(victim);

  const baseline = await waitForKernelCount(1);
  const samples: WorkerSet[] = [];
  for (const [index, path] of paths.slice(0, liveProjectBudget).entries()) {
    await openFromSidebar(path);
    samples.push(await waitForKernelCount(Math.min(index + 2, liveProjectBudget)));
    await waitForCurrentProjectToSettle(path);
  }
  return { baseline, samples, victimPath: victim };
};

describe('the budget closes a project, and the row says why (S48(16), S48(18), P47)', () => {
  test('never adds more project kernels than the live-project budget', async () => {
    const result = await openPastTheBudget();
    const counts = result.samples.map(({ kernels }) => kernels.length);
    const delta = Math.max(...counts) - result.baseline.kernels.length;
    expect(delta, `project-kernel delta after each open: ${counts.join(', ')}`).toBeLessThanOrEqual(
      liveProjectBudget - 1,
    );
    expect(result.samples.at(-1)?.kernels).toHaveLength(liveProjectBudget);
  }, 1_800_000);

  test('names the memory-budget reason on the project the policy closed', async () => {
    const { victimPath } = await openPastTheBudget();
    await expandSidebar();
    await expect.poll(async () => rowHasBudgetReason(victimPath), { timeout: 60_000 }).toBe(true);
  }, 1_800_000);
});
