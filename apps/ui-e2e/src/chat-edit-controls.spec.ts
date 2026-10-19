import { expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';
import type { GatewayScriptTurn } from '#support/agent-host-gateway-script.js';
import { composerSelector, prepareComposerPage, sendDraft } from '#support/chat-attachments.js';
import { iosViewport } from '#support/ios-keyboard.js';

/**
 * Every control in a message's edit box opens its menu or sheet and keeps the edit open. WebKit
 * (Safari on iOS and macOS) never focuses a button it clicks: the editor blurs and focus lands on
 * the page body, which the edit box used to read as the user leaving it.
 */

const sentText = 'Continue this build.';
const replyText = 'Edit reply.';
const replyScript: readonly GatewayScriptTurn[] = [{ text: replyText, usage: { inputTokens: 20, outputTokens: 3 } }];
const editComposer = '[data-chat-composer="edit"]';

const surfaces = [
  { label: 'kernel selector', control: '[aria-label^="Select kernel"]' },
  { label: 'agent and model sheet', control: '[aria-label^="Agent and model"]' },
  { label: 'add menu', control: '[aria-label="Add"]' },
] as const;

const layouts = [
  { layout: 'phone', viewport: iosViewport, touch: true },
  { layout: 'desktop', viewport: { width: 1440, height: 960 }, touch: false },
] as const;

/** WebKit's click focus: a pressed button takes no focus, so the focused editor blurs to the body. */
const installWebKitButtonFocus = async (): Promise<void> =>
  target.addInitScript(() => {
    document.addEventListener(
      'mousedown',
      (event) => {
        const pressed = event.target instanceof Element ? event.target : undefined;
        if (pressed?.closest('button, [role="button"], [role="combobox"]')) {
          event.preventDefault();
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
        }
      },
      true,
    );
  });

/** The menu, popover or drawer a control opened, other than the editor's own drawer. */
const openSurfaceCount = async (): Promise<number> =>
  target.evaluate(
    () =>
      [
        ...document.querySelectorAll(
          '[data-slot="popover-content"], [role="menu"], [role="dialog"][data-slot="drawer-content"]',
        ),
      ].filter(
        (element) => element.getBoundingClientRect().height > 0 && !element.querySelector('[data-chat-composer]'),
      ).length,
  );

test.each(layouts.flatMap((layout) => surfaces.map((surface) => ({ ...layout, ...surface }))))(
  'keeps the $layout edit box open while its $label opens',
  async ({ viewport, touch, control }) => {
    if (touch) {
      await target.commands.uiOpenTarget({ hasTouch: true, isMobile: true });
    }
    await prepareComposerPage();
    await installWebKitButtonFocus();
    await target.installAgentHostGatewayFixture(replyScript);
    await target.setViewport(viewport);
    await target.navigate('/__e2e/chat-attachments');
    await target.expectUrl(/\/w\/[^/]+\/[^/?]+\?/u, 60_000);
    await target.expectVisible(selectors.getByCss(composerSelector).first(), 60_000);

    await sendDraft(sentText);
    await target.expectVisible(selectors.getByText(replyText, { exact: true }).last(), 120_000);
    await target.click(selectors.getByCss('article').getByText(sentText, { exact: true }).first(), { touch });
    const edit = selectors.getByCss(editComposer).first();
    await target.expectVisible(edit);

    await target.click(selectors.getByCss(`${editComposer} ${control}`).first(), { touch });
    // The edit box used to unmount a few frames after the press, taking the surface with it.
    await target.evaluate(
      async () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, 1000);
        }),
    );
    expect(await target.isVisible(edit)).toBe(true);
    expect(await openSurfaceCount()).toBeGreaterThan(0);
  },
);
