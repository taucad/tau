import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { launchDesktopApp } from '#support/desktop-app.js';

/** Delay only record replies, after real authority application; all other traffic remains live. */
const installReplyGate = (): void => {
  type Frame = { k?: string; n?: string; i?: string; a?: Array<{ path?: string }> };
  const requests = new WeakMap<MessagePort, Set<string>>();
  const held: Array<() => void> = [];
  let armed = false;
  const post = MessagePort.prototype.postMessage;
  const add = MessagePort.prototype.addEventListener;
  const remove = MessagePort.prototype.removeEventListener;
  const wrappers = new WeakMap<EventListenerOrEventListenerObject, EventListener>();
  MessagePort.prototype.postMessage = function (this: MessagePort, message, options): void {
    const frame = message as Frame | undefined;
    if (
      armed &&
      frame?.k === 'rq' &&
      frame.n === 'writeFileChecked' &&
      frame.i &&
      frame.a?.[0]?.path?.endsWith('.tau/workbench/layout.json')
    ) {
      const ids = requests.get(this) ?? new Set<string>();
      ids.add(frame.i);
      requests.set(this, ids);
    }
    post.call(this, message, Array.isArray(options) ? { transfer: options } : options);
  };
  // oxlint-disable-next-line max-params -- Preserve the native EventTarget signature (including this).
  MessagePort.prototype.addEventListener = function (
    this: MessagePort,
    type: string,
    // oxlint-disable-next-line no-restricted-types -- Native EventTarget accepts a null listener.
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (!listener) {
      return;
    }
    if (type !== 'message') {
      add.call(this, type, listener, options);
      return;
    }
    const wrapped: EventListener = (event) => {
      const frame = (event as MessageEvent<Frame | undefined>).data;
      const deliver = (): void => {
        if (typeof listener === 'function') {
          listener.call(this, event);
        } else {
          listener.handleEvent(event);
        }
      };
      if (armed && frame?.k === 'rs' && frame.i && requests.get(this)?.has(frame.i)) {
        if (held.length >= 16) {
          throw new Error('Record reply fixture exceeded its bound');
        }
        held.push(deliver);
      } else {
        deliver();
      }
    };
    wrappers.set(listener, wrapped);
    add.call(this, type, wrapped, options);
  };
  // oxlint-disable-next-line max-params -- Preserve the native EventTarget signature (including this).
  MessagePort.prototype.removeEventListener = function (
    this: MessagePort,
    type: string,
    // oxlint-disable-next-line no-restricted-types -- Native EventTarget accepts a null listener.
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void {
    if (listener) {
      remove.call(this, type, wrappers.get(listener) ?? listener, options);
    }
  };
  Reflect.set(globalThis, '__tauRecordReplyGate', {
    arm: () => {
      armed = true;
    },
    pending: () => held.length,
    release: () => {
      armed = false;
      for (const deliver of held.splice(0)) {
        deliver();
      }
    },
  });
};

test('should retain record intent through direct close and quit, then finish only after confirmed retry', async () => {
  const session = await launchDesktopApp({
    token: 'offline-record-recovery',
    packaged: process.env['TAU_E2E_RECORD_PACKAGED'] === 'true',
  });
  const { page } = session;
  const control = async (action: 'arm' | 'pending' | 'release'): Promise<number | void> =>
    page.evaluate((action) => {
      const gate = Reflect.get(globalThis, '__tauRecordReplyGate') as {
        arm(): void;
        pending(): number;
        release(): void;
      };
      return gate[action]();
    }, action);
  const closeProject = async (): Promise<void> => {
    await page.getByRole('button', { name: 'More actions for Record reliability', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Close Record reliability', exact: true }).click();
  };
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(installReplyGate);
    await page.goto('app://tau/projects/new');
    await page.getByLabel('Project Name *').fill('Record reliability');
    await page.getByRole('button', { name: /^Create Project/u }).click();
    await page.waitForURL(/\/w\//u, { timeout: 60_000 });
    const projectUrl = page.url();
    const layoutPath = join(session.homeRoot, 'record-reliability', '.tau/workbench/layout.json');
    await expect.poll(async () => readFile(layoutPath, 'utf8'), { timeout: 60_000 }).toContain('"version"');
    await writeFile(layoutPath, '{broken');
    await page.reload();
    const issue = page.getByRole('button', { name: 'Settings not applied · 1 record', exact: true });
    await issue.waitFor({ state: 'visible', timeout: 60_000 });
    await issue.focus();
    await page.keyboard.press('Enter');
    await expect
      .poll(async () => page.getByRole('listitem', { name: 'Pane layout', exact: true }).textContent())
      .toContain('The file could not be applied');
    await page.getByRole('button', { name: 'More actions for Pane layout', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    const reset = page.getByRole('alertdialog').getByRole('button', { name: 'Reset settings', exact: true });
    await reset.focus();
    await page.keyboard.press('Enter');
    await issue.waitFor({ state: 'hidden', timeout: 15_000 });
    await expect
      .poll(async () => page.evaluate(() => document.activeElement?.getAttribute('aria-label')), { timeout: 5000 })
      .toBe('Share');
    const share = page.getByLabel('Share', { exact: true });
    expect(
      await share.evaluate((element) => getComputedStyle(element).getPropertyValue('-webkit-app-region')),
    ).not.toBe('drag');
    expect(await page.getByText(/Bridge call .+ timed out/u).count()).toBe(0);
    await session.capture('record-reset-focus');

    await control('arm');
    await page.getByLabel('Export', { exact: true }).click();
    await expect.poll(async () => control('pending'), { timeout: 60_000 }).toBeGreaterThan(0);
    const appliedBeforeReply = await readFile(layoutPath, 'utf8');
    await closeProject();
    await page
      .getByRole('button', { name: 'Save not confirmed · 1 record', exact: true })
      .waitFor({ state: 'visible', timeout: 15_000 });
    // Wait beyond the close-confirmation bound, while the original reply is still withheld.
    await expect
      .poll(async () => readFile(session.logPath, 'utf8'), { timeout: 15_000 })
      .toContain('[filesystem-bridge]');
    await page.waitForTimeout(10_500);
    expect(await share.isVisible()).toBe(true);
    expect(await page.getByRole('heading', { name: 'Project closed', exact: true }).count()).toBe(0);
    await session.capture('record-direct-close-refusal');
    await control('release');
    await page
      .getByRole('button', { name: 'Save not confirmed · 1 record', exact: true })
      .waitFor({ state: 'hidden', timeout: 15_000 });
    expect(await readFile(layoutPath, 'utf8')).toBe(appliedBeforeReply);
    expect(await share.isVisible()).toBe(true);
    await closeProject();
    await page
      .getByRole('heading', { name: 'Project closed', exact: true })
      .waitFor({ state: 'visible', timeout: 60_000 });

    await page.goto(projectUrl);
    await share.waitFor({ state: 'visible', timeout: 60_000 });
    await control('arm');
    await share.click();
    await expect.poll(async () => control('pending'), { timeout: 60_000 }).toBeGreaterThan(0);
    const beforeQuit = await readFile(layoutPath, 'utf8');
    await session.application.evaluate(({ app }) => {
      app.quit();
    });
    await page
      .getByText('Pane layout is not confirmed saved.', { exact: true })
      .waitFor({ state: 'visible', timeout: 15_000 });
    await session.capture('record-quit-refusal');
    await control('release');
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect
      .poll(async () => readFile(session.logPath, 'utf8'), { timeout: 60_000 })
      .toMatch(/main\.renderer-quiesce.*quiesced/u);
    expect(await readFile(layoutPath, 'utf8')).toBe(beforeQuit);
    const log = await readFile(session.logPath, 'utf8');
    expect(log).toContain('round-trip');
    expect(log).toContain('pending');
    expect(log).toContain('resolved');
  } catch (error) {
    await session.capture('record-recovery-failure').catch(() => undefined);
    throw error;
  } finally {
    await control('release').catch(() => undefined);
    await session.close();
  }
});
