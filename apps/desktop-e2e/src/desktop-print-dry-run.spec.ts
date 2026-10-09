/* oxlint-disable no-await-in-loop -- The physical checks are ticked one at a time, as a person does. */
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import type { Locator, Page } from 'playwright';
import { launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { durableMessages, latestCompletedRun } from '#support/acp-evidence.js';
import {
  gatewayFixtureFinalText,
  gatewayFixtureModelName,
  gatewayFixtureScadSource,
  startGatewayFixture,
} from '#support/gateway-fixture.js';
import type { GatewayFixture, GatewayFixtureToolCall } from '#support/gateway-fixture.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import {
  activeChatId,
  ensureFilesPane,
  expectCount,
  expectGeometryFramed,
  expectNativeKernelEngine,
  expectSignedIn,
  expectVisible,
  fileTreeItemOf,
  selectChatModel,
  selectKernel,
  sendPrompt,
  submitPrompt,
  waitForRunToSettle,
} from '#support/scenario.js';

/**
 * Design-to-print dry run (blueprint V05/V09): "I want a pyramid, print it" in the
 * desktop app, against the simulated X1C only (`bambu-simulator`). Nothing here can
 * reach real hardware: the only machine bound is the one "Add simulated X1C" makes.
 *
 * The scripted turn writes the pyramid and calls `request_job`, which pauses the
 * run on its native approval interrupt (D5); the chat banner and the Print pane answer
 * the same ledger record, and accepting in the pane uploads and starts in one step
 * (canvas ruling 1). The X1C's plate attestation is the pane's alone: a chat Approve
 * continues the run but leaves the job waiting for the pane. The host hands the answer
 * to the machine ledger: an approval continues the run and tells the continued attempt
 * the answer; a denial ends the run cancelled, with no closing line.
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
  { name: 'request_job', input: { targetFile: 'main.scad' } },
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

/** The Print pane's card for one job; the chat banner above the composer is `Approval required`. */
const paneApprovalOf = (page: Page, fileName: string): Locator =>
  page.getByRole('region', { name: `Job awaiting you: ${fileName}`, exact: true });

const chatApprovalOf = (page: Page): Locator => page.getByRole('region', { name: 'Approval required', exact: true });

const escapeRegExp = (text: string): string => text.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`);

/** The header's Machine select: the machine's name and its status, `Ready` while idle. */
const machineStatus = async (page: Page): Promise<string> =>
  (await page.getByRole('combobox', { name: 'Machine' }).textContent()) ?? '';

/** The run block above the stages: `<program> · Running · layer 3 of 125 · 12 min left`. */
const runText = async (page: Page): Promise<string> =>
  (await page
    .getByRole('region', { name: 'Run' })
    .textContent()
    .catch(() => '')) ?? '';

/** The newest job row in the pane's History stage, e.g. `Waiting for approval…`. */
const latestRequestRow = async (page: Page): Promise<string> => {
  const rows = page.getByRole('list', { name: 'Jobs' });
  if ((await rows.count()) === 0) {
    await page.getByRole('button', { name: /^History/u }).click();
  }
  return (await rows.getByRole('listitem').first().textContent()) ?? '';
};

/** Dockview names each pane's `tab` by its full title: the Print pane's is `Print`, a G-code preview's its file path. */
const showPrintPane = async (page: Page): Promise<void> => {
  await page.getByRole('tab', { name: 'Print', exact: true }).click();
};

/** Stop stands beside the machine's name only while something could be stopped: an idle machine shows none. */
const stopButtonOf = (page: Page): Locator => page.getByRole('button', { name: 'Stop', exact: true });

/** Prepare's primary action bar, below the stages: Preview and Review print once a slice is ready. */
const printActionBarOf = (page: Page): Locator => page.locator('[data-slot="print-action-bar"]');

const offeredTools = (current: GatewayFixture): readonly string[] =>
  ((current.gatewayRequests.at(-1) as { readonly tools?: ReadonlyArray<{ readonly name: string }> }).tools ?? []).map(
    (tool) => tool.name,
  );

/**
 * The machine ledger's jobs for the simulated X1C, read from the files the desktop writes
 * (`<userData>/config/machines/<machineId>/jobs/<jobId>.json`, one whole job each).
 */
const ledgerJobs = async (current: DesktopSession): Promise<ReadonlyArray<Readonly<Record<string, unknown>>>> => {
  const directory = join(dirname(current.homeRoot), 'config', 'machines', 'simulated-x1c', 'jobs');
  const entries = await readdir(directory);
  const names = entries.filter((name) => name.endsWith('.json') && !name.startsWith('.'));
  const records = await Promise.all(names.map(async (name) => readFile(join(directory, name), 'utf8')));
  return records.map((text) => JSON.parse(text) as Readonly<Record<string, unknown>>);
};

/** Every text a gateway request's messages carry, tool results excluded: where the approval-answer reminder rides. */
const requestTexts = (request: unknown): string =>
  ((request as { readonly messages?: ReadonlyArray<{ readonly content?: unknown }> }).messages ?? [])
    .flatMap(({ content }) =>
      typeof content === 'string'
        ? [content]
        : Array.isArray(content)
          ? (content as ReadonlyArray<Record<string, unknown>>).flatMap((block) =>
              block['type'] === 'text' && typeof block['text'] === 'string' ? [block['text']] : [],
            )
          : [],
    )
    .join('\n');

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
  await settings.getByRole('button', { name: 'Machines', exact: true }).click();
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
  expect(offeredTools(fixture!)).toContain('request_job');

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
  /* The X1C's attestation is the pane's alone, so the prompt itself sends the person there. */
  const prompt = new RegExp(
    `Print (\\S+\\.gcode\\.3mf) on ${machineName}\\? \\d+ layers, about [^.]+\\. Accept it in the Print pane, confirming: The build plate is clear\\.`,
    'u',
  );
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
  expect(await paneCard.textContent()).toMatch(new RegExp(`Requested by Tau agent.*${prompt.source}`, 'u'));
  await expectVisible(paneCard.getByText('Answering here also answers the chat.', { exact: true }));
  expect(await paneCard.getByRole('button', { name: 'Deny' }).isEnabled()).toBe(true);
  /* The X1C asks the person to confirm the plate is clear: Start waits for that, in the pane only. */
  expect(await paneCard.getByRole('button', { name: 'Start print' }).isEnabled()).toBe(false);
  /* Nothing physical yet: the ledger row waits and the machine is idle. */
  expect(await latestRequestRow(page)).toMatch(
    new RegExp(`^Waiting for approval${escapeRegExp(fileName)}by Tau agent`, 'u'),
  );
  expect(await machineStatus(page)).toContain('Ready');
  await expectCount(stopButtonOf(page), 0);
  return fileName;
};

test('prints the chat pyramid on the simulated X1C only after Start in the pane', async () => {
  const script = { current: seedTurn };
  const { page, root } = await openPrintProject('print-dry-run', script);
  script.current = printTurn;
  try {
    const fileName = await requestPyramidPrint(page, root);
    const paused = fixture!.gatewayRequests.length;

    /* Preview the exact requested bytes in the printer viewer before accepting them. */
    const paneCard = paneApprovalOf(page, fileName);
    await paneCard.getByRole('button', { name: 'Preview', exact: true }).click();
    await expectVisible(page.getByRole('region', { name: `Printer simulation: ${fileName}`, exact: true }), 120_000);
    await showPrintPane(page);

    /* The resumed attempt only needs to close; replaying the turn would repeat its tool calls. */
    script.current = [];
    const start = paneCard.getByRole('button', { name: 'Start print' });
    expect(await start.isEnabled()).toBe(false);
    await paneCard.getByRole('checkbox', { name: 'The build plate is clear' }).click();
    await start.click();

    /* The simulator heats first (bed 25 → 55 °C at 0.5 °C/s at demo speed 1), then prints on the wall clock. */
    await expect.poll(async () => runText(page), { timeout: 180_000 }).toMatch(/· layer \d+ of \d+ · \d+ min left/u);
    await expect
      .poll(async () => latestRequestRow(page), { timeout: 60_000 })
      .toMatch(new RegExp(`^(?:Started|Running)${escapeRegExp(fileName)}by Tau agent`, 'u'));
    const progress = page
      .getByRole('region', { name: 'Run' })
      .getByRole('progressbar', { name: `${machineName} run progress` });
    const firstProgress = Number(await progress.getAttribute('aria-valuenow'));
    await expect
      .poll(async () => Number(await progress.getAttribute('aria-valuenow')), { timeout: 60_000 })
      .toBeGreaterThan(firstProgress);
    expect(await stopButtonOf(page).isEnabled()).toBe(true);
    /* The older seed turn can be virtualized out of the DOM; both replies live in the host log. */
    await expectVisible(page.getByText(gatewayFixtureFinalText, { exact: true }).last(), 300_000);
    const eventsPath = join(root, '.tau/chats', activeChatId(page), 'events.jsonl');
    await expect
      .poll(
        async () =>
          durableMessages(await readFile(eventsPath, 'utf8')).filter(
            (message) =>
              message.role === 'assistant' && JSON.stringify(message.content).includes(gatewayFixtureFinalText),
          ).length,
      )
      .toBe(2);
    await expect
      .poll(
        async () => {
          try {
            return latestCompletedRun(await readFile(eventsPath, 'utf8'));
          } catch {
            return undefined;
          }
        },
        { timeout: 120_000 },
      )
      .toBeDefined();
    const events = await readFile(eventsPath, 'utf8');
    const printRunId = latestCompletedRun(events);
    const closingReplies = durableMessages(events).filter(
      (message) => message.role === 'assistant' && JSON.stringify(message.content).includes(gatewayFixtureFinalText),
    );
    expect(new Set(closingReplies.map((message) => message.runId)).size).toBe(2);
    expect(closingReplies.at(-1)?.runId).toBe(printRunId);
    expect(
      events.split('\n').some((line) => {
        if (line.trim() === '') {
          return false;
        }
        const event = JSON.parse(line) as { type?: string; runId?: string; revisionId?: string };
        return event.type === 'turn.finalized' && event.runId === printRunId && Boolean(event.revisionId);
      }),
    ).toBe(true);
    await expectCount(chatApprovalOf(page), 0);
    /* The person started it in the pane, with the plate attestation; the chat run then found it resolved. */
    const [accepted, ...others] = await ledgerJobs(session!);
    expect(others).toEqual([]);
    expect(accepted).toMatchObject({
      resolvedBy: { kind: 'user', label: 'You' },
      attestations: [expect.objectContaining({ id: 'work-area-clear' })],
    });
    /* The continued attempt was told the answer, not only that its call was aborted. */
    const continued = fixture!.gatewayRequests.slice(paused).map((request) => requestTexts(request));
    expect(continued).toContainEqual(
      expect.stringContaining("The run paused for the person's approval, and they answered:"),
    );
    expect(continued).toContainEqual(expect.stringContaining(`- approved: "Print ${fileName} on ${machineName}?`));
    /* Revision cards can be unmounted; verify the live geometry and native file instead. */
    await expectCount(page.getByText(/ROOT_UNAVAILABLE/u), 0);
    await expectCount(page.getByText('File not found', { exact: true }), 0);
    await expectCount(page.getByRole('status', { name: 'Waiting for geometry' }), 0, 120_000);
    await expectVisible(page.getByTestId('cad-viewer-canvas-region').locator('canvas'), 60_000);
    await expectNativeKernelEngine(session!.logPath);
    await expectGeometryFramed(page);
    await ensureFilesPane(page);
    await expectVisible(fileTreeItemOf(page, 'main.scad'), 60_000);
  } catch (error) {
    await session!.capture('print-dry-run-accept');
    throw error;
  }
});

/* The pane card and the chat banner answer the same interrupt; either one's Deny reaches the ledger. */
test.each([
  ['the Print pane', 'pane'],
  ['the chat banner', 'chat'],
] as const)('denies the chat pyramid print from %s without uploading anything', async (_surface, surface) => {
  const script = { current: seedTurn };
  const { page, root } = await openPrintProject(`print-dry-run-deny-${surface}`, script);
  script.current = printTurn;
  try {
    const fileName = await requestPyramidPrint(page, root);
    const paused = fixture!.gatewayRequests.length;
    const answering = surface === 'pane' ? paneApprovalOf(page, fileName) : chatApprovalOf(page);
    await answering.getByRole('button', { name: 'Deny' }).click();
    await expect
      .poll(async () => latestRequestRow(page), { timeout: 60_000 })
      .toMatch(new RegExp(`^Denied${escapeRegExp(fileName)}by Tau agent`, 'u'));
    expect(await machineStatus(page)).toContain('Ready');
    await expectCount(chatApprovalOf(page), 0);
    await expectCount(paneApprovalOf(page, fileName), 0);
    /* A denial ends the run cancelled: the model is not asked again, and no closing line follows the seed turn's. */
    await waitForRunToSettle(page, 120_000);
    expect(fixture!.gatewayRequests.length).toBe(paused);
    const events = await readFile(join(root, '.tau/chats', activeChatId(page), 'events.jsonl'), 'utf8');
    expect(
      durableMessages(events).filter(
        (message) => message.role === 'assistant' && JSON.stringify(message.content).includes(gatewayFixtureFinalText),
      ),
    ).toHaveLength(1);
    const [request, ...others] = await ledgerJobs(session!);
    expect(others).toEqual([]);
    expect(request).toMatchObject({
      state: 'denied',
      resolvedBy: { kind: 'user', label: 'Declined in chat' },
    });
    /* Zero transfers: a denied job never took a transfer, an operation id or a receipt. */
    expect(
      ['transferOperationId', 'startOperationId', 'transferId', 'receipt'].filter((key) => key in request!),
    ).toEqual([]);
  } catch (error) {
    await session!.capture(`print-dry-run-deny-${surface}`);
    throw error;
  }
});

/* A chat Approve continues the run, but the plate attestation is the pane's alone: the job keeps waiting there. */
test('approves the chat pyramid print in the chat banner and starts it only from the pane', async () => {
  const script = { current: seedTurn };
  const { page, root } = await openPrintProject('print-dry-run-chat-approve', script);
  script.current = printTurn;
  try {
    const fileName = await requestPyramidPrint(page, root);
    const paused = fixture!.gatewayRequests.length;
    /* The resumed attempt only needs to close; replaying the turn would repeat its tool calls. */
    script.current = [];
    await chatApprovalOf(page).getByRole('button', { name: 'Approve' }).click();
    await expectCount(chatApprovalOf(page), 0, 60_000);
    await expectVisible(page.getByText(gatewayFixtureFinalText, { exact: true }).last(), 300_000);
    await waitForRunToSettle(page, 120_000);
    /* The continued attempt was told the answer, and found the job still waiting for the pane. */
    const continued = fixture!.gatewayRequests.slice(paused).map((request) => requestTexts(request));
    expect(continued).toContainEqual(
      expect.stringContaining("The run paused for the person's approval, and they answered:"),
    );
    expect(continued).toContainEqual(expect.stringContaining(`- approved: "Print ${fileName} on ${machineName}?`));
    /* Nothing physical: the card stays, no longer answering the chat; the ledger row still waits; no Stop. */
    const paneCard = paneApprovalOf(page, fileName);
    await expectVisible(paneCard);
    await expectCount(paneCard.getByText('Answering here also answers the chat.', { exact: true }), 0);
    expect(await latestRequestRow(page)).toMatch(
      new RegExp(`^Waiting for approval${escapeRegExp(fileName)}by Tau agent`, 'u'),
    );
    expect(await machineStatus(page)).toContain('Ready');
    await expectCount(stopButtonOf(page), 0);
    const [waiting, ...others] = await ledgerJobs(session!);
    expect(others).toEqual([]);
    expect(waiting).toMatchObject({ state: 'awaiting-approval' });
    expect(
      ['transferOperationId', 'startOperationId', 'transferId', 'receipt'].filter((key) => key in waiting!),
    ).toEqual([]);

    /* The pane takes the attestation and starts the job the chat could only approve. */
    const start = paneCard.getByRole('button', { name: 'Start print' });
    expect(await start.isEnabled()).toBe(false);
    await paneCard.getByRole('checkbox', { name: 'The build plate is clear' }).click();
    await start.click();
    await expect.poll(async () => runText(page), { timeout: 180_000 }).toMatch(/· layer \d+ of \d+ · \d+ min left/u);
    expect(await stopButtonOf(page).isEnabled()).toBe(true);
    const [accepted, ...rest] = await ledgerJobs(session!);
    expect(rest).toEqual([]);
    expect(accepted).toMatchObject({
      resolvedBy: { kind: 'user', label: 'You' },
      attestations: [expect.objectContaining({ id: 'work-area-clear' })],
    });
  } catch (error) {
    await session!.capture('print-dry-run-chat-approve');
    throw error;
  }
});

test('slices, previews and starts a person-initiated print on the simulated X1C', async () => {
  const script = { current: seedTurn };
  const { page } = await openPrintProject('print-dry-run-pane', script);
  try {
    const prepare = page.getByRole('region', { name: 'Prepare' });
    await page.getByRole('button', { name: 'Slice and preview' }).click();
    const result = prepare.getByLabel('Slice result');
    await expectVisible(result, 120_000);
    const part =
      /^(?:Sliced by .+?)?Filemain\.gcode\.3mfLayers\d+Time.+Filament.+Part([\d.]+) × ([\d.]+) × ([\d.]+) mmToolpath[\d .×]+ mm · every nozzle move, including the printer's start routineThe part fits the plate/u.exec(
        (await result.textContent()) ?? '',
      );
    /* The seed model is a 20 mm cube: the Part row is the part, not the purge line and lifts around it. */
    expect(part?.slice(1).map(Number)).toEqual([expect.closeTo(20, 0), expect.closeTo(20, 0), expect.closeTo(20, 0)]);
    await printActionBarOf(page).getByRole('button', { name: 'Preview', exact: true }).click();
    const viewer = page.getByRole('region', { name: 'Printer simulation: main.gcode.3mf' });
    await expectVisible(viewer, 120_000);
    await viewer.getByRole('radiogroup', { name: 'Speed' }).getByRole('radio', { name: '100×' }).click();
    await showPrintPane(page);

    /* Review print asks the machine for a job; nothing reaches the printer until Start. */
    await page.getByRole('button', { name: 'Review print' }).click();
    const review = page.getByRole('region', { name: 'Job awaiting you: main.gcode.3mf', exact: true });
    await expectVisible(review, 60_000);
    expect(await machineStatus(page)).toContain('Ready');
    await expectCount(stopButtonOf(page), 0);
    await review.getByRole('checkbox', { name: 'The build plate is clear' }).click();
    await review.getByRole('button', { name: 'Start print' }).click();

    await expect.poll(async () => runText(page), { timeout: 180_000 }).toMatch(/· layer \d+ of \d+ · \d+ min left/u);
    await expect
      .poll(async () => latestRequestRow(page), { timeout: 60_000 })
      .toMatch(/^(?:Started|Running)main\.gcode\.3mfby You/u);
    /* Stop is one press, beside the machine's name, with what it does said beside it. */
    const stop = stopButtonOf(page);
    expect(await stop.isEnabled()).toBe(true);
    await stop.click();
    await expect.poll(async () => machineStatus(page), { timeout: 60_000 }).toMatch(/Ready/u);
    /* The job stays "started"; History reads the run it started, which Stop ended before it finished. */
    await expect
      .poll(async () => latestRequestRow(page), { timeout: 60_000 })
      .toMatch(/^(?:Cancelled|Interrupted)main\.gcode\.3mfby You/u);
    const [stopped, ...others] = await ledgerJobs(session!);
    expect(others).toEqual([]);
    expect(stopped).toHaveProperty('state', 'started');
    expect(stopped).toHaveProperty('run.outcome', expect.stringMatching(/^(?:cancelled|interrupted)$/u));
    await expectCount(stopButtonOf(page), 0);
  } catch (error) {
    await session!.capture('print-dry-run-pane');
    throw error;
  }
});
