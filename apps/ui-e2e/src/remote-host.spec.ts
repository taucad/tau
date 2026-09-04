import { describe, expect, test } from 'vitest';
import { page as selectors } from 'vitest/browser';

import * as target from '#support/external-target.js';

describe('remote host browser transport', () => {
  test('renders through the production runtime host and both relayed WebSocket routes', async () => {
    const url = await target.startHostFixture();
    await target.navigate(`/__e2e/remote-host?url=${encodeURIComponent(url)}`);
    const result = selectors.getByTestId('remote-host-result');
    await target.waitFor(
      () => Boolean(document.querySelector('[data-testid="remote-host-result"], [role="alert"]')),
      undefined,
      { timeout: 120_000 },
    );
    const alert = selectors.getByRole('alert');
    if (await target.isVisible(alert)) {
      throw new Error(`${await target.textContent(alert)}\n${JSON.stringify(await target.events(), null, 2)}`);
    }

    const bytes = Number(await target.getAttribute(result, 'data-bytes'));
    const hash = await target.getAttribute(result, 'data-hash');
    expect(bytes).toBeGreaterThan(0);
    expect(hash).toMatch(/^[a-f0-9]{64}$/u);
    await target.screenshot(result, 'remote-host-connected');
    const browser = await target.evaluate(() => navigator.userAgent);
    const engine = browser.includes('Firefox')
      ? 'firefox'
      : browser.includes('AppleWebKit') && !browser.includes('Chrome')
        ? 'webkit'
        : 'chromium';
    await target.writeArtifact(
      `remote-host-${engine}.json`,
      `${JSON.stringify({ browser, bytes, hash, url: await target.currentUrl() }, null, 2)}\n`,
    );
  });
});
