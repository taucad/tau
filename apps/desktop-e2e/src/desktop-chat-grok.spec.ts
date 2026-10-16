import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { agentLogEventSchema, emptyChatLedger, foldChatLedger } from '@taucad/agent-host';
import { authenticatePackagedDesktop, launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { evaluateModelOutputSchema, screenshotOutputSchema, testModelOutputSchema } from '@taucad/chat';
import { currentRun, durableMessages, latestCompletedRun, toolResult } from '#support/acp-evidence.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import {
  activeChatId,
  connectPickedFolder,
  composerOf,
  expectVisible,
  selectAgent,
  selectKernel,
  sendPrompt,
  submitPrompt,
} from '#support/scenario.js';

let session: DesktopSession | undefined;
let seededEmail: string | undefined;

afterEach(async () => {
  await session?.close();
  session = undefined;
  if (seededEmail) {
    await deleteTauTestUser(seededEmail);
    seededEmail = undefined;
  }
});

// Explicit opt-in: this test uses the operator's cached Grok login and quota.
test.skipIf(process.env['TAU_E2E_GROK'] !== 'true')(
  'should answer and retain context through the Grok composer',
  async () => {
    const account = tauTestAccount('grok');
    seededEmail = account.email;
    const token = await seedTauTestUser(account);
    const packaged = process.env['TAU_E2E_GROK_PACKAGED'] === 'true';
    session = await launchDesktopApp({ token, visible: true, packaged });
    if (packaged) {
      await authenticatePackagedDesktop(session, token);
    }
    const { page } = session;
    await page.setViewportSize({ width: 1440, height: 1000 });
    try {
      await expectVisible(page.locator('[aria-label="Ask Tau to build anything..."]'), 120_000);
      await selectKernel(page, 'Build123d');
      await connectPickedFolder(session);
      expect(await selectAgent(page, 'Grok Build', 'Grok 4.7')).toMatch(/^Agent and model: Grok Build, /u);
      await page.getByRole('button', { name: /^Agent and model: Grok Build/u }).click();
      await page.getByRole('button', { name: /^Effort for /u }).click();
      const reasoning = page.locator('[data-slot="effort-list"]');
      await expect
        .poll(async () =>
          reasoning
            .getByRole('option')
            .evaluateAll((options) => options.map((option) => option.getAttribute('aria-label')?.split(',')[0])),
        )
        .toEqual(['Low', 'Medium', 'High', 'Extra High']);
      await reasoning.getByRole('option', { name: /^Low(?:,|$)/u }).click();
      await expectVisible(page.getByRole('button', { name: /^Effort for .*: Low\. Change$/u }));
      await session.capture('grok-reasoning-order');
      await page.keyboard.press('Escape');
      // Home also mounts the empty-project composer below the primary composer.
      const permissionControl = page.getByRole('button', { name: /^Mode:/u }).first();
      await expectVisible(permissionControl);
      await permissionControl.click();
      await page.getByRole('option', { name: /^Always approve(?:\s|$)/u }).click();
      await expect.poll(async () => permissionControl.getAttribute('aria-label')).toBe('Mode: Always approve');
      await session.capture('grok-permissions-before-first-turn');
      const slug = await submitPrompt(
        page,
        'Remember the number 8127. Reply with the single word pong. Do not use tools.',
      );
      await expect.poll(() => new URL(page.url()).searchParams.get('chat'), { timeout: 120_000 }).toBeTruthy();
      const chatId = activeChatId(page);
      const eventsPath = join(session.pickedDirectory, slug, '.tau/chats', chatId, 'events.jsonl');
      const readEvents = (): string => readFileSync(eventsPath, 'utf8');
      await expect.poll(readEvents, { timeout: 180_000 }).toMatch(/"state":"completed"/u);
      await expectVisible(page.getByRole('article').getByText(/^pong[.!]?$/iu));
      const firstRun = latestCompletedRun(readEvents());
      await sendPrompt(page, 'What number did I ask you to remember? Reply with only the number.');
      await expect.poll(() => latestCompletedRun(readEvents()), { timeout: 180_000 }).not.toBe(firstRun);
      await expectVisible(page.getByRole('article').getByText(/^8127[.!]?$/u));
      expect(readEvents()).toContain('"agentId":"grok"');
      await session.capture('grok-composer-continuity');
      const memoryRun = latestCompletedRun(readEvents());
      writeFileSync(
        join(session.pickedDirectory, slug, 'visual-check.png'),
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAdklEQVR4nO3PQQkAMAzAwPo33Yno4xgEIuAyO/t1wwUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWHHtBp+HSthEAJgAAAABJRU5ErkJggg==',
          'base64',
        ),
      );
      await sendPrompt(
        page,
        'Open visual-check.png with your file-reading tool and identify its dominant color. Inspect the image itself; do not decode its bytes with code. Reply with only the color.',
      );
      await expect.poll(() => latestCompletedRun(readEvents()), { timeout: 180_000 }).not.toBe(memoryRun);
      await expectVisible(page.getByRole('article').getByText(/^(?:magenta|fuchsia)[.!]?$/iu));
      await session.capture('grok-composer-image-read');
      const secondRun = latestCompletedRun(readEvents());
      // Record short visible phases in the renderer rather than losing them between driver polls.
      const phaseHistory = await page.evaluateHandle(() => {
        const loading = new Set<string>();
        const activities = new Set<string>();
        const collect = (): void => {
          for (const element of document.querySelectorAll('[data-status="loading"], [aria-label="Current activity"]')) {
            if (element.getClientRects().length === 0) {
              continue;
            }
            const labels = element.getAttribute('aria-label') === 'Current activity' ? activities : loading;
            labels.add(element.textContent.trim());
          }
        };
        const observer = new MutationObserver(collect);
        observer.observe(document.body, { attributes: true, characterData: true, childList: true, subtree: true });
        collect();
        return { loading, activities, observer };
      });
      await sendPrompt(
        page,
        'Use the cad-build123d skill to create a simple 20 mm cube in main.py. Check it with Tau evaluate_model and a geometry assertion in main.geospec.ts using test_model. Capture all six views of main.py with screenshot mode multi_angle, then briefly report the results. Do not export anything.',
      );
      let approvals = 0;
      const observedToolLabels = new Set<string>();
      const observedActivities = new Set<string>();
      const rawMcpLabels = new Set<string>();
      await expect
        .poll(
          async () => {
            const scroll = page.getByRole('button', { name: 'Scroll to bottom', exact: true });
            if (await scroll.isVisible()) {
              await scroll.click();
            }
            // Permission pauses can collapse these groups before the tool starts running.
            const group = page
              .getByRole('button', {
                name: /rendering models|running tests|capturing images|editing files/iu,
                expanded: false,
              })
              .first();
            // Concurrent tools can have separate collapsed groups; inspect all before approving either.
            // oxlint-disable-next-line no-await-in-loop -- Each click removes that group from the collapsed locator.
            while (await group.isVisible()) {
              // oxlint-disable-next-line no-await-in-loop -- Re-resolve the first remaining group after each click.
              await group.click();
            }
            const { activity, loading } = await phaseHistory.evaluate((history) => ({
              activity: [...history.activities],
              loading: [...history.loading],
            }));
            const permissions = await page
              .locator('[aria-label="Approval required"], [aria-label="Request allowed"]')
              .allTextContents();
            for (const label of [...activity, ...loading, ...permissions]) {
              if (/tau__(?:evaluate_model|test_model|screenshot)/u.test(label)) {
                rawMcpLabels.add(label);
              }
            }
            for (const label of activity) {
              observedActivities.add(label.trim());
            }
            for (const [phase, prefix] of [
              ['rendering', 'Rendering'],
              ['testing', 'Running tests'],
              ['capturing', 'Capturing'],
            ] as const) {
              if (!observedToolLabels.has(phase) && loading.some((label) => label.trim().startsWith(prefix))) {
                observedToolLabels.add(phase);
                // oxlint-disable-next-line no-await-in-loop -- Capture each observed UI phase before the next poll.
                await session?.capture(`grok-mcp-${phase}`);
              }
            }
            const approve = page.getByRole('button', { name: /^(?:Yes|Allow once)$/iu });
            if (await approve.isVisible()) {
              if (approvals === 0) {
                await session?.capture('grok-composer-approval');
              }
              await approve.click();
              approvals += 1;
            }
            return latestCompletedRun(readEvents());
          },
          { timeout: 600_000 },
        )
        .not.toBe(secondRun);
      await phaseHistory.evaluate((history) => {
        history.observer.disconnect();
      });
      await phaseHistory.dispose();
      expect(approvals, 'Always approve should avoid interrupting harmless CAD MCP calls').toBe(0);
      expect([...observedToolLabels]).toEqual(expect.arrayContaining(['rendering', 'testing', 'capturing']));
      expect([...observedActivities]).toContain('Running tests');
      expect([...rawMcpLabels]).toEqual([]);
      const cadRun = latestCompletedRun(readEvents());
      expect(
        evaluateModelOutputSchema.parse(
          toolResult(readEvents(), { runId: cadRun, toolName: 'evaluate_model', targetFile: 'main.py' }),
        ),
      ).toMatchObject({ status: 'ready', kernelIssues: [] });
      const modelTest = testModelOutputSchema.parse(
        toolResult(readEvents(), { runId: cadRun, toolName: 'test_model', targetFile: 'main.geospec.ts' }),
      );
      expect(modelTest.total).toBeGreaterThan(0);
      expect(modelTest.passed).toBe(modelTest.total);
      expect(
        screenshotOutputSchema.parse(
          toolResult(readEvents(), { runId: cadRun, toolName: 'screenshot', targetFile: 'main.py' }),
        ).images,
      ).toHaveLength(6);
      expect(await page.getByText('Image capture failed', { exact: true }).count()).toBe(0);
      expect(readEvents()).toContain('cad-build123d');
      await session.capture('grok-composer-cad');
    } catch (error) {
      await session.capture('grok-composer-failure');
      throw error;
    }
  },
);

test.skipIf(process.env['TAU_E2E_GROK'] !== 'true')(
  'should deliver FIFO and Steer through the Grok composer queue during approvals',
  async () => {
    const account = tauTestAccount('grok-queue');
    seededEmail = account.email;
    const token = await seedTauTestUser(account);
    const packaged = process.env['TAU_E2E_GROK_PACKAGED'] === 'true';
    session = await launchDesktopApp({ token, visible: true, packaged });
    if (packaged) {
      await authenticatePackagedDesktop(session, token);
    }
    const { page } = session;
    await page.setViewportSize({ width: 1440, height: 1000 });
    try {
      await expectVisible(composerOf(page), 120_000);
      await selectKernel(page, 'OpenSCAD');
      await connectPickedFolder(session);
      await selectAgent(page, 'Grok Build', 'Grok 4.7');
      const slug = await submitPrompt(page, 'Remember the number 63192. Reply only READY. Do not use tools.');
      await expect.poll(() => new URL(page.url()).searchParams.get('chat'), { timeout: 120_000 }).toBeTruthy();
      const eventsPath = join(session.pickedDirectory, slug, '.tau/chats', activeChatId(page), 'events.jsonl');
      const readEvents = (): string => readFileSync(eventsPath, 'utf8');
      const readRows = () =>
        readEvents()
          .split('\n')
          .filter((line) => line.trim() !== '')
          .map((line) => agentLogEventSchema.parse(JSON.parse(line)));
      await expect.poll(() => latestCompletedRun(readEvents()), { timeout: 180_000 }).toBeTruthy();
      await page.getByRole('button', { name: /^Mode:/u }).click();
      await page.getByRole('option', { name: /^Ask(?:\s|$)/u }).click();
      await expectVisible(page.getByRole('button', { name: 'Mode: Ask', exact: true }));
      writeFileSync(join(session.pickedDirectory, slug, 'main.scad'), 'cube(20);\n');

      // Approval provides a deterministic pause without an expensive long generation or arbitrary sleep.
      const renderPrompt =
        'Call the Tau evaluate_model MCP tool for main.scad. Do not use shell or other tools. After the result reply only RENDERED.';
      await sendPrompt(page, renderPrompt);
      const approval = page.getByRole('button', { name: /^Allow once$/iu });
      await expectVisible(approval, 180_000);
      const heldRun = currentRun(readEvents())?.runId;
      expect(heldRun).toBeTruthy();
      const queue = page.getByRole('region', { name: 'Queued messages' });
      const first = 'Reply only QUEUE_FIRST_63192. Do not use tools.';
      const second = 'Reply only QUEUE_SECOND_63192. Do not use tools.';
      // The sendPrompt helper deliberately waits for idle; the queue is exercised through the busy composer itself.
      await composerOf(page).fill(first);
      await composerOf(page).press('Enter');
      await expectVisible(queue.getByText(first, { exact: true }));
      await composerOf(page).fill(second);
      await composerOf(page).press('Enter');
      await expect.poll(async () => queue.getByRole('listitem').count()).toBe(2);
      expect(currentRun(readEvents())?.runId).toBe(heldRun);
      expect(durableMessages(readEvents()).filter((message) => message.role === 'user')).toHaveLength(2);
      await session.capture('grok-queue-held-for-approval');
      await approval.click();
      await expectVisible(page.getByRole('article').getByText(/^QUEUE_SECOND_63192[.!]?$/u), 240_000);
      await expect.poll(() => latestCompletedRun(readEvents()), { timeout: 120_000 }).toBeTruthy();
      await expect.poll(async () => queue.count()).toBe(0);
      const queuedUsers = durableMessages(readEvents()).filter(
        (message) => message.role === 'user' && /QUEUE_(?:FIRST|SECOND)_63192/u.test(JSON.stringify(message.content)),
      );
      expect(queuedUsers).toHaveLength(2);
      expect(JSON.stringify(queuedUsers[0]?.content)).toContain(first);
      expect(JSON.stringify(queuedUsers[1]?.content)).toContain(second);
      const rows = readRows();
      const ledger = foldChatLedger(emptyChatLedger, rows);
      expect(ledger.runs[queuedUsers[0]!.runId]?.lifecycle).toBe('completed');
      expect(ledger.runs[queuedUsers[1]!.runId]?.lifecycle).toBe('completed');
      const firstComplete = rows.findIndex(
        (row) => row.type === 'run.lifecycle' && row.runId === queuedUsers[0]!.runId && row.state === 'completed',
      );
      const secondAdmitted = rows.findIndex(
        (row) => row.type === 'run.lifecycle' && row.runId === queuedUsers[1]!.runId && row.state === 'admitted',
      );
      expect(firstComplete).toBeGreaterThanOrEqual(0);
      expect(secondAdmitted).toBeGreaterThan(firstComplete);
      await session.capture('grok-queue-fifo-completed');

      await sendPrompt(page, renderPrompt);
      await expectVisible(approval, 180_000);
      const interruptedRun = currentRun(readEvents())?.runId;
      expect(interruptedRun).toBeTruthy();
      const correction =
        'Cancel the rendering request. Reply only STEERED followed by the number I asked you to remember. Do not use tools.';
      await composerOf(page).fill(correction);
      await composerOf(page).press('Enter');
      const queuedCorrection = queue.getByRole('listitem').filter({ hasText: correction });
      await expectVisible(queuedCorrection);
      await session.capture('grok-queue-steer-approval');
      await queuedCorrection.getByRole('button', { name: 'Steer', exact: true }).click();
      await expectVisible(page.getByRole('article').getByText(/^STEERED\s+63192[.!]?$/u), 240_000);
      await expect.poll(() => latestCompletedRun(readEvents()), { timeout: 120_000 }).toBeTruthy();
      await expect.poll(async () => queue.count()).toBe(0);
      const replacements = durableMessages(readEvents()).filter(
        (message) => message.role === 'user' && JSON.stringify(message.content).includes(correction),
      );
      expect(replacements).toHaveLength(1);
      const finalRows = readRows();
      const cancelled = finalRows.findIndex(
        (row) => row.type === 'run.lifecycle' && row.runId === interruptedRun && row.state === 'cancelled',
      );
      const replacementAdmitted = finalRows.findIndex(
        (row) => row.type === 'run.lifecycle' && row.runId === replacements[0]!.runId && row.state === 'admitted',
      );
      expect(cancelled).toBeGreaterThanOrEqual(0);
      expect(replacementAdmitted).toBeGreaterThan(cancelled);
      expect(foldChatLedger(emptyChatLedger, finalRows).runs[replacements[0]!.runId]?.lifecycle).toBe('completed');
      await session.capture('grok-queue-steer-completed');
    } catch (error) {
      await session.capture('grok-queue-failure');
      throw error;
    }
  },
);
