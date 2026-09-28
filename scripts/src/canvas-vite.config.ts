import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';

import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import type { Plugin, UserConfig } from 'vite';

import { appendReviewEvent, finishReview, readReviewEvents, readReviewThreads } from '#canvas-review.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const artifactsRoot = resolve(repoRoot, 'docs/research/artifacts');

export const resolveCanvasRoot = (input = process.env['TAU_CANVAS_PATH'], allowedRoot = artifactsRoot): string => {
  if (!input) {
    throw new Error('Set TAU_CANVAS_PATH to a directory under docs/research/artifacts');
  }

  const candidate = realpathSync(isAbsolute(input) ? input : resolve(repoRoot, input));
  const pathFromArtifacts = relative(realpathSync(allowedRoot), candidate);
  if (pathFromArtifacts.startsWith('..') || isAbsolute(pathFromArtifacts)) {
    throw new Error('TAU_CANVAS_PATH must be under docs/research/artifacts');
  }
  for (const entry of ['index.html', 'main.tsx']) {
    if (!existsSync(resolve(candidate, entry))) {
      throw new Error(`Canvas is missing ${entry}`);
    }
  }
  return candidate;
};

const sharedStyles = resolve(import.meta.dirname, '../canvas/styles.css');
const reviewLayer = resolve(import.meta.dirname, '../canvas/review-layer.ts');

/** SHA-256 over the canvas's own files (not its review events), so a comment names the revision reviewed. */
const sourceDigest = (root: string): string => {
  const hash = createHash('sha256');
  const walk = (directory: string): void => {
    const entries = readdirSync(directory, { withFileTypes: true }).toSorted((left, right) =>
      left.name.localeCompare(right.name),
    );
    for (const entry of entries) {
      if (entry.name === 'review' || entry.name === 'node_modules' || entry.name.startsWith('.')) {
        continue;
      }
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else {
        hash.update(relative(root, path)).update('\0').update(readFileSync(path));
      }
    }
  };
  walk(root);
  return `sha256:${hash.digest('hex')}`;
};

const reviewer = (root: string): string => {
  try {
    return execFileSync('git', ['config', 'user.name'], { cwd: root, encoding: 'utf8' }).trim() || 'reviewer';
  } catch {
    return 'reviewer';
  }
};

const readBody = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  for await (const chunk of request) {
    chunks.push(chunk as Uint8Array<ArrayBuffer>);
  }
  const text = new TextDecoder().decode(Buffer.concat(chunks));
  return text ? JSON.parse(text) : {};
};

type ReviewReply = readonly [status: number, body: unknown];

const refusedReply = (status: number, code: string, message: string): ReviewReply => [
  status,
  { status: 'refused', code, message },
];

/**
 * The review layer (scripts/canvas/review-layer.ts) and its endpoints. Serve only: a static build has
 * no writer. Requests must be same-origin JSON, so another site open in the browser cannot post to it.
 */
const reviewPlugin = (root: string, allowedRoot: string): Plugin => {
  const artifacts = realpathSync(allowedRoot);
  const target = { canvas: relative(artifacts, root), root: artifacts };

  const threads = async (): Promise<ReviewReply> => {
    const events = readReviewEvents(target);
    let pending = events.length;
    try {
      const tracked = execFileSync('git', ['ls-files', '--', 'review'], { cwd: root, encoding: 'utf8' });
      pending -= tracked.split('\n').filter(Boolean).length;
    } catch {
      // Not in Git: every event is pending, and Finish says why it cannot commit.
    }
    return [
      200,
      { canvas: target.canvas, source: sourceDigest(root), pending, threads: await readReviewThreads(target) },
    ];
  };

  const handle = async (request: IncomingMessage): Promise<ReviewReply> => {
    const site = request.headers['sec-fetch-site'];
    if (site !== undefined && site !== 'same-origin') {
      return refusedReply(403, 'READ_ONLY', 'Review requests must come from the canvas page.');
    }
    if (request.method === 'GET' && request.url === '/threads') {
      return threads();
    }
    if (request.method !== 'POST' || request.headers['content-type'] !== 'application/json') {
      return refusedReply(405, 'INVALID_EVENT', 'POST JSON to /events or /finish.');
    }
    if (request.url === '/events') {
      const body = await readBody(request);
      // The page never names its author: the reviewer is whoever runs this server.
      const event =
        typeof body === 'object' && body !== null
          ? { ...body, author: { kind: 'person', name: reviewer(root) } }
          : body;
      const outcome = await appendReviewEvent({ ...target, event });
      return [outcome.status === 'written' ? 201 : 422, outcome];
    }
    if (request.url === '/finish') {
      const outcome = await finishReview(target);
      return [outcome.status === 'refused' ? 409 : 200, outcome];
    }
    return refusedReply(404, 'INVALID_EVENT', `No review endpoint ${request.url ?? ''}.`);
  };

  const respond = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    let reply: ReviewReply;
    try {
      reply = await handle(request);
    } catch (error) {
      reply = refusedReply(500, 'WRITE_FAILED', error instanceof Error ? error.message : String(error));
    }
    response.statusCode = reply[0];
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(reply[1]));
  };

  return {
    name: 'tau-canvas-review',
    apply: 'serve',
    configureServer: (server) => {
      server.middlewares.use('/__tau/review', (request, response) => {
        // async-iife: bootstrap — connect does not await middleware; respond() settles every error itself.
        void respond(request, response);
      });
    },
    transformIndexHtml: () => [
      { tag: 'script', attrs: { type: 'module', src: `/@fs/${reviewLayer}` }, injectTo: 'body' },
    ],
  };
};

export const createCanvasConfig = (
  canvasRoot = resolveCanvasRoot(),
  outputRoot = resolve(repoRoot, 'out/research/canvas'),
  allowedRoot = artifactsRoot,
): UserConfig => {
  const root = resolveCanvasRoot(canvasRoot, allowedRoot);
  const appRoot = resolve(repoRoot, 'apps/ui/app');
  const uiRoot = resolve(repoRoot, 'packages/ui/src');
  const sourceRoots = [appRoot, realpathSync(allowedRoot)];
  const aliases = new Map<string, string>();
  const aliasesPath = resolve(root, 'canvas.aliases.json');
  if (existsSync(aliasesPath)) {
    const entries: unknown = JSON.parse(readFileSync(aliasesPath, 'utf8'));
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
      throw new Error('canvas.aliases.json must map app # imports to repository-relative fixture files');
    }
    for (const [specifier, target] of Object.entries(entries)) {
      if (!specifier.startsWith('#') || typeof target !== 'string' || isAbsolute(target)) {
        throw new Error('Canvas aliases require # imports and repository-relative fixture paths');
      }
      const fixture = realpathSync(resolve(repoRoot, target));
      if (!fixture.startsWith(`${repoRoot}${sep}`)) {
        throw new Error('Canvas fixture aliases must remain inside the Tau checkout');
      }
      aliases.set(specifier, fixture);
    }
  }
  const styleSources = new Set([
    root,
    // Tailwind must see the shared guide renderer's classes.
    dirname(sharedStyles),
    // …and the app's, because a canvas that imports an app component imports its
    // class strings too. `dockviewStyleOverrides` is the case that proved it: its
    // arbitrary variants live in `dockview.tsx`, so an unscanned app root renders
    // the real Dockview markup with none of the theme that gives it its geometry.
    appRoot,
    ...Array.from(aliases.values(), dirname),
  ]);
  return defineConfig({
    root,
    base: './',
    publicDir: false,
    // One dependency optimizer cache per canvas: canvases served at once from one checkout
    // otherwise rewrite each other's `deps/_metadata.json`, and every page but the last
    // writer's fails with 504 Outdated Optimize Dep.
    cacheDir: resolve(repoRoot, 'node_modules/.vite/canvas', relative(realpathSync(allowedRoot), root)),
    resolve: {
      alias: [
        { find: '@taucad/ui', replacement: resolve(repoRoot, 'packages/ui/src') },
        // Tau's precompiled Shiki grammars, which a guide passes for languages Shiki does not bundle (KCL).
        // Exact match: a string alias would also rewrite the app's `@taucad/grammars/openscad` imports.
        { find: /^@taucad\/grammars$/, replacement: resolve(repoRoot, 'libs/grammars/src/index.ts') },
        // The shared API design guide renderer (create-api skill).
        { find: '@tau/api-guide', replacement: resolve(import.meta.dirname, '../canvas/api-guide.tsx') },
        { find: 'react', replacement: resolve(repoRoot, 'scripts/node_modules/react') },
        { find: 'react-dom', replacement: resolve(repoRoot, 'packages/ui/node_modules/react-dom') },
      ],
    },
    plugins: [
      {
        name: 'tau-canvas-styles',
        enforce: 'pre',
        resolveId: (source, importer) => {
          if (source === 'package.json' && importer?.startsWith(`${appRoot}${sep}`)) {
            return resolve(appRoot, '../package.json');
          }
          if (!source.startsWith('#') || !importer) {
            return undefined;
          }
          // @taucad/ui's own `#*.js` subpath imports map to `./src/*.ts`; its components are `.tsx`.
          if (importer.startsWith(`${uiRoot}${sep}`)) {
            const candidate = resolve(uiRoot, source.slice(1).replace(/\.js$/, ''));
            return ['.ts', '.tsx'].map((extension) => `${candidate}${extension}`).find((path) => existsSync(path));
          }
          if (!sourceRoots.some((directory) => importer.startsWith(`${directory}${sep}`))) {
            return undefined;
          }
          const fixture = aliases.get(source);
          if (fixture) {
            return fixture;
          }
          // Asset imports such as `sprite.svg?raw` keep their query for Vite's asset plugins.
          const [specifier = '', query] = source.split('?');
          const candidate = resolve(appRoot, specifier.slice(1).replace(/\.js$/, ''));
          if (!candidate.startsWith(`${appRoot}${sep}`)) {
            return undefined;
          }
          const found = ['', '.tsx', '.ts']
            .map((extension) => `${candidate}${extension}`)
            .find((path) => existsSync(path));
          return found !== undefined && query !== undefined ? `${found}?${query}` : found;
        },
        transform: {
          order: 'pre',
          handler: (code, id) => {
            if (id.split('?')[0] === sharedStyles) {
              return `${code}\n${Array.from(styleSources, (directory) => `@source ${JSON.stringify(directory)};`).join('\n')}`;
            }
            return undefined;
          },
        },
        transformIndexHtml: {
          order: 'pre',
          handler: () => [
            {
              tag: 'link',
              attrs: { rel: 'stylesheet', href: `/@fs/${sharedStyles}` },
              injectTo: 'head-prepend',
            },
          ],
        },
      },
      tailwindcss(),
      reviewPlugin(root, allowedRoot),
    ],
    server: {
      host: '127.0.0.1',
      strictPort: true,
      fs: { allow: [repoRoot, root] },
    },
    build: {
      outDir: resolve(outputRoot, relative(realpathSync(allowedRoot), root)),
      emptyOutDir: true,
    },
  });
};

const canvasConfig = (): UserConfig => createCanvasConfig();

export default canvasConfig;
