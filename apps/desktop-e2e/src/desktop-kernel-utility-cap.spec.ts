import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, expect, test } from 'vitest';
import type { Page } from 'playwright';

import { launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import {
  failedGatewayToolResults,
  gatewayFixtureModelName,
  gatewayFixtureScadSource,
  startGatewayFixture,
} from '#support/gateway-fixture.js';
import type { GatewayFixture } from '#support/gateway-fixture.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import {
  activeChatId,
  expectGeometryFramed,
  expectRenderCycleSince,
  expectSignedIn,
  expectVisible,
  parkPointer,
  renderCycleCount,
  selectChatModel,
  selectKernel,
  submitPrompt,
  waitForProjectOnDisk,
} from '#support/scenario.js';

/**
 * The kernel-utility cap gate (R5 of
 * `docs/research/electron-kernel-utility-cap-blueprint.md`).
 *
 * The reported failure was an agent turn in the *ninth* live project answering
 * every kernel tool with `Main refused the desktop runtime-port request.`: the
 * broker refused the fork at a count of eight the UI's session registry — which
 * is unbounded on desktop (A35) — never knew about. Nothing in the product said
 * so; the reason existed only in main's own log.
 *
 * So this row is written against that log as much as against the DOM. It opens
 * nine projects in one window, runs a scripted turn in the ninth whose
 * `get_kernel_result` makes the *agent's* services host ask main for a runtime
 * port of its own, and then reads the shell's ledger: no `refusing to exceed`,
 * no `services.runtime-port-failed`, and — after the app has quit — one
 * released `kernel.exit` for every `kernel.fork`. A warm spare is forked
 * without a `hostId` and is therefore in neither half of that ledger.
 *
 * The turn runs through the deterministic provider stub rather than the fake
 * ACP adapter on purpose. `desktop-mcp-fixture.spec.ts`'s agent can only call
 * `test_model`, and `test_model` over a project with no `*.geospec.ts` never
 * reaches a runner at all (`libs/agent-tools/src/geospec/run-tests.ts:79-86`),
 * so it would prove the MCP path and not the utility fork this gate is about.
 * The gateway script names `get_kernel_result` — the blueprint's own acceptance
 * tool — the way `desktop-chat-in-project.spec.ts` does.
 *
 * The last third covers R3 (park hidden idle kernels): leaving the ninth
 * project for the route list releases its utility within the park window while
 * its sidebar row stays live, and returning to it re-forks and re-renders.
 */

/** Nine: one more than the cap this blueprint deleted. */
const liveProjects = 9;
/**
 * The park window `project-session.machine.ts` gives a hidden idle project
 * (`projectSessionParkWindowMilliseconds`, 2 min), plus room for the exit to be
 * observed. There is no test override for it, so this row waits it out.
 */
const parkTimeout = 210_000;
const prompt = 'Create a cube with a centered cylindrical cutout and verify it.';

/** The project slug the route carries. */
const routedSlug = (page: Page): string => {
  const { pathname } = new URL(page.url());
  return pathname.slice(pathname.lastIndexOf('/') + 1);
};

/** Run one command-palette item by its label. */
const runCommand = async (page: Page, label: string): Promise<void> => {
  await parkPointer(page);
  await page
    .getByRole('button', { name: /Search/u })
    .first()
    .click();
  await page.getByPlaceholder('Search projects, chats, and actions...').fill(label);
  await page.getByText(label, { exact: true }).first().click();
};

/**
 * Create one project through `/projects/new` and route into it.
 *
 * The cheap arm on purpose: every live project holds a kernel utility from the
 * moment its subtree mounts, whether or not a chat ever runs in it, which is
 * the whole of Finding 3. Only the ninth project needs a turn.
 *
 * @param page - The renderer.
 * @param name - The project name; its slug is the same string.
 * @returns The routed slug.
 */
const createProjectFromCode = async (page: Page, name: string): Promise<string> => {
  await runCommand(page, 'New project (from code)');
  const projectName = page.locator('#project-name');
  await expectVisible(projectName, 60_000);
  await projectName.fill(name);
  const create = page.getByRole('button', { name: /^Create Project/u }).first();
  await expect.poll(async () => create.isEnabled(), { timeout: 60_000 }).toBe(true);
  await create.click();
  await page.waitForURL(new RegExp(String.raw`/w/[^/]+/${name}(?:[?#]|$)`, 'u'), { timeout: 120_000 });
  return routedSlug(page);
};

/** One `kernel.exit` record, as `kernelUtilityDiagnostics` writes it. */
type KernelExit = { readonly hostId: string; readonly code: number; readonly released: boolean };

/** The shell log's kernel-utility ledger: forks, exits and every refusal. */
type KernelLedger = {
  readonly forks: readonly string[];
  readonly exits: readonly KernelExit[];
  readonly refusals: readonly string[];
};

/**
 * Parse the utility ledger out of `desktop.log`, and its rotated predecessor.
 *
 * Each record is `<iso> <LEVEL> <event> <json>` (`apps/desktop/src/main/diagnostics.ts:153`),
 * and only an *adopted* utility carries a `hostId`, so the fork and exit sets
 * are comparable as they stand. `desktop.1.log` is read first because this row
 * is chatty — nine mounted projects forward nine renderers' console output —
 * and a rotation mid-run would otherwise strand forks without their exits.
 *
 * @param logPath - `<userData>/logs/desktop.log`.
 * @returns Fork host ids, exit records and refusal lines.
 */
const kernelLedger = (logPath: string): KernelLedger => {
  const read = (path: string): string => (existsSync(path) ? readFileSync(path, 'utf8') : '');
  const lines = `${read(logPath.replace(/desktop\.log$/u, 'desktop.1.log'))}${read(logPath)}`.split('\n');
  const detail = (line: string): unknown => JSON.parse(line.slice(line.indexOf('{')));
  return {
    forks: lines
      .filter((line) => line.includes(' kernel.fork {'))
      .map((line) => (detail(line) as { readonly hostId: string }).hostId),
    exits: lines.filter((line) => line.includes(' kernel.exit {')).map((line) => detail(line) as KernelExit),
    refusals: lines.filter((line) => line.includes('refusing to exceed') || line.includes('runtime-port-failed')),
  };
};

/** Live kernel utilities right now, counted by Electron itself. */
const kernelUtilityCount = async (desktopSession: DesktopSession): Promise<number> =>
  desktopSession.application.evaluate(
    ({ app }) =>
      app.getAppMetrics().filter((metric) => metric.type === 'Utility' && metric.name === 'tau-kernel-host').length,
  );

let session: DesktopSession | undefined;
let fixture: GatewayFixture | undefined;
let seededEmail: string | undefined;

afterEach(async () => {
  await session?.close();
  session = undefined;
  await fixture?.close();
  fixture = undefined;
  if (seededEmail) {
    await deleteTauTestUser(seededEmail);
    seededEmail = undefined;
  }
});

test('serves the ninth live project a kernel tool, and parks a hidden one', async () => {
  const account = tauTestAccount('kernel-cap');
  seededEmail = account.email;
  const token = await seedTauTestUser(account);
  fixture = await startGatewayFixture({
    toolCalls: [
      { name: 'create_file', input: { targetFile: 'main.scad', content: gatewayFixtureScadSource } },
      /* The one scripted call that makes the services utility ask main for a
       * runtime port of its own — the request the cap refused. */
      { name: 'get_kernel_result', input: { targetFile: 'main.scad' } },
    ],
  });
  session = await launchDesktopApp({ token });
  const { page } = session;
  await fixture.routeThrough(page);

  try {
    await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
    await expectSignedIn(page);
    await selectKernel(page, 'OpenSCAD');
    /* Before the ninth project's submit: the home composer's first turn
     * dispatches itself as soon as its chat loads. */
    await selectChatModel(page, gatewayFixtureModelName);

    /* 1. Eight projects, back to back. Deliberately without waiting for each
     * one to render: the park window (2 min) starts the moment a project is
     * hidden, so a slow open phase would reclaim the first utilities before
     * the ninth exists and the concurrency below could never be observed. */
    const openedAt = Date.now();
    for (let index = 1; index < liveProjects; index += 1) {
      // oxlint-disable-next-line no-await-in-loop -- one window, one route at a time.
      await createProjectFromCode(page, `cap-${String(index)}`);
    }
    console.info(`[desktop-e2e] opened ${String(liveProjects - 1)} projects in ${String(Date.now() - openedAt)} ms`);

    /* 2. The ninth, from the home composer, so it arrives with a turn. */
    await runCommand(page, 'New project (from chat)');
    /* Again on the way back: the preference is persisted, and a composer that
     * offers a different row would send this turn somewhere the stub is not. */
    await selectChatModel(page, gatewayFixtureModelName);
    const slug = await submitPrompt(page, prompt);
    const projectRoot = join(session.homeRoot, slug);

    /* 3. The registry admits all nine (A35), and the broker holds a utility
     * for each: under the deleted cap of eight, this is the fork that was
     * refused. Polled rather than sampled — the ninth project's own kernel and
     * the agent's are forked asynchronously, and a hidden project's utility is
     * parked again once its window elapses. */
    await expectVisible(page.getByText(`${String(liveProjects)} live`, { exact: true }), 120_000);
    let peakUtilities = 0;
    await expect
      .poll(
        async () => {
          peakUtilities = Math.max(peakUtilities, await kernelUtilityCount(session!));
          return peakUtilities;
        },
        {
          message:
            'nine live projects never held nine kernel utilities at once: either main refused a fork, or the open phase took longer than the park window and the first utilities were reclaimed',
          timeout: 120_000,
        },
      )
      .toBeGreaterThanOrEqual(liveProjects);
    console.info(`[desktop-e2e] peak kernel utilities: ${String(peakUtilities)}`);
    /* Asserted here and not only after the turn: nine renderer kernels are
     * already one more than the deleted default, so R2 is answered before a
     * funded turn is asked for. */
    expect(kernelLedger(session.logPath).refusals).toEqual([]);

    /* 4. The turn itself: `create_file`, `get_kernel_result`, then the round
     * that finds no third call and closes the turn. */
    await expect.poll(() => fixture!.gatewayRequests.length, { timeout: 180_000 }).toBeGreaterThanOrEqual(3);
    const sourcePath = await waitForProjectOnDisk(session.homeRoot, slug, { extension: '.scad', page });
    expect(readFileSync(sourcePath, 'utf8').length).toBeGreaterThan(0);
    await expect.poll(() => new URL(page.url()).searchParams.get('chat'), { timeout: 120_000 }).toBeTruthy();
    expect(existsSync(join(projectRoot, '.tau/chats', activeChatId(page)))).toBe(true);
    await expectGeometryFramed(page);

    /* A refused runtime port answers the agent with an *error result*, not a
     * failed run: every other assertion in this row would still pass. */
    const failedTools = failedGatewayToolResults(fixture.gatewayRequests.slice(-1));
    expect(failedTools, `the ninth project's agent tools failed:\n${failedTools.join('\n')}`).toEqual([]);
    expect(kernelLedger(session.logPath).refusals).toEqual([]);

    /* 5. The ledger balances once the app is gone: every utility main forked
     * for a host was released, none of them by an operating system killing
     * processes, and nothing was ever refused. */
    await session.application.evaluate(({ app }) => {
      app.quit();
    });
    let ledger = kernelLedger(session.logPath);
    await expect
      .poll(
        () => {
          ledger = kernelLedger(session!.logPath);
          return ledger.forks.filter(
            (hostId) => !ledger.exits.some((exit) => exit.hostId === hostId && (exit.released || exit.code === 0)),
          );
        },
        { timeout: 180_000 },
      )
      .toEqual([]);
    expect(ledger.refusals).toEqual([]);
    console.info(
      `[desktop-e2e] kernel utility ledger: ${String(ledger.forks.length)} forks, ${String(ledger.exits.length)} exits`,
    );
  } catch (error) {
    await session.capture('kernel-utility-cap-failure');
    throw error;
  }
}, 900_000);

/**
 * R3 on its own, because it owes the provider nothing.
 *
 * Parking is a property of a *live* project, not of a project that ran a turn,
 * so this row opens one from `/projects/new`, seeds real geometry on disk, and
 * never funds a model call — which is also what keeps it honest when the
 * deterministic tier's billing policy is the thing that is broken.
 *
 * **One** project, deliberately. `kernel.fork` and `kernel.exit` carry a host id
 * and the utility entry and nothing that names a project, so with two live
 * projects "an exit appeared" cannot be attributed: the first attempt at this
 * row parked two and returned to the one that had *not* parked, which reads as
 * a missing re-fork. With a single live project every event in the window is
 * that project's.
 */
test('parks a hidden idle project and re-forks its kernel on return', async () => {
  const account = tauTestAccount('kernel-park');
  seededEmail = account.email;
  session = await launchDesktopApp({ token: await seedTauTestUser(account) });
  const { page } = session;

  try {
    await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
    await expectSignedIn(page);
    await selectKernel(page, 'OpenSCAD');
    const parked = await createProjectFromCode(page, 'park-1');

    /* Real geometry, written the way `externalEdit` does: a project scaffolded
     * from `/projects/new` holds an empty source, and an empty source gives the
     * return below nothing to frame. The shell watches the project root, so
     * this crosses the same watcher a person's editor would. */
    writeFileSync(join(session.homeRoot, parked, 'main.scad'), gatewayFixtureScadSource, 'utf8');
    await expectGeometryFramed(page);

    /* Hidden, and nothing else focused: the route list resumes no project, so
     * the only utility event the window can produce is the park. */
    const beforePark = kernelLedger(session.logPath);
    const rendersBeforePark = await renderCycleCount(page);
    await runCommand(page, 'All projects');
    await expect
      .poll(() => kernelLedger(session!.logPath).exits.length, {
        message: 'a hidden idle project never released its kernel utility within the park window',
        timeout: parkTimeout,
      })
      .toBeGreaterThan(beforePark.exits.length);
    const parkExits = kernelLedger(session.logPath).exits.slice(beforePark.exits.length);
    expect(
      parkExits.every((exit) => exit.released),
      `a parked utility died unreleased: ${JSON.stringify(parkExits)}`,
    ).toBe(true);
    console.info(
      `[desktop-e2e] park released ${String(parkExits.length)} kernel utilities; ${String(await kernelUtilityCount(session))} live`,
    );

    /* The session outlives its process: the registry still calls the project
     * live, which is the whole point of parking rather than closing. */
    const projectRow = page.locator(`[data-slot="project-trigger"]:has(a[href*="/${parked}"])`).first();
    await expect
      .poll(async () => (await projectRow.locator('[id^="project-status-"]').first().textContent()) ?? '', {
        timeout: 30_000,
      })
      .toMatch(/^Live/u);

    /* Return: a new fork, a further render cycle, and geometry on screen. */
    const forksBeforeReturn = kernelLedger(session.logPath).forks.length;
    await projectRow.getByRole('link').first().click();
    await page.waitForURL(new RegExp(String.raw`/w/[^/]+/${parked}(?:[?#]|$)`, 'u'), { timeout: 120_000 });
    await expect
      .poll(() => kernelLedger(session!.logPath).forks.length, {
        message: 'returning to the parked project forked no kernel utility',
        timeout: 120_000,
      })
      .toBeGreaterThan(forksBeforeReturn);
    await expectRenderCycleSince(page, rendersBeforePark);
    await expectGeometryFramed(page);
    expect(kernelLedger(session.logPath).refusals).toEqual([]);
  } catch (error) {
    await session.capture('kernel-utility-park-failure');
    throw error;
  }
}, 900_000);
