/**
 * HA0 regression harness, e2e tier (Brain research/host-attachment-reliability-blueprint.md, "Regression harness
 * (HA0)"). The unit rows live in `apps/ui/app/services/chat-session-store.reattach.regression.test.ts`; a row is here
 * only when it needs a real placement. HA0 deferred row 9 to HA5, which adds the R1 line and its actions. The other
 * e2e rows (1, 4, 12, 13, 14, 17) and why each is covered elsewhere or not built are in Brain
 * `artifacts/host-attachment-reliability/ha0-results.md`.
 *
 * Chromium only: the rows start a real `tau serve` per test, as `daemon-agent-host.spec.ts` does.
 */

import { describe, expect, it } from 'vitest';
import { page as selectors, server } from 'vitest/browser';
import * as target from '#support/external-target.js';

const composer = '[aria-label="Ask Tau to build anything..."]';
const partialText = 'Tau Host started the workspace change.';

const ensureChatOpen = async (): Promise<void> => {
  try {
    await target.expectVisible(selectors.getByCss(composer), 10_000);
    return;
  } catch {
    // Lane genuinely closed — open it.
  }
  await target.expectVisible(selectors.getByCss('[aria-label="Toggle Chat lane"]'), 60_000);
  await target.click(selectors.getByCss('[aria-label="Toggle Chat lane"]'));
  await target.expectVisible(selectors.getByCss(composer), 60_000);
};

/** Create a project through the real UI, as `daemon-agent-host.spec.ts` does (the serve build has no seed routes). */
const createProject = async (origin: string): Promise<void> => {
  await target.navigate(`${origin}/projects/new`);
  await target.expectVisible(selectors.getByRole('button', { name: 'Create in Home' }), 90_000);
  await target.fill(selectors.getByLabelText('Project Name *'), 'Reattach Project');
  await target.click(selectors.getByRole('button', { name: /Create Project/u }));
  await target.expectUrl(/\/w\/home\/[^/]+$/u, 60_000);
  await ensureChatOpen();
  await target.click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 }).catch(() => undefined);
};

/** Place the chat's turns on the daemon that served the page. */
const selectTauHost = async (workspace: string): Promise<void> => {
  const agentTrigger = selectors.getByRole('button', { name: /^Agent and model: /u });
  const agentSettings = selectors.getByRole('dialog').getByRole('button', { name: /^Settings/u });
  await target.expectVisible(agentTrigger, 60_000);
  await target.click(agentTrigger);
  await target.expectVisible(agentSettings, 10_000);
  if ((await target.getAttribute(agentSettings, 'aria-expanded')) !== 'true') {
    await target.click(agentSettings);
  }
  const label = await target.evaluate(async () => {
    const response = await fetch('/.well-known/tau-host');
    return ((await response.json()) as { readonly label: string }).label;
  });
  await target.click(
    selectors.getByRole('tablist', { name: 'Runs on' }).getByRole('tab', { name: label, exact: true }),
  );
  await target.expectVisible(selectors.getByText(`In ${workspace}`, { exact: true }), 10_000);
  await target.keyboardPress('Escape');
};

const send = async (prompt: string): Promise<void> => {
  const submit = selectors.getByCss('button:has(svg.lucide-arrow-up)').last();
  await target.type(composer, prompt);
  /* A click before the button arms is dropped (daemon-agent-host.spec.ts), so wait until it is there and enabled. */
  await target.expectVisible(submit, 120_000);
  await expect.poll(async () => target.getAttribute(submit, 'disabled'), { timeout: 120_000 }).toBeNull();
  await target.click(submit);
};

/* While a turn runs the button is Stop, so a follow-up is queued with Enter; the strip shows it once it is queued. */
const queue = async (prompt: string): Promise<void> => {
  await target.type(composer, prompt);
  await target.keyboardPress('Enter');
  await target.expectVisible(selectors.getByRole('region', { name: 'Queued messages' }), 30_000);
};

const runs = it.runIf(server.browser === 'chromium');

describe('host attachment regression harness, e2e', () => {
  /* Row 9 (U8, U19): a message queued behind a live daemon turn is pinned to that daemon. When the daemon becomes
   * unreachable, the queued message shows R1 ("The latest turns are on <computer>…") with Remove and Send here
   * instead, which re-sends under a new command id (HA5). */
  runs(
    'row 9: offers Remove and Send here instead for a message pinned to an unreachable computer',
    async () => {
      const { origin, workspace } = await target.startTauServeFixture();
      try {
        await target.setViewport({ width: 1440, height: 900 });
        await createProject(origin);
        await selectTauHost(workspace);
        await send('Create the Tau Host proof file.');
        await target.expectVisible(selectors.getByText(partialText, { exact: true }), 120_000);
        expect(await target.isTauServeGatewayHeld()).toBe(true);
        await queue('Then describe the model.');

        // The page stays loaded; the computer it placed the chat on is gone.
        await target.stopTauServeFixture();

        await target.expectVisible(selectors.getByText(/They’ll appear here when it’s back online\./u), 60_000);
        await target.expectVisible(selectors.getByRole('button', { name: 'Send here instead' }), 10_000);
        await target.expectVisible(selectors.getByRole('button', { name: 'Remove' }), 10_000);
      } finally {
        await target.stopTauServeFixture().catch(() => undefined);
      }
    },
    300_000,
  );
});
