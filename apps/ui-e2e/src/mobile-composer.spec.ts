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

/**
 * Touch targets (I3, T5/T6): each visible control takes a tap 5px outside each edge (inside its 6px
 * ring) and no neighbour does, and controls in one row sit at least 12px apart, so rings never overlap.
 */
const touchTargetMisses = async (): Promise<readonly string[]> =>
  target.evaluateLocator(
    composer(),
    async (region, barSelector: string) => {
      // Let the row's fold and padding settle before measuring. Scroll-driven animations (the scroll shadows) follow
      // their scroller and never finish, so wait only on those that run in time; one cancelled as its element leaves
      // (a loading spinner) has settled too.
      await Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation.timeline === document.timeline)
          .map(async (animation) => animation.finished.catch(() => undefined)),
      );
      const misses: string[] = [];
      const buttons = [...region.querySelectorAll<HTMLButtonElement>(`${barSelector} button`)].filter((button) =>
        button.checkVisibility({ visibilityProperty: true, opacityProperty: true }),
      );
      if (buttons.length < 2) {
        misses.push(`only ${buttons.length} reachable controls`);
      }
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
      const rows = new Map<number, DOMRect[]>();
      for (const button of buttons) {
        const box = button.getBoundingClientRect();
        const key = Math.round(box.top / 8);
        rows.set(key, [...(rows.get(key) ?? []), box]);
      }
      for (const row of rows.values()) {
        const boxes = row.toSorted((first, second) => first.left - second.left);
        for (const [index, box] of boxes.slice(1).entries()) {
          const gap = box.left - boxes[index]!.right;
          if (gap < 11.5) {
            misses.push(`gap ${gap}px before the control at ${box.left}`);
          }
        }
      }
      return misses;
    },
    bar,
  );

/** Taps 2px inside the resting editor's edges, which must reach the editor, not a control's ring. */
const editorEdgeHits = async (): Promise<readonly string[]> =>
  target.evaluateLocator(selectors.getByCss(composerSelector).first(), async (editor) => {
    // Scroll-driven animations never finish, so wait only on those that run in time; a cancelled one has settled.
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.timeline === document.timeline)
        .map(async (animation) => animation.finished.catch(() => undefined)),
    );
    const box = editor.getBoundingClientRect();
    const y = box.top + box.height / 2;
    return [box.left + 2, box.right - 2].map((x) => {
      const hit = document.elementFromPoint(x, y);
      return hit?.closest('button')?.ariaLabel ?? (editor.contains(hit) ? 'editor' : (hit?.tagName ?? 'nothing'));
    });
  });

beforeEach(async () => {
  await target.commands.uiOpenTarget({ hasTouch: true, isMobile: true });
  await prepareComposerPage();
  await installIosKeyboard();
  await target.setViewport(iosViewport);
  await target.navigate('/__e2e/chat-attachments');
  await target.expectUrl(/\/w\/[^/]+\/[^/?]+\?/u, 60_000);
  // A project opens on the model stage (Option B); the composer lives on the Chat surface.
  await target.click(
    selectors.getByRole('navigation', { name: 'Workbench' }).getByRole('button', { name: 'Chat', exact: true }),
    { touch: true },
  );
  await target.expectVisible(selectors.getByCss(composerSelector).first(), 60_000);
  // The spec guards touch rules on its own: this context must report a coarse pointer.
  expect(await target.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
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

test('leaves a tap just inside the resting editor’s edges to the editor', async () => {
  expect(await editorEdgeHits()).toEqual(['editor', 'editor']);
});

/** The hints matching `selector`: how many render, and the text of any a person can see. */
const hintsMatching = async (
  selector: string,
): Promise<{ readonly count: number; readonly shown: readonly string[] }> =>
  target.evaluate((hintSelector: string) => {
    const hints = [...document.querySelectorAll<HTMLElement>(hintSelector)];
    return {
      count: hints.length,
      shown: hints.filter((hint) => getComputedStyle(hint).display !== 'none').map((hint) => hint.textContent),
    };
  }, selector);

test('shows no keyboard hints on a touch screen (I7)', async () => {
  // Focus opens Send's tooltip, which carries the Enter chip for keyboards.
  await target.evaluateLocator(composer().getByRole('button', { name: 'Send', exact: true }), (send) => {
    (send as HTMLElement).focus();
  });
  await target.expectVisible(selectors.getByCss('[data-slot="tooltip-content"]'));
  const tooltipHints = await hintsMatching('[data-slot="tooltip-content"] span[class*="tracking-"]');
  expect(tooltipHints.count).toBeGreaterThan(0);
  expect(tooltipHints.shown).toEqual([]);

  await target.click(composer().getByRole('button', { name: 'Add', exact: true }), { touch: true });
  await target.expectVisible(selectors.getByRole('menuitem', { name: 'Add context' }));
  const menuHints = await hintsMatching('[data-slot="dropdown-menu-shortcut"]');
  expect(menuHints.count).toBeGreaterThan(0);
  expect(menuHints.shown).toEqual([]);
});
