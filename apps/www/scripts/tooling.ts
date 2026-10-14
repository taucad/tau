import { once } from 'node:events';
import type { Server } from 'node:http';
import type { Page } from 'playwright';
import * as esbuild from 'esbuild';
import * as playwright from 'playwright';
import axeCore from 'axe-core';
import type { AxeResults } from 'axe-core';
import sharp from 'sharp';

export async function loadEsbuild(): Promise<typeof esbuild> {
  return esbuild;
}
export async function loadPlaywright(): Promise<typeof playwright> {
  return playwright;
}
export async function loadAxe(): Promise<typeof axeCore> {
  return axeCore;
}
export async function loadSharp(): Promise<typeof sharp> {
  return sharp;
}

/**
 * Run axe-core in a page for the given WCAG tags.
 */
export async function auditPage(page: Page, axe: typeof axeCore, tags: string[]): Promise<AxeResults> {
  // Evaluated over the DevTools protocol, like the Playwright adapter did, so the page's CSP doesn't block it.
  await page.evaluate(axe.source);
  return page.evaluate(
    async (runTags) =>
      globalThis.axe.run(document, {
        runOnly: { type: 'tag', values: runTags },
      }),
    tags,
  );
}

/** @param server */
export async function listenLocal(server: Server): Promise<number> {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected a local TCP listener.');
  }
  return address.port;
}

/** @param server */
export async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Run browser operations on one shared page in their required order.
 */
export async function serial<T>(items: Iterable<T>, run: (item: T) => Promise<void>): Promise<void> {
  for (const item of items) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Each operation consumes the page state produced by its predecessor.
    await run(item);
  }
}
