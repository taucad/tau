import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { authenticatePackagedDesktop, launchDesktopApp } from '#support/desktop-app.js';
import type { DesktopSession } from '#support/desktop-app.js';
import { evaluateModelOutputSchema, screenshotOutputSchema, testModelOutputSchema } from '@taucad/chat';
import { latestCompletedRun, toolResult } from '#support/acp-evidence.js';
import { deleteTauTestUser, seedTauTestUser, tauTestAccount } from '#support/tau-account.js';
import {
  activeChatId,
  connectPickedFolder,
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
      const reasoning = page.getByRole('tablist', { name: /Reasoning for Grok Build/u });
      await expect
        .poll(async () => reasoning.getByRole('tab').allTextContents())
        .toEqual(['Low', 'Medium', 'High', 'Extra High']);
      await reasoning.getByRole('tab', { name: 'Low', exact: true }).click();
      await expect
        .poll(async () => reasoning.getByRole('tab', { name: 'Low', exact: true }).getAttribute('aria-selected'))
        .toBe('true');
      await session.capture('grok-reasoning-order');
      await page.keyboard.press('Escape');
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
              .getByRole('button', { name: /Rendering models|Running tests|Capturing images/u, expanded: false })
              .first();
            // Concurrent tools can have separate collapsed groups; inspect all before approving either.
            // oxlint-disable-next-line no-await-in-loop -- Each click removes that group from the collapsed locator.
            while (await group.isVisible()) {
              // oxlint-disable-next-line no-await-in-loop -- Re-resolve the first remaining group after each click.
              await group.click();
            }
            const activity = await page.getByRole('status', { name: 'Current activity' }).allTextContents();
            const loading = await page.locator('[data-status="loading"]:visible').allTextContents();
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
            const approve = page.getByRole('button', { name: /^(?:Yes|allow once)$/u });
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
      expect(approvals).toBeGreaterThan(0);
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
