import { describe, expect, it, vi } from 'vitest';
import type { BrowserCommandContext } from 'vitest/node';
import { runGeospecPreview } from '#e2e/browser-command.js';

const commandContext = (page: Record<string, unknown>, provider = 'playwright'): BrowserCommandContext => {
  const context = {
    context: { newPage: vi.fn().mockResolvedValue(page) },
    provider: { name: provider },
  };
  return context as unknown as BrowserCommandContext;
};

describe('GeoSpec preview browser command', () => {
  it('rejects non-Playwright providers before opening a page', async () => {
    await expect(runGeospecPreview(commandContext({}, 'webdriverio'))).rejects.toThrow(
      "GeoSpec browser E2E requires the Playwright provider, received 'webdriverio'.",
    );
  });

  it.each([
    ['navigation', { goto: vi.fn().mockRejectedValue(new Error('navigation failed')) }],
    [
      'report wait',
      {
        goto: vi.fn().mockResolvedValue({ headers: vi.fn().mockReturnValue({}) }),
        waitForFunction: vi.fn().mockRejectedValue(new Error('report failed')),
      },
    ],
  ])('closes the page when %s fails', async (_, operation) => {
    const close = vi.fn().mockResolvedValue(undefined);
    const page = {
      close,
      evaluate: vi.fn(),
      on: vi.fn(),
      waitForFunction: vi.fn(),
      ...operation,
    };

    await expect(runGeospecPreview(commandContext(page))).rejects.toThrow(/failed/u);
    expect(close).toHaveBeenCalledOnce();
  });
});
