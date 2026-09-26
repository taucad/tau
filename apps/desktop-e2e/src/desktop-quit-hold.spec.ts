/**
 * S48(17) — the desktop quit hold.
 *
 * `two-client.spec.ts` already holds *that* a quit is held: `before-quit`
 * awaits `services.quiesce(20_000)` and logs `main.quiesce { outcome }` before
 * `services.dispose()`. What S48(17) asks for is the half W19-a2 added on top
 * of it and nothing drives yet — the **renderer's** hold: main asks the window
 * to quiesce first (`main.renderer-quiesce`), every live session runs its own
 * `closing`, and the person is shown what is being waited for with one way out,
 * *Quit anyway*.
 *
 * The overlay itself is not observable from here: with no live project the
 * registry answers `quiesced` inside the same React commit that set the hold,
 * so nothing paints — correctly, because there is nothing to wait for. Making
 * one live on the desktop needs a signed-in account and a turn (W18's
 * fixture). The painted overlay and its *Quit anyway* verb are pinned in
 * `apps/ui/app/machines/sessions.composition.test.tsx` instead; what this owns
 * is the main-process ordering and the renderer's answer, which only the real
 * shell can show.
 */

import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { launchDesktopApp } from '#support/desktop-app.js';

/**
 * The desktop shell needs a token to sign its shell in; the quit path needs no
 * account, so this one is deliberately not a session.
 */
const unauthenticatedToken = 'w22-quit-hold-not-a-session';

describe('the desktop quit hold (S48(17), D31, P49)', () => {
  /** One launch, one quit, read by both rows below. */
  const quitOnce = async (): Promise<string> => {
    const session = await launchDesktopApp({ token: unauthenticatedToken });
    try {
      await session.page.goto('app://tau/projects', { waitUntil: 'domcontentloaded' });
      await expect
        .poll(
          async () =>
            session.page.evaluate(() => {
              const shell = globalThis as typeof globalThis & { tau?: { quit?: { isReady(): boolean } } };
              return shell.tau?.quit?.isReady() ?? false;
            }),
          { timeout: 120_000 },
        )
        .toBe(true);
      await session.application.evaluate(async ({ app }) => {
        app.quit();
      });
      let log = '';
      await expect
        .poll(
          async () => {
            log = await readFile(session.logPath, 'utf8').catch(() => '');
            return log;
          },
          { timeout: 120_000 },
        )
        .toContain('main.quiesce');
      return log;
    } finally {
      await session.close();
    }
  };

  it('asks the renderer before it quiesces the services utility', async () => {
    const log = await quitOnce();

    /* R9: the window is asked first, and the utility only after it answered or
     * its bound ran out — a quit that disposed the services while the renderer
     * was still flushing would record the last edits nowhere. */
    const rendererAt = log.indexOf('main.renderer-quiesce');
    const utilityAt = log.indexOf('main.quiesce');
    expect(rendererAt, 'the renderer was never asked to quiesce').toBeGreaterThanOrEqual(0);
    expect(rendererAt, 'the utility was quiesced before the renderer was asked').toBeLessThan(utilityAt);
    expect(log).toMatch(/main\.renderer-quiesce.*(?:quiesced|timeout|no-window)/u);
    expect(log).toMatch(/main\.quiesce.*(?:quiesced|timeout|no-utility)/u);
  }, 900_000);

  it('is answered by the renderer rather than waiting out the bound', async () => {
    const log = await quitOnce();

    expect(log, 'the renderer did not answer the quit ask').toMatch(/main\.renderer-quiesce.*quiesced/u);
  }, 900_000);
});

/**
 * W15: a composer record write that is still pending when the person quits.
 *
 * `draftMachine` debounces its edits, so a draft typed and abandoned inside that
 * window exists only in memory until something flushes it — which on quit is the
 * renderer hold running the unload producers (`useFlushProducers`), Home's own
 * (`HomeNewProjectComposerProvider`) among them. Removing that flush leaves the
 * file absent, which is exactly what this row reads.
 */
it('flushes a pending composer record write before the shell exits', async () => {
  const draft = 'Quit before the debounce fires.';
  const session = await launchDesktopApp({ token: unauthenticatedToken });
  try {
    await session.page.goto('app://tau/', { waitUntil: 'domcontentloaded' });
    const composer = session.page.locator('[aria-label="Ask Tau to build anything..."]').first();
    await composer.waitFor({ state: 'visible', timeout: 120_000 });
    await composer.click();
    await composer.fill(draft);
    /* No settle wait on purpose: the draft must still be in flight, which is the
     * whole point of the hold. */
    await session.application.evaluate(async ({ app }) => {
      app.quit();
    });

    const recordPath = join(session.homeRoot, '.tau/composers/new-project.json');
    await expect.poll(async () => readFile(recordPath, 'utf8').catch(() => ''), { timeout: 120_000 }).toContain(draft);
  } finally {
    await session.close();
  }
}, 900_000);
