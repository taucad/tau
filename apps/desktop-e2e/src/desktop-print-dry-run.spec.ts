/* oxlint-disable no-await-in-loop -- The physical checks are ticked one at a time, as a person does. */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import type { Locator, Page } from 'playwright';
import { launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import {
  gatewayFixtureFinalText,
  gatewayFixtureModelName,
  gatewayFixtureScadSource,
  gatewayToolResults,
  startGatewayFixture,
} from '#support/gateway-fixture.js';
import type { GatewayFixture, GatewayFixtureToolCall } from '#support/gateway-fixture.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import {
  expectCount,
  expectGeometryFramed,
  expectModelBuilt,
  expectSignedIn,
  expectVisible,
  selectChatModel,
  selectKernel,
  sendPrompt,
  submitPrompt,
} from '#support/scenario.js';

/**
 * Design-to-print dry run (blueprint V05/V09): "I want a pyramid, print it" in the
 * desktop app, against the simulated X1C only (`bambu-simulator`). Nothing here can
 * reach real hardware: the only machine bound is the one "Add simulated X1C" makes.
 *
 * The scripted turn writes the pyramid and calls `request_print`, which pauses the
 * run on an approval interrupt; the chat banner and the Print pane answer the same
 * ledger record, and accepting uploads and starts in one step (canvas ruling 1).
 */

const seedPrompt = 'Start a project for a print test.';
const printPrompt = 'I want a pyramid, print it';
const machineName = 'Simulated X1C';
const pyramidSource = `// Square pyramid: 40 mm base, 30 mm tall
base = 40;
height = 30;
rotate([0, 0, 45]) cylinder(h = height, r1 = base / sqrt(2), r2 = 0, $fn = 4);
`;
const seedTurn: readonly GatewayFixtureToolCall[] = [
  { name: 'create_file', input: { targetFile: 'main.scad', content: gatewayFixtureScadSource } },
];
const printTurn: readonly GatewayFixtureToolCall[] = [
  { name: 'create_file', input: { targetFile: 'main.scad', content: pyramidSource } },
  { name: 'request_print', input: { targetFile: 'main.scad' } },
];

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

/** The Print pane's card for one request; the chat banner above the composer is `Approval required`. */
const paneApprovalOf = (page: Page, fileName: string): Locator =>
  page.getByRole('region', { name: `Print request awaiting you: ${fileName}`, exact: true });

const chatApprovalOf = (page: Page): Locator => page.getByRole('region', { name: 'Approval required', exact: true });

const escapeRegExp = (text: string): string => text.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`);

const monitorText = async (page: Page): Promise<string> =>
  (await page.getByRole('region', { name: 'Monitor' }).textContent()) ?? '';

/** The newest ledger row in the pane's Activity disclosure, e.g. `Waiting for approval…`. */
const latestRequestRow = async (page: Page): Promise<string> => {
  const rows = page.getByRole('list', { name: 'Print requests' });
  if ((await rows.count()) === 0) {
    await page.getByRole('button', { name: /^Activity/u }).click();
  }
  return (await rows.getByRole('listitem').first().textContent()) ?? '';
};

/** Dockview's workbench tab strip names the Print pane by its label only. */
const showPrintPane = async (page: Page): Promise<void> => {
  await page.getByText('Print', { exact: true }).first().click();
};

const offeredTools = (current: GatewayFixture): readonly string[] =>
  ((current.gatewayRequests.at(-1) as { readonly tools?: ReadonlyArray<{ readonly name: string }> }).tools ?? []).map(
    (tool) => tool.name,
  );

/** What `request_print` finally told the model, once the person answered. */
const printToolResult = (current: GatewayFixture): Readonly<Record<string, unknown>> => {
  const results = gatewayToolResults(current.gatewayRequests.slice(-1)).filter(({ name }) => name === 'request_print');
  expect(results).toHaveLength(1);
  expect(results[0]!.isError).toBe(false);
  return JSON.parse(results[0]!.text) as Readonly<Record<string, unknown>>;
};

/**
 * Seed a project, bind the simulated X1C in Settings, and open the Print pane.
 *
 * @returns The live page and the project's absolute root.
 */
const openPrintProject = async (
  label: string,
  script: { current: readonly GatewayFixtureToolCall[] },
): Promise<{ readonly page: Page; readonly root: string }> => {
  const account = tauTestAccount(label);
  seededEmail = account.email;
  const token = await seedTauTestUser(account);
  fixture = await startGatewayFixture({ toolCalls: () => script.current });
  session = await launchDesktopApp({ token });
  const { page } = session;
  await fixture.routeThrough(page);
  await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
  await expectSignedIn(page);
  await selectKernel(page, 'OpenSCAD');
  await selectChatModel(page, gatewayFixtureModelName);
  const slug = await submitPrompt(page, seedPrompt);
  const marker = page.getByRole('status', { name: 'Turn revision status' }).last();
  await expect.poll(async () => (await marker.textContent()) ?? '', { timeout: 180_000 }).toMatch(/^Rev \d+ saved/u);

  await page.keyboard.press('Meta+Comma');
  const settings = page.getByRole('dialog').first();
  await settings.getByRole('button', { name: 'Compute', exact: true }).click();
  const add = settings.getByRole('button', { name: 'Add simulated X1C' });
  await expect.poll(async () => add.isEnabled(), { timeout: 60_000 }).toBe(true);
  await add.click();
  await expectVisible(settings.getByText('Simulated X1C is bound as simulated-x1c.', { exact: true }), 60_000);
  const bound = settings.getByRole('list', { name: 'Bound machines' }).getByRole('listitem');
  await expectCount(bound, 1);
  expect(await bound.textContent()).toMatch(/^Simulated X1C\s*Bambu Lab X1C · Simulated$/u);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Print', exact: true }).click();
  await expectVisible(page.getByRole('article', { name: new RegExp(`^${machineName}, `, 'u') }), 60_000);
  return { page, root: join(session.homeRoot, slug) };
};

/**
 * Send the print prompt and wait for the paused approval on both surfaces.
 *
 * @returns The sliced file the request names, e.g. `main.gcode.3mf`.
 */
const requestPyramidPrint = async (page: Page, root: string): Promise<string> => {
  const before = fixture!.gatewayRequests.length;
  await sendPrompt(page, printPrompt);
  await expect.poll(() => fixture!.gatewayRequests.length, { timeout: 120_000 }).toBeGreaterThan(before);
  /* H-1 witness: the turn must offer the tool it is about to call. */
  expect(offeredTools(fixture!)).toContain('request_print');

  await expect
    .poll(async () => readFile(join(root, 'main.scad'), 'utf8').catch(() => ''), { timeout: 60_000 })
    .toBe(pyramidSource);
  await expectGeometryFramed(page);

  const chatBanner = chatApprovalOf(page);
  const refusal = page.getByText(/^The request was refused before anything was sent/u);
  await expect
    .poll(async () => (await chatBanner.count()) + (await refusal.count()), { timeout: 180_000 })
    .toBeGreaterThan(0);
  /* H-6 witness: an agent-planned request must pass the machine's own submission schema. */
  expect(await refusal.allTextContents()).toEqual([]);
  const prompt = new RegExp(`Print (\\S+\\.gcode\\.3mf) on ${machineName}\\? \\d+ layers, about [^.]+\\.`, 'u');
  const bannerText = (await chatBanner.textContent()) ?? '';
  expect(bannerText).toMatch(
    new RegExp(
      `^Tau is waiting for approval${prompt.source}Approving lets Tau continue this turn; Tau does not ask again for each action it takes\\.ApproveDeny$`,
      'u',
    ),
  );
  const fileName = prompt.exec(bannerText)![1]!;
  /* The pane card answers the same interrupt, in the tool's own words. */
  const paneCard = paneApprovalOf(page, fileName);
  await expectVisible(paneCard, 60_000);
  expect(await paneCard.textContent()).toMatch(
    new RegExp(`^Tau is waiting for approval${prompt.source}Requested by Tau agent`, 'u'),
  );
  await expectVisible(paneCard.getByText('Answering here also answers the chat.', { exact: true }));
  expect(await paneCard.getByRole('button', { name: 'Deny' }).isEnabled()).toBe(true);
  expect(await paneCard.getByRole('button', { name: 'Accept' }).isEnabled()).toBe(true);
  /* Nothing physical yet: the ledger row waits and the machine is idle. */
  expect(await latestRequestRow(page)).toMatch(
    new RegExp(`^Waiting for approval${escapeRegExp(fileName)}by Tau agent`, 'u'),
  );
  expect(await monitorText(page)).toContain('Idle');
  return fileName;
};

test('prints the chat pyramid on the simulated X1C only after Accept', async () => {
  const script = { current: seedTurn };
  const { page, root } = await openPrintProject('print-dry-run', script);
  script.current = printTurn;
  try {
    const fileName = await requestPyramidPrint(page, root);

    /* Preview the exact requested bytes in the printer viewer before accepting them. */
    const paneCard = paneApprovalOf(page, fileName);
    await paneCard.getByRole('button', { name: 'Open printer preview' }).click();
    await expectVisible(page.getByRole('region', { name: `Printer simulation: ${fileName}`, exact: true }), 120_000);
    await showPrintPane(page);

    await paneCard.getByRole('button', { name: 'Accept' }).click();
    const confirm = paneCard.getByRole('group', { name: 'Confirm before starting' });
    const start = confirm.getByRole('button', { name: `Start print on ${machineName}` });
    expect(await start.isEnabled()).toBe(false);
    for (const checkbox of await confirm.getByRole('checkbox').all()) {
      await checkbox.click();
    }
    await start.click();

    /* The simulator heats first (bed 25 → 55 °C at 0.5 °C/s at demo speed 1), then prints on the wall clock. */
    await expect
      .poll(async () => monitorText(page), { timeout: 180_000 })
      .toMatch(/Printing layer \d+ of \d+ · \d+ min left/u);
    await expect
      .poll(async () => latestRequestRow(page), { timeout: 60_000 })
      .toMatch(new RegExp(`^Printing${escapeRegExp(fileName)}by Tau agent`, 'u'));
    const progress = page
      .getByRole('region', { name: 'Monitor' })
      .getByRole('progressbar', { name: `${machineName} print progress` });
    const firstProgress = Number(await progress.getAttribute('aria-valuenow'));
    await expect
      .poll(async () => Number(await progress.getAttribute('aria-valuenow')), { timeout: 60_000 })
      .toBeGreaterThan(firstProgress);
    expect(await page.getByRole('button', { name: 'Urgent stop' }).isEnabled()).toBe(true);
    /* The seed turn closed with the same line; the print turn's is the second. */
    await expectCount(page.getByText(gatewayFixtureFinalText, { exact: true }), 2, 300_000);
    expect(printToolResult(fixture!)).toMatchObject({
      approval: 'approved',
      machineName,
      request: { state: 'started', resolvedBy: { kind: 'user', label: 'Accepted in chat' } },
    });
    await expectModelBuilt({
      finalText: gatewayFixtureFinalText,
      logPath: session!.logPath,
      page,
      sourcePath: join(root, 'main.scad'),
    });
  } catch (error) {
    await session!.capture('print-dry-run-accept');
    throw error;
  }
});

test('denies the chat pyramid print without uploading anything', async () => {
  const script = { current: seedTurn };
  const { page, root } = await openPrintProject('print-dry-run-deny', script);
  script.current = printTurn;
  try {
    const fileName = await requestPyramidPrint(page, root);
    await paneApprovalOf(page, fileName).getByRole('button', { name: 'Deny' }).click();
    await expect
      .poll(async () => latestRequestRow(page), { timeout: 60_000 })
      .toMatch(new RegExp(`^Denied${escapeRegExp(fileName)}by Tau agent`, 'u'));
    expect(await monitorText(page)).toContain('Idle');
    await expectCount(page.getByText(gatewayFixtureFinalText, { exact: true }), 2, 300_000);
    await expectCount(chatApprovalOf(page), 0);
    await expectCount(paneApprovalOf(page, fileName), 0);
    const result = printToolResult(fixture!);
    expect(result).toMatchObject({
      approval: 'denied',
      machineName,
      request: { state: 'denied', resolvedBy: { kind: 'user', label: 'Declined in chat' } },
    });
    /* Zero uploads: a denied request never took a transfer, an operation id or a receipt. */
    const request = result['request'] as Readonly<Record<string, unknown>>;
    expect(['uploadOperationId', 'startOperationId', 'transferId', 'receipt'].filter((key) => key in request)).toEqual(
      [],
    );
  } catch (error) {
    await session!.capture('print-dry-run-deny');
    throw error;
  }
});

test('slices, previews and starts a person-initiated print on the simulated X1C', async () => {
  const script = { current: seedTurn };
  const { page } = await openPrintProject('print-dry-run-pane', script);
  try {
    const prepare = page.getByRole('region', { name: 'Prepare' });
    await prepare.getByRole('button', { name: 'Slice and preview' }).click();
    const result = prepare.getByLabel('Slice result');
    await expectVisible(result, 120_000);
    const part =
      /^Filemain\.gcode\.3mfLayers\d+Time.+Filament.+Part([\d.]+) × ([\d.]+) × ([\d.]+) mmToolpath[\d .×]+ mm · every nozzle moveThe toolpath fits the plate/u.exec(
        (await result.textContent()) ?? '',
      );
    /* The seed model is a 20 mm cube: the Part row is the part, not the purge line and lifts around it. */
    expect(part?.slice(1).map(Number)).toEqual([expect.closeTo(20, 0), expect.closeTo(20, 0), expect.closeTo(20, 0)]);
    await prepare.getByRole('button', { name: 'Open printer preview' }).click();
    const viewer = page.getByRole('region', { name: 'Printer simulation: main.gcode.3mf' });
    await expectVisible(viewer, 120_000);
    await viewer.getByRole('radiogroup', { name: 'Speed' }).getByRole('radio', { name: '100×' }).click();
    await showPrintPane(page);

    await prepare.getByRole('button', { name: `Send to ${machineName}` }).click();
    const confirm = page.getByRole('group', { name: 'Confirm before starting' });
    expect(await confirm.textContent()).toMatch(/^Artifact sha256:[\da-f]{64}Physical checks/u);
    expect(await monitorText(page)).toContain('Idle');
    for (const checkbox of await confirm.getByRole('checkbox').all()) {
      await checkbox.click();
    }
    await confirm.getByRole('button', { name: `Start print on ${machineName}` }).click();

    await expect
      .poll(async () => monitorText(page), { timeout: 180_000 })
      .toMatch(/Printing layer \d+ of \d+ · \d+ min left/u);
    await expect
      .poll(async () => latestRequestRow(page), { timeout: 60_000 })
      .toMatch(/^Printingmain\.gcode\.3mfby You/u);
    const urgentStop = page.getByRole('button', { name: 'Urgent stop' });
    expect(await urgentStop.isEnabled()).toBe(true);
    await urgentStop.click();
    await page
      .getByRole('alertdialog', { name: 'Confirm urgent stop' })
      .getByRole('button', { name: 'Confirm urgent stop' })
      .click();
    await expect.poll(async () => monitorText(page), { timeout: 60_000 }).toMatch(/Idle/u);
    /* The request ended at "started"; Activity reads the run it started, now stopped. */
    await expect
      .poll(async () => latestRequestRow(page), { timeout: 60_000 })
      .toMatch(/^Stoppedmain\.gcode\.3mfby You/u);
  } catch (error) {
    await session!.capture('print-dry-run-pane');
    throw error;
  }
});
