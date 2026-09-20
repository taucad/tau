/**
 * AV-5: an external ACP agent, selected in the browser, run by the daemon.
 *
 * The chain this proves cannot be faked with a route interception, because
 * every link is a different process: `tau serve` resolves a pinned ACP adapter
 * and probes it, publishes what survived on its own
 * `/.well-known/tau-host`, the page it served reads that descriptor
 * same-origin, and the selector turns each advertised agent into its own row.
 * Choosing one places the turn on the daemon, which spawns the adapter, hands
 * it a materialized branch, and projects its `session/update`s into the same
 * durable log a Tau turn writes.
 *
 * The adapter is the deterministic fixture agent standing in for `codex`
 * (`TAU_ACP_ADAPTER_OVERRIDE`, honoured only under `NODE_ENV=test`): a real
 * vendor CLI would make the assertions depend on a subscription and a model.
 *
 * Two legs run here. The first drives the auto-approving path a real CLI config
 * produces (SP-4 Result 3, the fixture's `noask` prompt). The second drives the
 * permission round trip end to end: the agent asks, the daemon records the
 * interrupt durably and pauses, the page renders the banner from that log,
 * survives a reload, and the approval resumes the agent's own tool.
 *
 * A separate live leg is opt-in through `TAU_ACP_LIVE_TESTS`.
 *
 * Chromium only, like AV-4: the fixture spawns a real daemon per session and
 * one browser is enough to prove the wire.
 */

import { describe, expect, inject, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import { getKernelResultOutputSchema, screenshotOutputSchema } from '@taucad/chat';
import * as target from '#support/external-target.js';

const composer = '[aria-label="Ask Tau to build anything..."]';
const submitButton = 'button:has(svg.lucide-arrow-up)';
const proofPrompt = 'Write the external agent proof file. noask';
/* Without `noask` the fixture agent asks for permission before it writes — the
 * one switch it exposes, and the same one a real CLI's `approval_policy` is. */
const approvalPrompt = 'Write the external agent proof file.';

type LogEvent = {
  readonly type: string;
  readonly runId: string;
  readonly state?: string;
  readonly phase?: string;
  readonly reason?: string;
  readonly message?: {
    readonly role: string;
    readonly toolName?: string;
    readonly content?: unknown;
    readonly metadata?: { readonly tauInternal?: Record<string, unknown> };
  };
};

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

const createProject = async (origin: string): Promise<void> => {
  await target.navigate(`${origin}/projects/new`);
  await target.expectVisible(selectors.getByRole('button', { name: 'Create in Home' }), 90_000);
  await target.click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 }).catch(() => undefined);
  await target.fill(selectors.getByLabelText('Project Name *'), 'External Agent Project');
  await target.click(selectors.getByRole('button', { name: /Create Project/u }));
  await target.expectUrl(/\/w\/home\/[^/]+$/u, 60_000);
  await ensureChatOpen();
  await target.click(selectors.getByRole('button', { name: /^decline$/iu }), { timeout: 5000 }).catch(() => undefined);
};

/** Pick the daemon's advertised Codex row and place the chat on it. */
const selectCodex = async (): Promise<void> => {
  await target.expectVisible(selectors.getByRole('button', { name: 'Select agent: Tau' }), 60_000);
  await target.click(selectors.getByRole('button', { name: 'Select agent: Tau' }));
  const row = selectors.getByRole('option', { name: /^Codex/u });
  await target.expectVisible(row, 60_000);
  await target.click(row);
  await target.expectVisible(selectors.getByRole('button', { name: 'Select agent: Codex' }), 30_000);
};

const durableEvents = async (): Promise<readonly LogEvent[]> => {
  const chats = await target.listTauServeChats();
  if (chats.length !== 1) {
    return [];
  }
  const raw = (await target.readTauServeFile(`.tau/chats/${chats[0]!}/events.jsonl`)) ?? '';
  return raw
    .trim()
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as LogEvent);
};

describe('external agent (AV-5)', () => {
  test.skipIf(!inject('acpLiveEnabled'))(
    'runs live Codex with native Tau tools through browser and daemon',
    async () => {
      const { origin } = await target.startTauServeFixture({ externalAgents: 'codex' });
      await target.setViewport({ width: 1440, height: 900 });
      await createProject(origin);
      await selectCodex();
      await target.type(
        composer,
        'Create a 20 mm cube in main.ts using Replicad. Verify it with Tau kernel results and a Tau screenshot. Do not export. Remember the nonce copper-seahorse-41.',
      );
      await target.click(selectors.getByCss(submitButton).last());
      try {
        await expect
          .poll(
            async () => {
              const events = await durableEvents();
              return events.filter((event) => event.type === 'run.lifecycle' && event.state === 'completed').length;
            },
            { timeout: 300_000 },
          )
          .toBe(1);
      } catch (error) {
        const recorded = await durableEvents();
        console.error(
          '[AV-5 live] durable events:',
          recorded.slice(-20).map((event) => ({
            type: event.type,
            state: event.state,
            phase: event.phase,
            role: event.message?.role,
            tool: event.message?.toolName,
          })),
        );
        console.error('[AV-5 live] browser events:', JSON.stringify(await target.events()));
        throw error;
      }
      const events = await durableEvents();
      for (const name of ['get_kernel_result', 'screenshot']) {
        expect(
          events.some(
            (event) =>
              event.type === 'message.appended' &&
              event.message?.role === 'tool-output' &&
              event.message.toolName === name,
          ),
          name,
        ).toBe(true);
      }
      const kernel = events.findLast(
        (event) => event.message?.role === 'tool-output' && event.message.toolName === 'get_kernel_result',
      );
      expect(getKernelResultOutputSchema.parse(kernel?.message?.content)).toMatchObject({
        status: 'ready',
        kernelIssues: [],
      });
      const screenshot = events.findLast(
        (event) => event.message?.role === 'tool-output' && event.message.toolName === 'screenshot',
      );
      expect(screenshotOutputSchema.parse(screenshot?.message?.content).images.length).toBeGreaterThan(0);
      const activity = selectors.getByRole('button', { name: /Explored .*?(?:render|screenshot|test)/u }).last();
      await target.expectVisible(activity, 60_000);
      await target.click(activity);
      await target.expectVisible(selectors.getByRole('button', { name: /Captured 1 screenshot of main\.ts/u }), 60_000);
      await target.screenshot('body', 'acp-browser-native-tools');
      await target.type(composer, 'Reply only with the nonce from my previous message.');
      await target.click(selectors.getByCss(submitButton).last());
      await expect
        .poll(
          async () => {
            const events = await durableEvents();
            return events.filter((event) => event.type === 'run.lifecycle' && event.state === 'completed').length;
          },
          { timeout: 120_000 },
        )
        .toBe(2);
      await target.expectVisible(selectors.getByText('copper-seahorse-41', { exact: true }).last(), 30_000);
      await target.reload();
      await target.expectVisible(selectors.getByText('copper-seahorse-41', { exact: true }).last(), 60_000);
    },
    600_000,
  );

  test('runs a daemon-advertised ACP agent in a branch, with the API absent', async () => {
    const { origin, workspace } = await target.startTauServeFixture({ externalAgents: true });
    await target.setViewport({ width: 1440, height: 900 });
    await createProject(origin);

    /* The advertisement chain: the daemon probed its adapter, published it on
     * its descriptor, and the page turned it into a row of its own. */
    await target.expectVisible(selectors.getByRole('button', { name: 'Select agent: Tau' }), 60_000);
    await target.click(selectors.getByRole('button', { name: 'Select agent: Tau' }));
    const row = selectors.getByRole('option', { name: /^Codex/u });
    await target.expectVisible(row, 60_000);
    /* The copy the user reads before placing a turn: their own login, and the
     * project's tree — never a promise of per-action approval (SP-4 Result 3). */
    await target.expectVisible(
      selectors.getByText("Runs with your local Codex login in this project's tree", { exact: true }),
      10_000,
    );
    await target.click(row);
    await target.expectVisible(selectors.getByRole('button', { name: 'Select agent: Codex' }), 30_000);

    await target.type(composer, proofPrompt);
    await target.click(selectors.getByCss('button:has(svg.lucide-arrow-up)').last());

    try {
      // The daemon admitted the external run: its log exists before any pixel.
      const admitted = async (): Promise<boolean> => {
        const events = await durableEvents();
        return events.length > 0;
      };
      const completed = async (): Promise<boolean> => {
        const events = await durableEvents();
        return events.some(({ state }) => state === 'completed');
      };
      await expect.poll(admitted, { timeout: 120_000 }).toBe(true);
      await expect.poll(completed, { timeout: 180_000 }).toBe(true);
    } catch (error) {
      const { consoleMessages, pageErrors } = await target.events();
      // eslint-disable-next-line no-console -- the failure is only diagnosable from the page's own log.
      console.error(
        '[AV-5] page errors:',
        pageErrors,
        '\n[AV-5] daemon log:',
        JSON.stringify(await durableEvents()).slice(0, 4000),
        '\n[AV-5] console tail:',
        consoleMessages
          .map(({ type, text }) => `${type}: ${text.slice(0, 300)}`)
          .filter((line) => !line.includes('get-session') && !line.includes('ERR_FAILED'))
          .slice(-30),
      );
      throw error;
    }

    const events = await durableEvents();
    const runId = events.at(-1)?.runId ?? '';
    expect(runId).not.toBe('');

    /* V2: the agent works in the project's tree — its write lands at the root,
     * and nothing copies the tree per run beside it. The assertion is re-pointed
     * rather than dropped (W5 review Q6, folded to W18): `.tau/workspaces` is
     * gone from the product with W3, and `.tau/checkouts/<id>/…` is the layout
     * that replaced it, so that is where a per-run copy would appear now. The
     * lint pin and `path-registry` keep the old name out of source; this keeps
     * the runtime half of V2 asserted. */
    await expect.poll(async () => target.readTauServeFile('hello.txt'), { timeout: 60_000 }).toContain('noask');
    expect(await target.readTauServeFile(`.tau/checkouts/${runId}/tree/hello.txt`)).toBeUndefined();
    expect(await target.readTauServeFile('.tau/checkouts/hello.txt')).toBeUndefined();

    /* The thin projection: the turn's user message carries the external marker,
     * and the agent's own tool call is a `tool-input`/`tool-output` pair marked
     * as externally executed — the same vocabulary a Tau turn writes. */
    const messages = events.flatMap((event) => (event.type === 'message.appended' ? [event.message!] : []));
    expect(messages.filter(({ role }) => role === 'tool-input')).not.toEqual([]);
    expect(messages.filter(({ role }) => role === 'tool-output')).not.toEqual([]);
    for (const message of messages.filter(({ role }) => role === 'tool-input' || role === 'tool-output')) {
      expect(message.metadata?.tauInternal).toMatchObject({ origin: 'external', agentId: 'codex' });
    }
    expect(events.filter(({ type }) => type === 'run.lifecycle').map(({ state }) => state)).toEqual([
      'admitted',
      'running',
      'completed',
    ]);
    // The log the client rendered is a file in the daemon's own workspace.
    expect(workspace).not.toBe('');

    /* PH19: the API is absent from the data path. `runs/active` is the
     * project-level "is anything running?" probe every project polls regardless
     * of placement; nothing carrying a turn, a run stream or a transcript goes
     * near the API — and neither does the agent, which talked only to the
     * daemon that spawned it. */
    const apiRequests = await target.readAgentHostApiRequests();
    expect(apiRequests.filter((path) => !path.endsWith('/runs/active'))).toEqual([]);

    await target.stopTauServeFixture();
  }, 420_000);

  test('renders the agent’s permission request from the durable log and resumes it on approval', async () => {
    const { origin } = await target.startTauServeFixture({ externalAgents: true });
    await target.setViewport({ width: 1440, height: 900 });

    const banner = selectors.getByRole('region', { name: 'Approval required' });
    const pausedOnApproval = async (): Promise<boolean> => {
      const events = await durableEvents();
      return events.some(({ type, phase }) => type === 'interrupt.recorded' && phase === 'requested');
    };

    /* Project creation is inside the diagnostic block on purpose: a startup that
     * never paints is only distinguishable from a defect by the page's own log. */
    try {
      await createProject(origin);
      await selectCodex();

      await target.type(composer, approvalPrompt);
      await target.click(selectors.getByCss(submitButton).last());

      /* The interrupt is durable before any pixel: the daemon paused on it, and
       * the banner is a projection of that record — not of a socket message the
       * page happened to be listening for. */
      await expect.poll(pausedOnApproval, { timeout: 180_000 }).toBe(true);
      await target.expectVisible(banner, 60_000);
      await target.expectVisible(banner.getByText(/Allow write hello\.txt/u), 30_000);
      /* The options the host recorded, and the copy bounded by SP-4 Result 3 —
       * approving is not a promise that Tau gates each action. */
      await target.expectVisible(banner.getByRole('button', { name: 'Allow', exact: true }), 10_000);
      await target.expectVisible(banner.getByRole('button', { name: 'Always allow', exact: true }), 10_000);
      await target.expectVisible(banner.getByRole('button', { name: 'Reject', exact: true }), 10_000);
      await target.expectVisible(
        banner.getByText(
          "Approving lets Codex keep working in this chat's tree; Tau does not gate each action it takes there.",
          { exact: true },
        ),
        10_000,
      );

      /* Reattach: this tab's memory of the run is gone, so a banner that comes
       * back can only have come from the log the daemon still holds. */
      await target.reload();
      await ensureChatOpen();
      await target.expectVisible(banner, 120_000);

      await target.click(banner.getByRole('button', { name: 'Allow', exact: true }));

      const completed = async (): Promise<boolean> => {
        const events = await durableEvents();
        return events.some(({ state }) => state === 'completed');
      };
      await expect.poll(completed, { timeout: 180_000 }).toBe(true);
      await target.expectHidden(banner, 60_000);
    } catch (error) {
      const { consoleMessages, pageErrors } = await target.events();
      // eslint-disable-next-line no-console -- the failure is only diagnosable from the page's own log.
      console.error(
        '[AV-5 approval] page errors:',
        pageErrors,
        '\n[AV-5 approval] daemon log:',
        JSON.stringify(await durableEvents()).slice(0, 6000),
        '\n[AV-5 approval] console tail:',
        consoleMessages
          .map(({ type, text }) => `${type}: ${text.slice(0, 300)}`)
          .filter((line) => !line.includes('get-session') && !line.includes('ERR_FAILED'))
          .slice(-30),
      );
      throw error;
    }

    const events = await durableEvents();
    /* Named for the V2 re-point below, which asks whether a per-run copy of the
     * tree exists under `.tau/checkouts/<run>`; every other assertion here reads
     * the log, not the run. */
    const approvedRunId = events.at(-1)?.runId ?? '';
    expect(approvedRunId).not.toBe('');
    /* The approval is a request/resolution pair in the same log, and the run
     * moved through `paused` and back to `running` around it. */
    expect(
      events.flatMap(({ type, phase, reason }) => (type === 'interrupt.recorded' ? [`${phase}:${reason}`] : [])),
    ).toEqual(['requested:Allow write hello.txt with {"path":"hello.txt"}?', 'resolved:approved']);
    expect(events.filter(({ type }) => type === 'run.lifecycle').map(({ state }) => state)).toEqual([
      'admitted',
      'running',
      'paused',
      'running',
      'completed',
    ]);

    // The approved tool actually ran, in the project's tree and nowhere else (V2).
    await expect
      .poll(async () => target.readTauServeFile('hello.txt'), { timeout: 60_000 })
      .toContain('external agent proof');
    expect(await target.readTauServeFile(`.tau/checkouts/${approvedRunId}/tree/hello.txt`)).toBeUndefined();
    expect(await target.readTauServeFile('.tau/checkouts/hello.txt')).toBeUndefined();

    // PH19 again: resolving an approval is a daemon command, never an API call.
    const apiRequests = await target.readAgentHostApiRequests();
    expect(apiRequests.filter((path) => !path.endsWith('/runs/active'))).toEqual([]);

    await target.stopTauServeFixture();
  }, 420_000);
});
