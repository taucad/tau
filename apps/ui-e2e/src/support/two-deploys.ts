/**
 * Two deploys of one built UI behind one origin (TAU-UI-6, progressive loading PL7): the previous deploy is the build
 * in `apps/ui/build`, the next one the same server bundle copied under a later build id, with its own project shell and
 * service worker. `deploy()` makes the next one live: a request carrying the previous deploy's cookie for a hashed file
 * the next deploy does not have gets Netlify's deleted-asset answer, a request with no deploy cookie (the worker's
 * precache) reaches the live deploy, and project URLs get the live deploy's prerendered shell, as Netlify answers them
 * (PL3).
 *
 * `prepareDeploys(name, { rename })` makes the next deploy a different client build, as a real one is: a copy of the
 * client output in which the chunks the pattern matches, and every hashed file that names one of them, are renamed to a
 * fixed point, with the next build id written into every file; its worker precaches the new names. Each deploy then
 * serves its own files, and `retain` makes the live deploy serve the previous deploy's too (`retain-previous-assets.mts`).
 *
 * The server can inject faults (`inject`): for one URL, reset the connection or answer 404, only for requests with
 * given `Sec-Fetch-Dest` values and for the next N of them. Keyed on `Sec-Fetch-Dest: empty`, a fault fails exactly the
 * requests a service worker makes, which carry no destination, and lets the page's own (`script`, `document`) through,
 * as a content blocker's rule that exempts scripts does (Brain `research/pl7-service-worker-staging-defects-blueprint.md`,
 * Finding 2). It is server side so the browser's HTTP cache stays on: a Playwright `route` turns it off, and with it
 * every cache-first shell (Finding 7g). Every request is recorded with its fetch metadata (`requests`).
 *
 * Shared by `stale-deploy-recovery.test.ts` and `service-worker-boot.test.ts` (merge-queue suite
 * `test:e2e:deploy-skew`) and `service-worker-deploy.test.ts` (nightly suite `test:e2e:service-worker`).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { cp, link, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { createRequestHandler } from '@react-router/express';
import { coiMiddleware } from '@taucad/runtime/cross-origin-isolation/express';
import { chromium } from 'playwright';
import type { BrowserContext, Page } from 'playwright';

export type Deploy = 'previous' | 'next';
export type ServerBuild = Parameters<typeof createRequestHandler>[0]['build'];

export const buildRoot = resolve(import.meta.dirname, '../../../ui/build');
export const clientRoot = join(buildRoot, 'client');
const uiRoot = resolve(import.meta.dirname, '../../../ui');
const deployCookie = 'tau-e2e-deploy';
/** Where the service worker precaches the project shell from, and the worker itself. */
export const projectShellUrl = '/w/__shell/__shell/index.html';
const serviceWorkerUrl = '/service-worker.js';
/** The retired `/usage` worker's URL, where every PL7 build ships the retiring worker. */
const retiredServiceWorkerUrl = '/offline-shell-worker.js';
const projectUrl = /^\/w\/[^/.]+\/[^/.]+\/?$/u;
const heldChunk = /^\/assets\/example-command-items-[\w-]+\.js$/u;
/** Milliseconds between the two deploys' build ids. */
export const deployGap = 60_000;
/** A content-hashed build file: `/assets/<name>-<hash>.<extension>`. */
const hashedAsset = /^(?<stem>.+)-(?<hash>[\w-]{8,})(?<extension>\.[a-z\d]+)$/u;
/** Files whose text can name another file of the build; everything else (wasm, images, fonts, maps) is copied as is. */
const textExtensions = new Set(['.js', '.mjs', '.css', '.html', '.json', '.data', '.webmanifest', '.txt', '.svg']);

/** What Netlify answers for a hashed asset the live deploy does not have. */
const sendDeletedAsset = (response: Response): void => {
  response
    .status(404)
    .type('text/html')
    .set('Cache-Control', 'no-cache')
    .send('<!DOCTYPE html><title>Not Found</title>');
};

export const readBuildId = (html: string): number => {
  const match = /TAU_BUILD_ID\\?":\\?"(\d+)/u.exec(html);
  if (match?.[1] === undefined) {
    throw new Error('The rendered document publishes no TAU_BUILD_ID.');
  }
  return Number(match[1]);
};

/** Each deploy's project shell: each client output's prerendered file, under its deploy's build id. */
export const readShells = async (
  previousBuildId: number,
  nextBuildId: number,
  roots: ClientRoots = sameClientRoots,
): Promise<Record<Deploy, string>> => {
  const previous = await readFile(join(roots.previous, projectShellUrl.slice(1)), 'utf8');
  if (readBuildId(previous) !== previousBuildId) {
    throw new Error('The prerendered project shell carries another build id than the server bundle it was built with.');
  }
  const next = await readFile(join(roots.next, projectShellUrl.slice(1)), 'utf8');
  return { previous, next: next.replaceAll(String(previousBuildId), String(nextBuildId)) };
};

/** `{"revision":"<hex>","url":"<path>"}`, a revisioned entry of the precache list `injectManifest` wrote. */
const revisionedEntry = /\{"revision":"(?<revision>[\da-f]+)","url":"(?<url>[^"]+)"\}/gu;

/**
 * Each deploy's service worker: the build's own for the previous deploy, and for the next one the same worker whose
 * precache names the next deploy's files (renamed, when its chunks were) and each document by the content revision of
 * the next deploy's copy, as a new build's worker does.
 */
export const readWorkers = async (
  shells: Readonly<Record<Deploy, string>>,
  rename: (text: string) => string = (text) => text,
  roots: ClientRoots = sameClientRoots,
): Promise<{ scripts: Record<Deploy, string>; shellRevisions: Record<Deploy, string> }> => {
  const previous = await readFile(join(roots.previous, serviceWorkerUrl.slice(1)), 'utf8');
  const shellRevisions: Partial<Record<Deploy, string>> = {};
  const next = rename(previous).replaceAll(revisionedEntry, (entry, revision: string, url: string) => {
    const bytes = url === projectShellUrl ? shells.next : readFileSync(join(roots.next, url.slice(1)));
    const nextRevision = createHash('sha256').update(bytes).digest('hex').slice(0, revision.length);
    if (url === projectShellUrl) {
      shellRevisions.previous = revision;
      shellRevisions.next = nextRevision;
    }
    return entry.replace(revision, nextRevision);
  });
  if (shellRevisions.previous === undefined || shellRevisions.next === undefined) {
    throw new Error('The built service worker does not precache the project shell.');
  }
  return {
    scripts: { previous, next },
    shellRevisions: { previous: shellRevisions.previous, next: shellRevisions.next },
  };
};

/**
 * Copy the previous deploy's server bundle as the next deploy: the same code under a later build id, naming the next
 * deploy's renamed files.
 *
 * @param options - `nextServerRoot`: where the copy goes, beside `server/`, so it resolves the same externals and
 *   `../client` assets; both build ids; and the rewrite of the next deploy's renamed files.
 */
const createNextDeploy = async ({
  nextServerRoot,
  previousBuildId,
  nextBuildId,
  rename,
}: Readonly<{
  nextServerRoot: string;
  previousBuildId: number;
  nextBuildId: number;
  rename: (text: string) => string;
}>): Promise<void> => {
  await rm(nextServerRoot, { recursive: true, force: true });
  await cp(join(buildRoot, 'server'), nextServerRoot, { recursive: true });
  const entries = await readdir(nextServerRoot, { recursive: true });
  const scripts = entries.filter((name) => name.endsWith('.js'));
  const replaced = await Promise.all(
    scripts.map(async (name) => {
      const path = join(nextServerRoot, name);
      const source = await readFile(path, 'utf8');
      const written = rename(source.replaceAll(String(previousBuildId), String(nextBuildId)));
      if (written === source) {
        return false;
      }
      await writeFile(path, written);
      return source.includes(String(previousBuildId));
    }),
  );
  if (!replaced.includes(true)) {
    throw new Error(`Build id ${String(previousBuildId)} does not occur in the server bundle.`);
  }
};

/** A token that may be, or end in, a hashed file's base name. */
const hashedToken = /[\w.-]+-[\w-]{8,}\.[a-z\d]+/gu;

/** A new content hash for a renamed file, of the old one's length and alphabet, fixed for a name. */
const renamedHash = (name: string, length: number): string =>
  createHash('sha256').update(`next:${name}`).digest('base64url').replaceAll(/[-_]/gu, 'x').slice(0, length);

/**
 * The next deploy's client output: a copy of the build's (hard links for every file it does not change), in which each
 * hashed file `pattern` matches, and every hashed file whose text names one, is renamed (to a fixed point, as a real
 * build's content hashes would change), every text file names the new names, and every text file carries the next
 * build id.
 *
 * @param options - Where the copy goes, which files to rename, and both build ids.
 * @returns The rename map and the rewrite to apply to any other text of the build (the worker, the server bundle).
 */
const createRenamedClient = async ({
  nextClientRoot,
  pattern,
  previousBuildId,
  nextBuildId,
}: Readonly<{
  nextClientRoot: string;
  pattern: RegExp;
  previousBuildId: number;
  nextBuildId: number;
}>): Promise<{ readonly rename: (text: string) => string; readonly renamed: ReadonlyMap<string, string> }> => {
  await rm(nextClientRoot, { recursive: true, force: true });
  const entries = await readdir(clientRoot, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(clientRoot.length + 1));
  const isText = (file: string): boolean =>
    [...textExtensions].some((extension) => file.endsWith(extension)) && !file.endsWith('.map');
  const texts = new Map(
    await Promise.all(
      files
        .filter((candidate) => isText(candidate))
        .map(async (file) => [file, await readFile(join(clientRoot, file), 'utf8')] as const),
    ),
  );
  const hashedFiles = files.filter((file) => file.startsWith('assets/') && hashedAsset.test(basename(file)));
  /** Old base name to new base name. */
  const names = new Map<string, string>();
  const renameFile = (file: string): void => {
    const groups = hashedAsset.exec(basename(file))?.groups;
    if (groups?.['stem'] !== undefined && groups['hash'] !== undefined && groups['extension'] !== undefined) {
      names.set(
        basename(file),
        `${groups['stem']}-${renamedHash(basename(file), groups['hash'].length)}${groups['extension']}`,
      );
    }
  };
  // Which hashed files name each hashed file, read once: the rename spreads along these edges to a fixed point.
  const hashedNames = new Set(hashedFiles.map((file) => basename(file)));
  const namedBy = new Map<string, string[]>();
  for (const file of hashedFiles) {
    for (const match of (texts.get(file) ?? '').matchAll(hashedToken)) {
      for (let start = 0; start < match[0].length; start += 1) {
        // A name inside a longer token (a path, a prefix glued on by minification) still names the file.
        const candidate = match[0].slice(start);
        if (hashedNames.has(candidate) && candidate !== basename(file)) {
          namedBy.set(candidate, [...(namedBy.get(candidate) ?? []), file]);
          break;
        }
      }
    }
  }
  const pending = hashedFiles.filter((candidate) => pattern.test(`/${candidate}`));
  if (pending.length === 0) {
    throw new Error(`No hashed build file matches ${String(pattern)}.`);
  }
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (names.has(basename(file))) {
      continue;
    }
    renameFile(file);
    pending.push(...(namedBy.get(basename(file)) ?? []));
  }
  const rename = (text: string): string =>
    text.replaceAll(hashedToken, (token) => {
      for (let start = 0; start < token.length; start += 1) {
        const renamedName = names.get(token.slice(start));
        if (renamedName !== undefined) {
          return `${token.slice(0, start)}${renamedName}`;
        }
      }
      return token;
    });
  const targetOf = (file: string): string =>
    join(nextClientRoot, dirname(file), names.get(basename(file)) ?? basename(file));
  const directories = new Set(files.map((file) => dirname(targetOf(file))));
  await Promise.all([...directories].map(async (directory) => mkdir(directory, { recursive: true })));
  await Promise.all(
    files.map(async (file) => {
      const text = texts.get(file);
      const written =
        text === undefined ? undefined : rename(text.replaceAll(String(previousBuildId), String(nextBuildId)));
      await (written === undefined || written === text
        ? link(join(clientRoot, file), targetOf(file))
        : writeFile(targetOf(file), written));
    }),
  );
  const renamed = new Map(
    [...names].map(([from, to]) => {
      const file = hashedFiles.find((candidate) => basename(candidate) === from) ?? from;
      return [`/${file}`, `/${join(dirname(file), to)}`];
    }),
  );
  return { rename, renamed };
};

export const importServerBuild = async (root: string): Promise<ServerBuild> =>
  (await import(pathToFileURL(join(root, 'index.js')).href)) as ServerBuild;

/** How an injected fault answers a request it matches. */
export type FaultAnswer = 'reset' | 'not-found';

/** A fault the server injects (`DeployServer.inject`). */
export type Fault = Readonly<{
  /** The URL path it applies to: exactly, or by pattern. */
  path: string | RegExp;
  answer: FaultAnswer;
  /** Only requests with one of these `Sec-Fetch-Dest` values (a worker's own requests carry `empty`); unset, all. */
  destination?: readonly string[];
  /** Only the next N matching requests; unset, every one until removed. */
  times?: number;
}>;

/** One request the server received, with the fetch metadata the browser sent. */
export type RecordedRequest = Readonly<{
  method: string;
  path: string;
  /** `Sec-Fetch-Dest`. */
  destination: string | undefined;
  /** `Sec-Fetch-Mode`. */
  mode: string | undefined;
  /** Whether the browser sent it as a navigation preload (`Service-Worker-Navigation-Preload`). */
  preload: boolean;
  /** The deploy that was live when it arrived. */
  live: Deploy;
  /** How an injected fault answered it, if one did. */
  fault?: FaultAnswer;
}>;

/** Two deploys behind one origin, switched by `deploy`. */
export type DeployServer = {
  readonly origin: string;
  readonly documents: Deploy[];
  /** Every request, in arrival order. */
  readonly requests: RecordedRequest[];
  /** How many `/health/build` answers the next deploy gave. */
  readonly buildChecks: () => number;
  readonly heldRequest: Promise<void>;
  deploy(): void;
  /**
   * Inject a fault.
   *
   * @param fault - Which requests fail, and how.
   * @returns Removes it.
   */
  inject(fault: Fault): () => void;
  close(): Promise<void>;
};

/** Each deploy's client output. */
export type ClientRoots = Readonly<Record<Deploy, string>>;

/** One client output for both deploys: the build's. */
const sameClientRoots: ClientRoots = { previous: clientRoot, next: clientRoot };

const matchesPath = (path: string | RegExp, pathname: string): boolean =>
  typeof path === 'string' ? path === pathname : path.test(pathname);

const readHeader = (request: Request, name: string): string | undefined => {
  const value = request.headers[name];
  return typeof value === 'string' ? value : undefined;
};

export const startDeployServer = async (
  builds: Readonly<Record<Deploy, ServerBuild>>,
  files?: Readonly<{
    shells: Readonly<Record<Deploy, string>>;
    /** Each deploy's `/service-worker.js`; an empty script is a 404, as for a build that has none. */
    workers: Readonly<Record<Deploy, string>>;
    /** Each deploy's `/offline-shell-worker.js` (the retired `/usage` worker's URL); unset serves the build's file. */
    retiredWorkers?: Readonly<Record<Deploy, string>>;
    /** Each deploy's client output (`Deploys.clientRoots`); unset, the build's for both. */
    clientRoots?: ClientRoots;
    /**
     * Files of the previous deploy only, by URL path: served as its hashed files are while it is live, and never once
     * the next deploy is, retention or not (a file that has aged out of asset retention).
     */
    previousOnly?: Readonly<Record<string, string>>;
  }>,
  {
    hold = true,
    retain = false,
  }: {
    readonly hold?: boolean;
    /** The live next deploy also serves the previous deploy's hashed files, whatever the request's deploy cookie. */
    readonly retain?: boolean;
  } = {},
): Promise<DeployServer> => {
  const shells = files?.shells;
  const workers = files?.workers;
  const retiredWorkers = files?.retiredWorkers;
  const roots = files?.clientRoots ?? sameClientRoots;
  const previousOnly = files?.previousOnly ?? {};
  let live: Deploy = 'previous';
  let buildChecks = 0;
  const documents: Deploy[] = [];
  const requests: RecordedRequest[] = [];
  const faults = new Set<{ readonly fault: Fault; remaining: number }>();
  const held: Array<() => void> = [];
  let markHeld: () => void = () => undefined;
  const heldRequest = new Promise<void>((resolve) => {
    markHeld = resolve;
  });
  const handlers = {
    previous: createRequestHandler({ build: builds.previous }),
    next: createRequestHandler({ build: builds.next }),
  };
  const serveAsset = {
    previous: express.static(roots.previous, { immutable: true, maxAge: '1y' }),
    next: express.static(roots.next, { immutable: true, maxAge: '1y' }),
  };
  const serveFile = {
    previous: express.static(roots.previous, { maxAge: '1h' }),
    next: express.static(roots.next, { maxAge: '1h' }),
  };

  const app = express();
  app.disable('x-powered-by');
  app.use((request: Request, response: Response, next: NextFunction) => {
    const destination = readHeader(request, 'sec-fetch-dest');
    const injected = [...faults].find(
      ({ fault, remaining }) =>
        remaining > 0 &&
        matchesPath(fault.path, request.path) &&
        (fault.destination === undefined || fault.destination.includes(destination ?? '')),
    );
    requests.push({
      method: request.method,
      path: request.path,
      destination,
      mode: readHeader(request, 'sec-fetch-mode'),
      preload: request.headers['service-worker-navigation-preload'] !== undefined,
      live,
      ...(injected === undefined ? {} : { fault: injected.fault.answer }),
    });
    if (injected === undefined) {
      next();
      return;
    }
    injected.remaining -= 1;
    if (injected.fault.answer === 'reset') {
      request.socket.destroy();
      return;
    }
    sendDeletedAsset(response);
  });
  app.use(coiMiddleware());
  app.use('/assets', (request: Request, response: Response, next) => {
    // A request with no deploy cookie (the service worker's precache) reaches the live deploy.
    const cookie = request.headers.cookie ?? '';
    const renderedByNext =
      cookie.includes(`${deployCookie}=next`) || (live === 'next' && !cookie.includes(deployCookie));
    if (hold && live === 'previous' && heldChunk.test(request.originalUrl)) {
      held.push(() => {
        sendDeletedAsset(response);
      });
      markHeld();
      return;
    }
    if (live === 'next' && !renderedByNext && !retain) {
      sendDeletedAsset(response);
      return;
    }
    const pathname = request.originalUrl.split('?')[0] ?? '';
    const only = previousOnly[pathname];
    if (only !== undefined) {
      if (live === 'next') {
        sendDeletedAsset(response);
        return;
      }
      response
        .status(200)
        .type('text/javascript')
        .set('Cache-Control', 'public, max-age=31536000, immutable')
        .send(only);
      return;
    }
    // The deploy that renders the request has its files. With retention the live next deploy also serves the previous
    // one's, whichever deploy rendered the page, as staging does (it ignores the skew pin).
    const order: Deploy[] = live === 'next' && retain ? ['next', 'previous'] : renderedByNext ? ['next'] : ['previous'];
    const owner = order.find((deploy) => existsSync(join(roots[deploy], pathname.slice(1))));
    if (owner === undefined) {
      sendDeletedAsset(response);
      return;
    }
    serveAsset[owner](request, response, next);
  });
  const serveWorker =
    (scripts: Readonly<Record<Deploy, string>> | undefined) =>
    (_request: Request, response: Response, next: () => void): void => {
      if (scripts === undefined) {
        next();
        return;
      }
      if (scripts[live] === '') {
        sendDeletedAsset(response);
        return;
      }
      response.status(200).type('text/javascript').set('Cache-Control', 'no-cache').send(scripts[live]);
    };
  app.get(serviceWorkerUrl, serveWorker(workers));
  app.get(retiredServiceWorkerUrl, serveWorker(retiredWorkers));
  app.get(projectShellUrl, (_request: Request, response: Response, next) => {
    if (shells === undefined) {
      next();
      return;
    }
    response
      .status(200)
      .type('text/html')
      .set('Cache-Control', 'public, max-age=0, must-revalidate')
      .send(shells[live]);
  });
  app.use((request: Request, response: Response, next: NextFunction) => {
    serveFile[live](request, response, next);
  });
  app.all('*splat', (request: Request, response: Response, next) => {
    if (request.headers['sec-fetch-dest'] === 'document') {
      documents.push(live);
      response.cookie(deployCookie, live, { path: '/' });
    }
    if (live === 'next' && request.path === '/health/build') {
      buildChecks += 1;
    }
    if (shells !== undefined && request.method === 'GET' && projectUrl.test(request.path)) {
      response
        .status(200)
        .type('text/html')
        .set('Cache-Control', 'public, max-age=0, must-revalidate')
        .send(shells[live]);
      return;
    }
    void handlers[live](request, response, next);
  });

  const server: Server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${String(port)}`,
    documents,
    requests,
    buildChecks: () => buildChecks,
    heldRequest,
    deploy() {
      live = 'next';
      for (const release of held.splice(0)) {
        release();
      }
    },
    inject(fault) {
      const injected = { fault, remaining: fault.times ?? Number.POSITIVE_INFINITY };
      faults.add(injected);
      return () => {
        faults.delete(injected);
      };
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    },
  };
};

/** Both deploys, ready to serve. */
export type Deploys = Readonly<{
  builds: Readonly<Record<Deploy, ServerBuild>>;
  shells: Readonly<Record<Deploy, string>>;
  workers: Awaited<ReturnType<typeof readWorkers>>;
  /** Each deploy's client output: the build's for both, unless the next deploy's chunks were renamed. */
  clientRoots: ClientRoots;
  /** The previous deploy's URL of each file the next deploy renamed, to the next deploy's; empty unless renamed. */
  renamed: ReadonlyMap<string, string>;
  previousBuildId: number;
  nextBuildId: number;
  /** Removes the next deploy's server copy (and client copy). */
  remove: () => Promise<void>;
}>;

/**
 * Prepare both deploys from the build: read the previous deploy's build id from a rendered page, copy its server bundle
 * as the next deploy, and derive the next deploy's shell and worker.
 *
 * @param name - Names the next deploy's copies, so suites never share one.
 * @param options - `rename`: the next deploy is a different client build, in which the hashed files this pattern
 *   matches (by URL path) are renamed, with every file that names them, to a fixed point.
 * @returns Both deploys.
 */
export const prepareDeploys = async (name: string, options: Readonly<{ rename?: RegExp }> = {}): Promise<Deploys> => {
  const nextServerRoot = join(buildRoot, `server-next-deploy-${name}`);
  const nextClientRoot = join(buildRoot, `client-next-deploy-${name}`);
  const previousBuild = await importServerBuild(join(buildRoot, 'server'));
  const probe = await startDeployServer({ previous: previousBuild, next: previousBuild });
  let previousBuildId = 0;
  try {
    const response = await fetch(`${probe.origin}/`, { headers: { 'sec-fetch-dest': 'document' } });
    previousBuildId = readBuildId(await response.text());
  } finally {
    await probe.close();
  }
  const nextBuildId = previousBuildId + deployGap;
  const client =
    options.rename === undefined
      ? undefined
      : await createRenamedClient({ nextClientRoot, pattern: options.rename, previousBuildId, nextBuildId });
  const rename = client?.rename ?? ((text: string) => text);
  const clientRoots: ClientRoots =
    client === undefined ? sameClientRoots : { previous: clientRoot, next: nextClientRoot };
  await createNextDeploy({ nextServerRoot, previousBuildId, nextBuildId, rename });
  const shells = await readShells(previousBuildId, nextBuildId, clientRoots);
  return {
    builds: { previous: previousBuild, next: await importServerBuild(nextServerRoot) },
    shells,
    workers: await readWorkers(shells, rename, clientRoots),
    clientRoots,
    renamed: client?.renamed ?? new Map(),
    previousBuildId,
    nextBuildId,
    remove: async () => {
      await rm(nextServerRoot, { recursive: true, force: true });
      await rm(nextClientRoot, { recursive: true, force: true });
    },
  };
};

/** The worker PL7 shipped before FP1, with its precache list as the injection point again. */
const preFixWorkerFile = resolve(import.meta.dirname, '../../fixtures/service-worker/pre-fix-service-worker.js');

/**
 * The pre-fix worker (CacheFirst on first use, all-or-nothing install) precaching this build's list: what a browser
 * that installed the worker before FP1 still runs, on the files of today's deploy.
 *
 * @param without - Precache URLs to leave out, as for a worker from before a file joined the interactive tier.
 * @returns The worker script.
 */
export const readPreFixWorker = (without: readonly string[] = []): string => {
  const entries = (
    JSON.parse(readFileSync(join(buildRoot, 'service-worker-precache.json'), 'utf8')) as Array<{ url: string }>
  ).filter((entry) => !without.includes(entry.url));
  const script = readFileSync(preFixWorkerFile, 'utf8');
  const point = 'globalThis.__WB_MANIFEST';
  // The last occurrence: the first is the fixture's own comment.
  const at = script.lastIndexOf(point);
  return `${script.slice(0, at)}${JSON.stringify(entries)}${script.slice(at + point.length)}`;
};

/** `apps/ui/scripts/build-service-worker.ts`'s build, as far as the suites call it. */
type BuildServiceWorker = (options: {
  readonly buildDirectory: string;
  readonly workerSourcePath: string;
  readonly retiringWorkerSourcePath: string;
  readonly classes: readonly unknown[];
  readonly killSwitch: boolean;
}) => Promise<unknown>;

/**
 * The retiring worker, as a kill switch build (`TAU_SERVICE_WORKER_KILL_SWITCH=true`) writes it to
 * `/service-worker.js`, built by the build's own `buildServiceWorker`.
 *
 * @returns The worker script.
 */
export const buildKillSwitchWorker = async (): Promise<string> => {
  const { buildServiceWorker } = (await import(
    pathToFileURL(join(uiRoot, 'scripts/build-service-worker.ts')).href
  )) as { readonly buildServiceWorker: BuildServiceWorker };
  const buildDirectory = mkdtempSync(join(tmpdir(), 'tau-e2e-kill-switch-'));
  try {
    mkdirSync(join(buildDirectory, 'client'));
    await buildServiceWorker({
      buildDirectory,
      workerSourcePath: join(uiRoot, 'app/offline/service-worker-kill-switch.ts'),
      retiringWorkerSourcePath: join(uiRoot, 'app/offline/service-worker-kill-switch.ts'),
      classes: [],
      killSwitch: true,
    });
    return readFileSync(join(buildDirectory, 'client/service-worker.js'), 'utf8');
  } finally {
    rmSync(buildDirectory, { recursive: true, force: true });
  }
};

/**
 * A returning visitor: one browser profile on disk, each visit a browser launched on it and closed after, so a visit's
 * first navigation is answered by whatever worker the profile holds, before any update check, with the HTTP cache on.
 */
export type ReturningVisitor = Readonly<{
  /**
   * Launch the browser on the profile, run `visit` on its page and close the browser, unless `keepOpen`.
   *
   * @returns The context, when kept open (the caller closes it).
   */
  visit: <T>(
    visit: (page: Page, context: BrowserContext) => Promise<T>,
    options?: Readonly<{ keepOpen?: boolean }>,
  ) => Promise<T>;
  /** The context of a visit kept open, until closed. */
  readonly open: () => BrowserContext | undefined;
  /** Closes any open visit and deletes the profile. */
  remove: () => Promise<void>;
}>;

/**
 * A returning visitor's profile.
 *
 * @param cookies - Cookies each visit starts with (`tau-entry=app`), for an origin.
 * @returns The visitor.
 */
export const createReturningVisitor = (
  cookies: ReadonlyArray<Readonly<{ name: string; value: string; url: string }>> = [],
): ReturningVisitor => {
  const profile = mkdtempSync(join(tmpdir(), 'tau-e2e-returning-visitor-'));
  let open: BrowserContext | undefined;
  return {
    async visit(visit, options = {}) {
      await open?.close();
      const context = await chromium.launchPersistentContext(profile, {
        executablePath: process.env['TAU_E2E_CHROMIUM_EXECUTABLE'],
      });
      open = context;
      try {
        if (cookies.length > 0) {
          await context.addCookies(cookies.map((cookie) => ({ ...cookie })));
        }
        const page = context.pages()[0] ?? (await context.newPage());
        return await visit(page, context);
      } finally {
        if (options.keepOpen !== true) {
          await context.close();
          open = undefined;
        }
      }
    },
    open: () => open,
    async remove() {
      await open?.close();
      open = undefined;
      await rm(profile, { recursive: true, force: true });
    },
  };
};

/** Wait until a worker controls the page and is activated: its precache install has completed. */
export const waitForControllingWorker = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated', undefined, {
    timeout: 60_000,
    polling: 250,
  });
};

/** Whether the app mounted its shell, whether the boot watchdog's strip shows, and the build the page runs. */
export type BootState = Readonly<{ mounted: boolean; stripShown: boolean; buildId: string | undefined }>;

/**
 * The page's {@link BootState}, or a not-mounted state while the page is between documents.
 *
 * @param page - The page.
 * @returns Its boot state.
 */
export const readBootState = async (page: Page): Promise<BootState> => {
  try {
    return await page.evaluate(() => {
      const strip = document.querySelector<HTMLElement>('#tau-boot-strip');
      return {
        mounted: (globalThis as { __tauBoot?: { shellMounted?: boolean } }).__tauBoot?.shellMounted === true,
        stripShown: strip !== null && !strip.hidden,
        buildId: (globalThis as { ENV?: { TAU_BUILD_ID?: string } }).ENV?.TAU_BUILD_ID,
      };
    });
  } catch {
    return { mounted: false, stripShown: false, buildId: undefined };
  }
};
