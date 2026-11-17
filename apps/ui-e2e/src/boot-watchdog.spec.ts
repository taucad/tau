/**
 * T-B28.3 (B28): a page whose bundle never runs still offers a way out. With the entry chunk answered 500, the
 * server-rendered document's inline watchdog shows its strip after 20 s; its safe-mode link loads Home with the
 * safe-mode bar, and the first navigation drops `safe=1`, so safe mode lasts one page load.
 */
import { test } from 'vitest';
import { page as selectors } from 'vitest/browser';
import * as target from '#support/external-target.js';

test('shows the boot strip without the bundle and opens Home in safe mode for one page load', async () => {
  await target.commands.uiFailEntryChunk(true);
  await target.navigate('/');

  const strip = selectors.getByCss('#tau-boot-strip');
  await target.expectHidden(strip, 5_000);
  await target.expectVisible(strip, 30_000);
  await target.expectVisible(strip.getByRole('button', { name: 'Reload' }));

  await target.commands.uiFailEntryChunk(false);
  await target.click(strip.getByRole('link', { name: 'Open in safe mode' }));
  await target.expectUrl(/\/\?safe=1$/u, 30_000);

  await target.expectVisible(selectors.getByCss('[data-slot="safe-mode-bar"]'), 60_000);
  await target.expectVisible(selectors.getByCss('[data-slot="sidebar-wrapper"]'));
  await target.expectHidden(strip);

  await target.click(selectors.getByRole('link', { name: 'Projects', exact: true }).first());
  await target.expectUrl(/\/projects$/u, 30_000);
});
