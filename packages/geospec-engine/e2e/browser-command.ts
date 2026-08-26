import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { BrowserCommand } from 'vitest/node';
import type { BrowserEngineReport } from '#e2e/fixture/main.js';

export const geospecBaseURL = 'http://127.0.0.1:4330';
export const geospecServerLog = resolve(
  import.meta.dirname,
  '../../../out/test-results/vitest-browser/packages/geospec-engine/server.log',
);

export type GeoSpecPreviewResult = {
  readonly consoleErrors: readonly string[];
  readonly crossOriginIsolated: boolean;
  readonly headers: Readonly<Record<string, string>>;
  readonly pageErrors: readonly string[];
  readonly report: BrowserEngineReport;
  readonly serverLog?: string;
  readonly sharedArrayBuffer: boolean;
};

declare module 'vitest/browser' {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- Module augmentation must merge Vitest's interface.
  interface BrowserCommands {
    runGeospecPreview(): Promise<GeoSpecPreviewResult>;
  }
}

const readServerLog = async (): Promise<string | undefined> => {
  try {
    return await readFile(geospecServerLog, 'utf8');
  } catch {
    return undefined;
  }
};

export const runGeospecPreview: BrowserCommand<never[], GeoSpecPreviewResult> = async (commandContext) => {
  if (commandContext.provider.name !== 'playwright') {
    throw new TypeError(
      `GeoSpec browser E2E requires the Playwright provider, received '${commandContext.provider.name}'.`,
    );
  }

  const page = await commandContext.context.newPage();
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  try {
    const response = await page.goto(geospecBaseURL, { waitUntil: 'domcontentloaded' });
    if (!response) {
      throw new Error('GeoSpec preview navigation did not return a document response.');
    }
    await page.waitForFunction(() => Reflect.has(globalThis, '__geospecBrowserReport'), undefined, {
      timeout: 120_000,
    });

    const runtime = await page.evaluate(() => ({
      crossOriginIsolated,
      report: Reflect.get(globalThis, '__geospecBrowserReport') as BrowserEngineReport,
      sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    }));

    return {
      consoleErrors,
      crossOriginIsolated: runtime.crossOriginIsolated,
      headers: response.headers(),
      pageErrors,
      report: runtime.report,
      serverLog: await readServerLog(),
      sharedArrayBuffer: runtime.sharedArrayBuffer,
    };
  } finally {
    await page.close();
  }
};
