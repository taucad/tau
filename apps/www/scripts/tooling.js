import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { once } from 'node:events';

const dependencyRoot = process.env.WWW_RENDER_TOOLS;
const resolveTool = createRequire(dependencyRoot ? join(resolve(dependencyRoot), 'package.json') : import.meta.url);

/** Resolve the explicitly selected, locally installed build dependency. */
export async function loadEsbuild() {
  /** @type {unknown} */
  const module = await import(pathToFileURL(resolveTool.resolve('esbuild')).href);
  // This boundary resolves the installed package by its fixed name, not user data.
  return /** @type {typeof import('esbuild')} */ (module);
}

/** Resolve the explicitly selected browser test dependency. */
export async function loadPlaywright() {
  /** @type {unknown} */
  const module = await import(pathToFileURL(resolveTool.resolve('playwright')).href);
  return /** @type {{default: typeof import('playwright')}} */ (module).default;
}

/** Resolve the explicitly selected accessibility test dependency. */
export async function loadAxe() {
  /** @type {unknown} */
  const module = await import(pathToFileURL(resolveTool.resolve('axe-core')).href);
  return /** @type {{default: typeof import('axe-core')}} */ (module).default;
}

/**
 * Run axe-core in a page for the given WCAG tags.
 * @param {import('playwright').Page} page
 * @param {typeof import('axe-core')} axe
 * @param {string[]} tags
 * @returns {Promise<import('axe-core').AxeResults>}
 */
export async function auditPage(page, axe, tags) {
  // Evaluated over the DevTools protocol, like the Playwright adapter did, so the page's CSP doesn't block it.
  await page.evaluate(axe.source);
  return page.evaluate(
    async (runTags) =>
      /** @type {{axe: typeof import('axe-core')}} */ (/** @type {unknown} */ (globalThis)).axe.run(document, {
        runOnly: { type: 'tag', values: runTags },
      }),
    tags,
  );
}

/** Resolve the explicitly selected image-processing dependency. */
export async function loadSharp() {
  /** @type {unknown} */
  const module = await import(pathToFileURL(resolveTool.resolve('sharp')).href);
  return /** @type {{default: typeof import('sharp')}} */ (module).default;
}

/** @param {import('node:http').Server} server */
export async function listenLocal(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected a local TCP listener.');
  }
  return address.port;
}

/** @param {import('node:http').Server} server */
export async function closeServer(server) {
  await new Promise((resolve, reject) => {
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
 * @template T
 * @param {Iterable<T>} items
 * @param {(item: T) => Promise<void>} run
 * @returns {Promise<void>}
 */
export async function serial(items, run) {
  for (const item of items) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Each operation consumes the page state produced by its predecessor.
    await run(item);
  }
}
