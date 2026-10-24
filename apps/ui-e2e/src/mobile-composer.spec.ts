import { beforeEach, expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';
import { agentTrigger, composerSelector, prepareComposerPage } from '#support/chat-attachments.js';
import { dismissIosKeyboard, installIosKeyboard, iosViewport, openIosKeyboard } from '#support/ios-keyboard.js';

/**
 * The phone composer (D14, D18): at rest one row of +, microphone and Send; focused, the model
 * selector joins before the microphone and Send. Every control is a 40px touch target (I3) and its
 * attachments open from + with a tap, never a hover (I2).
 */

const composer = (): Locator => selectors.getByRole('region', { name: 'Chat composer' });
const bar = '[data-slot="composer-bar"]';

/** The bar's controls a person can see right now, by accessible name, in reading order. */
const reachableControls = async (): Promise<readonly string[]> =>
  target.evaluateLocator(
    composer(),
    (region, barSelector: string) =>
      [...region.querySelectorAll<HTMLButtonElement>(`${barSelector} button`)]
        .filter((button) => button.checkVisibility({ visibilityProperty: true, opacityProperty: true }))
        .map((button) => button.getAttribute('aria-label') ?? button.textContent.trim()),
    bar,
  );

/** Each visible control takes a tap 5px outside its box (inside its 6px ring), and no other control does. */
const touchTargetMisses = async (): Promise<readonly string[]> =>
  target.evaluateLocator(
    composer(),
    (region, barSelector: string) => {
      const misses: string[] = [];
      const buttons = [...region.querySelectorAll<HTMLButtonElement>(`${barSelector} button`)].filter((button) =>
        button.checkVisibility({ visibilityProperty: true, opacityProperty: true }),
      );
      for (const button of buttons) {
        const box = button.getBoundingClientRect();
        if (box.width + 12 < 40 || box.height + 12 < 40) {
          misses.push(`${button.ariaLabel}: ${box.width}×${box.height}`);
        }
        const x = box.left + box.width / 2;
        const y = box.top + box.height / 2;
        for (const [px, py] of [
          [box.left - 5, y],
          [box.right + 5, y],
          [x, box.top - 5],
          [x, box.bottom + 5],
        ] as const) {
          if (document.elementFromPoint(px, py)?.closest('button') !== button) {
            misses.push(`${button.ariaLabel} at ${px},${py}`);
          }
        }
      }
      return misses;
    },
    bar,
  );

beforeEach(async () => {
  await target.commands.uiOpenTarget({ hasTouch: true, isMobile: true });
  await prepareComposerPage();
  await installIosKeyboard();
  await target.setViewport(iosViewport);
  await target.navigate('/__e2e/chat-attachments');
  await target.expectUrl(/\/w\/[^/]+\/[^/?]+\?/u, 60_000);
  await target.expectVisible(selectors.getByCss(composerSelector).first(), 60_000);
});

test('rests as + / microphone / Send and unfolds to the model selector → microphone → Send', async () => {
  // Dictation is offered only where the deployment has it; the order holds either way.
  const idle = await reachableControls();
  expect(idle).toEqual(idle.includes('Dictate') ? ['Add', 'Dictate', 'Send'] : ['Add', 'Send']);
  expect(await touchTargetMisses()).toEqual([]);

  await target.click(selectors.getByCss(composerSelector).first(), { touch: true });
  await openIosKeyboard();
  await expect.poll(async () => target.isVisible(agentTrigger())).toBe(true);
  const expanded = await reachableControls();
  const tail = expanded.slice(expanded.findIndex((name) => name.startsWith('Agent and model: ')));
  expect(tail).toEqual(idle.includes('Dictate') ? [tail[0], 'Dictate', 'Send'] : [tail[0], 'Send']);
  expect(await touchTargetMisses()).toEqual([]);

  await dismissIosKeyboard();
});

test('opens attachments from + with a tap', async () => {
  await target.click(composer().getByRole('button', { name: 'Add', exact: true }), { touch: true });
  await target.expectVisible(selectors.getByRole('menuitem', { name: 'Attach image or PDF' }));
});
