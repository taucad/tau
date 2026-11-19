/**
 * Two deploys of one built UI behind one origin (TAU-UI-6, progressive loading PL7): the previous deploy is the build
 * in `apps/ui/build`, the next one the same server bundle copied under a later build id, with its own project shell and
 * service worker. `deploy()` makes the next one live: a request carrying the previous deploy's cookie for a hashed file
 * the next deploy does not have gets Netlify's deleted-asset answer, a request with no deploy cookie (the worker's
 * precache) reaches the live deploy, and project URLs get the live deploy's prerendered shell, as Netlify answers them
 * (PL3).
 *
 * Two real builds (PL7 service worker staging defects blueprint, FP0): with `renamed`, the next deploy is also a client
 * output of its own, the previous one's files with the matching chunks renamed and every hashed file that names a renamed
 * file renamed in turn, to a fixed point, as a rebuild that changes a chunk renames its importers. Its documents, route
 * manifest, server bundle and worker name the new files, so the previous deploy's worker holds none of them.
 *
 * Faults are injected at the server, never with Playwright's `route`, which turns the browser's HTTP cache off and so
 * makes every navigation one the worker answers network-first: per path, a request whose `Sec-Fetch-Dest` matches
 * (`empty` is every request a service worker makes) has its connection reset or is answered 404, every time or for the
 * next few. Every request is logged with its `Sec-Fetch-Dest` and `Sec-Fetch-Mode`. A returning visitor is a persistent
 * browser profile closed between visits ({@link createProfile}).
 *
 * Shared by `stale-deploy-recovery.test.ts` and `service-worker-skew.test.ts` (merge-queue suite
 * `test:e2e:deploy-skew`), and `service-worker-deploy.test.ts` (nightly suite `test:e2e:service-worker`).
 */
import { createHash } from 'node:crypto';
import { cp, link, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import express from 'express';
import type { Request, Response } from 'express';
import { chromium } from 'playwright';
import type { BrowserContext, Page } from 'playwright';
import { createRequestHandler } from '@react-router/express';
import { coiMiddleware } from '@taucad/runtime/cross-origin-isolation/express';

export type Deploy = 'previous' | 'next';
export type ServerBuild = Parameters<typeof createRequestHandler>[0]['build'];

export const buildRoot = resolve(import.meta.dirname, '../../../ui/build');
export const clientRoot = join(buildRoot, 'client');
const deployCookie = 'tau-e2e-deploy';
/** The project shell the build prerenders (`apps/ui/app/lib/route-classes.ts`), and the URLs Netlify rewrites to it. */
const projectShellFile = join(clientRoot, 'w/__shell/__shell/index.html');
/** Where the service worker precaches the project shell from, and the worker itself. */
export const projectShellUrl = '/w/__shell/__shell/index.html';
const serviceWorkerUrl = '/service-worker.js';
/** The retired `/usage` worker's URL, where every PL7 build ships the retiring worker. */
const retiredServiceWorkerUrl = '/offline-shell-worker.js';
const projectUrl = /^\/w\/[^/.]+\/[^/.]+\/?$/u;
const heldChunk = /^\/assets\/example-command-items-[\w-]+\.js$/u;
/** Milliseconds between the two deploys' build ids. */
export const deployGap = 60_000;

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

/** How the next deploy's files differ from the previous one's. */
type NextFiles = Readonly<{
  /** Old basename to new basename of every renamed file; empty when the deploys share one client output. */
  renames: ReadonlyMap<string, string>;
  /** The next deploy's client output: {@link clientRoot} when the deploys share one. */
  clientRoot: string;
}>;

const sharedClient: NextFiles = { renames: new Map(), clientRoot };

/** Replace every renamed file's basename in a text. */
const applyRenames = (text: string, renames: ReadonlyMap<string, string>): string => {
  let renamed = text;
  for (const [from, to] of renames) {
    renamed = renamed.replaceAll(from, to);
  }
  return renamed;
};

/** Each deploy's project shell: the prerendered file, and for the next deploy the same file under its build id. */
export const readShells = async (
  previousBuildId: number,
  nextBuildId: number,
  renames: ReadonlyMap<string, string> = sharedClient.renames,
): Promise<Record<Deploy, string>> => {
  const previous = await readFile(projectShellFile, 'utf8');
  if (readBuildId(previous) !== previousBuildId) {
    throw new Error('The prerendered project shell carries another build id than the server bundle it was built with.');
  }
  return { previous, next: applyRenames(previous, renames).replaceAll(String(previousBuildId), String(nextBuildId)) };
};

/** A revisioned precache entry as `workbox-build` writes it into the worker. */
const revisionedEntry = /\{"revision":"([\da-f]+)","url":"([^"]+)"\}/gu;

/**
 * Each deploy's service worker: the build's own for the previous deploy, and for the next one the same worker naming
 * the next deploy's files, each revisioned entry (the documents) with the next deploy's content revision, as a new
 * build's worker does.
 */
export const readWorkers = async (
  shells: Readonly<Record<Deploy, string>>,
  next: NextFiles = sharedClient,
): Promise<{ scripts: Record<Deploy, string>; shellRevisions: Record<Deploy, string> }> => {
  const previous = await readFile(join(clientRoot, serviceWorkerUrl.slice(1)), 'utf8');
  const entry = new RegExp(`"revision":"([\\da-f]+)","url":"${projectShellUrl}"`, 'u').exec(previous);
  if (entry?.[1] === undefined) {
    throw new Error('The built service worker does not precache the project shell.');
  }
  const revisionOf = (text: string, length: number): string =>
    createHash('sha256').update(text).digest('hex').slice(0, length);
  const renamed = applyRenames(previous, next.renames);
  const revisions = new Map<string, string>();
  for (const [, revision = '', url = ''] of renamed.matchAll(revisionedEntry)) {
    if (url === projectShellUrl) {
      revisions.set(url, revisionOf(shells.next, revision.length));
      continue;
    }
    if (!textExtensions.has(extname(url))) {
      // A font: a rebuild that renames chunks leaves it as it was.
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- A handful of documents, read once per suite.
    const text = await readFile(join(next.clientRoot, url.slice(1)), 'utf8').catch(() => undefined);
    revisions.set(url, text === undefined ? revision : revisionOf(text, revision.length));
  }
  const nextScript = renamed.replaceAll(
    revisionedEntry,
    (_whole, revision: string, url: string) => `{"revision":"${revisions.get(url) ?? revision}","url":"${url}"}`,
  );
  return {
    scripts: { previous, next: nextScript },
    shellRevisions: { previous: entry[1], next: revisions.get(projectShellUrl) ?? entry[1] },
  };
};

/** Files whose text may name a hashed file or the build id; every other file is linked as it is. */
const textExtensions = new Set(['.js', '.mjs', '.css', '.html', '.json', '.webmanifest', '.data', '.txt', '.xml']);

/** Every file under a directory, relative to it. */
const listFiles = async (root: string): Promise<string[]> => {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(root.length + 1));
};

/**
 * The renames of a rebuild that changed every hashed file `renamed` matches: each gets a new hash, and so, to a fixed
 * point, does every hashed file whose text names a renamed one.
 */
const planRenames = async (renamed: RegExp): Promise<Map<string, string>> => {
  const assetsRoot = join(clientRoot, 'assets');
  // Every file under `assets/` is named by its content: `<name>-<hash>.<ext>`.
  const assets = await readdir(assetsRoot);
  const texts = new Map<string, string>();
  for (const name of assets.filter((candidate) => textExtensions.has(extname(candidate)))) {
    // oxlint-disable-next-line no-await-in-loop -- Sequential reads keep one suite's setup memory bounded.
    texts.set(name, await readFile(join(assetsRoot, name), 'utf8'));
  }
  const renames = new Map<string, string>();
  const rename = (name: string): void => {
    // The hash ends the name: change its first of the last eight characters, so the name keeps its length.
    const at = name.length - extname(name).length - 8;
    if (at <= 0) {
      throw new Error(`${name} is not a hashed file name`);
    }
    renames.set(name, `${name.slice(0, at)}${name[at] === 'z' ? 'y' : 'z'}${name.slice(at + 1)}`);
  };
  for (const name of assets.filter((candidate) => renamed.test(candidate))) {
    rename(name);
  }
  if (renames.size === 0) {
    throw new Error(`No hashed file of the build matches ${String(renamed)}`);
  }
  let grew = true;
  while (grew) {
    grew = false;
    for (const [name, text] of texts) {
      if (!renames.has(name) && [...renames.keys()].some((from) => text.includes(from))) {
        rename(name);
        grew = true;
      }
    }
  }
  return renames;
};

/** What makes a previous deploy's text the next deploy's: its renamed files and its later build id. */
type Rebuild = Readonly<{ renames: ReadonlyMap<string, string>; previousBuildId: number; nextBuildId: number }>;

const rewriteForNext = (text: string, rebuild: Rebuild): string =>
  applyRenames(text, rebuild.renames).replaceAll(String(rebuild.previousBuildId), String(rebuild.nextBuildId));

/**
 * The next deploy's client output: hard links to the previous deploy's files, except each renamed file, written under
 * its new name, and each text file that names a renamed file or the build id, written with the new names and id.
 */
const createNextClient = async (nextClientRoot: string, rebuild: Rebuild): Promise<void> => {
  await rm(nextClientRoot, { recursive: true, force: true });
  /* oxlint-disable no-await-in-loop -- Sequential, so a large build never holds many files open. */
  for (const name of await listFiles(clientRoot)) {
    const source = join(clientRoot, name);
    const target = join(nextClientRoot, dirname(name), rebuild.renames.get(basename(name)) ?? basename(name));
    await mkdir(dirname(target), { recursive: true });
    if (textExtensions.has(extname(name))) {
      const text = await readFile(source, 'utf8');
      const rewritten = rewriteForNext(text, rebuild);
      if (rewritten !== text || rebuild.renames.has(basename(name))) {
        await writeFile(target, rewritten);
        continue;
      }
    }
    await link(source, target);
  }
  /* oxlint-enable no-await-in-loop */
};

/**
 * Copy the previous deploy's server bundle as the next deploy: the same code under a later build id, naming the next
 * deploy's renamed files.
 *
 * @param nextServerRoot - Where the copy goes: beside `server/`, so it resolves the same externals and `../client` assets.
 */
const createNextDeploy = async (nextServerRoot: string, rebuild: Rebuild): Promise<void> => {
  await rm(nextServerRoot, { recursive: true, force: true });
  await cp(join(buildRoot, 'server'), nextServerRoot, { recursive: true });
  const entries = await readdir(nextServerRoot, { recursive: true });
  const scripts = entries.filter((name) => name.endsWith('.js'));
  const replaced = await Promise.all(
    scripts.map(async (name) => {
      const path = join(nextServerRoot, name);
      const source = await readFile(path, 'utf8');
      const rewritten = rewriteForNext(source, rebuild);
      if (rewritten !== source) {
        await writeFile(path, rewritten);
      }
      return source.includes(String(rebuild.previousBuildId));
    }),
  );
  if (!replaced.includes(true)) {
    throw new Error(`Build id ${String(rebuild.previousBuildId)} does not occur in the server bundle.`);
  }
};

export const importServerBuild = async (root: string): Promise<ServerBuild> =>
  (await import(pathToFileURL(join(root, 'index.js')).href)) as ServerBuild;

/** A fault the server injects into the requests for one path. */
export type Fault = Readonly<{
  /** The request's path, exactly (its query is ignored). */
  path: string;
  /** Only requests with this `Sec-Fetch-Dest`: `empty` is every request a service worker makes. Unset: every request. */
  destination?: string;
  /** `reset` drops the connection, as a content blocker or a dead connection fails a request; `not-found` answers 404. */
  kind: 'reset' | 'not-found';
  /** Only the next this many matching requests; unset: every one. */
  times?: number;
}>;

/** One request the server received. */
export type LoggedRequest = Readonly<{
  method: string;
  path: string;
  /** `Sec-Fetch-Dest`, or `undefined` when the request carried none. */
  destination: string | undefined;
  /** `Sec-Fetch-Mode`, or `undefined` when the request carried none. */
  mode: string | undefined;
  /** Whether the browser sent it as a navigation preload (`Service-Worker-Navigation-Preload`). */
  preload: boolean;
  /** The deploy that was live. */
  live: Deploy;
  /** The fault injected into it, if any. */
  fault: Fault['kind'] | undefined;
}>;

/** Two deploys behind one origin, switched by `deploy`. */
export type DeployServer = {
  readonly origin: string;
  readonly documents: Deploy[];
  /** Every request, in arrival order. */
  readonly requests: readonly LoggedRequest[];
  /** How many `/health/build` answers the next deploy gave. */
  readonly buildChecks: () => number;
  readonly heldRequest: Promise<void>;
  deploy(): void;
  /** Inject a fault; the latest fault for a path and destination wins. */
  inject(fault: Fault): void;
  /** Remove every fault. */
  clearFaults(): void;
  close(): Promise<void>;
};

export const startDeployServer = async (
  builds: Readonly<Record<Deploy, ServerBuild>>,
  files?: Readonly<{
    shells: Readonly<Record<Deploy, string>>;
    /** Each deploy's `/service-worker.js`; an empty script is a 404, as for a build that has none. */
    workers: Readonly<Record<Deploy, string>>;
    /** Each deploy's `/offline-shell-worker.js` (the retired `/usage` worker's URL); unset serves the build's file. */
    retiredWorkers?: Readonly<Record<Deploy, string>>;
    /** Each deploy's client output; unset: both serve {@link clientRoot}. */
    clientRoots?: Readonly<Record<Deploy, string>>;
  }>,
  { hold = true, retain = false }: { readonly hold?: boolean; readonly retain?: boolean } = {},
): Promise<DeployServer> => {
  const shells = files?.shells;
  const workers = files?.workers;
  const retiredWorkers = files?.retiredWorkers;
  const roots = files?.clientRoots ?? { previous: clientRoot, next: clientRoot };
  let live: Deploy = 'previous';
  let buildChecks = 0;
  const documents: Deploy[] = [];
  const requests: LoggedRequest[] = [];
  const faults: Array<{ fault: Fault; remaining: number }> = [];
  const held: Array<() => void> = [];
  let markHeld: () => void = () => undefined;
  const heldRequest = new Promise<void>((resolve) => {
    markHeld = resolve;
  });
  const handlers = {
    previous: createRequestHandler({ build: builds.previous }),
    next: createRequestHandler({ build: builds.next }),
  };
  const serveAssets = {
    previous: express.static(join(roots.previous, 'assets'), { immutable: true, maxAge: '1y' }),
    next: express.static(join(roots.next, 'assets'), { immutable: true, maxAge: '1y' }),
  };
  const serveFiles = {
    previous: express.static(roots.previous, { maxAge: '1h' }),
    next: express.static(roots.next, { maxAge: '1h' }),
  };

  const app = express();
  app.disable('x-powered-by');
  app.use((request: Request, response: Response, next) => {
    const header = (name: string): string | undefined => {
      const value = request.headers[name];
      return typeof value === 'string' ? value : undefined;
    };
    const destination = header('sec-fetch-dest');
    const index = faults.findLastIndex(
      ({ fault, remaining }) =>
        remaining > 0 &&
        fault.path === request.path &&
        (fault.destination === undefined || fault.destination === destination),
    );
    const injected = index === -1 ? undefined : faults[index];
    requests.push({
      method: request.method,
      path: request.path,
      destination,
      mode: header('sec-fetch-mode'),
      preload: header('service-worker-navigation-preload') !== undefined,
      live,
      fault: injected?.fault.kind,
    });
    if (injected === undefined) {
      next();
      return;
    }
    injected.remaining -= 1;
    if (injected.fault.kind === 'reset') {
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
    // The live deploy also serves the files it retains from the previous one (`retain-previous-assets.mts`).
    const deploy: Deploy = renderedByNext ? 'next' : 'previous';
    serveAssets[deploy](request, response, () => {
      if (deploy === 'next' && retain && roots.next !== roots.previous) {
        serveAssets.previous(request, response, next);
        return;
      }
      next();
    });
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
  app.use((request: Request, response: Response, next) => {
    serveFiles[live](request, response, next);
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
      faults.push({ fault, remaining: fault.times ?? Number.POSITIVE_INFINITY });
    },
    clearFaults() {
      faults.splice(0);
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
  /** Each deploy's client output: the same directory unless the next deploy renamed files. */
  clientRoots: Readonly<Record<Deploy, string>>;
  /** Old basename to new basename of each file the next deploy renamed. */
  renames: ReadonlyMap<string, string>;
  previousBuildId: number;
  nextBuildId: number;
  /** Removes the next deploy's server copy and client output. */
  remove: () => Promise<void>;
}>;

/**
 * Prepare both deploys from the build: read the previous deploy's build id from a rendered page, copy its server bundle
 * as the next deploy, and derive the next deploy's shell and worker.
 *
 * @param name - Names the next deploy's copies, so suites never share one.
 * @param options - `renamed`: the hashed files under `assets/` the next deploy rebuilt, so it is a client output of its
 *   own (see the file comment). Unset, both deploys serve one client output.
 * @returns Both deploys.
 */
export const prepareDeploys = async (name: string, options: { readonly renamed?: RegExp } = {}): Promise<Deploys> => {
  const nextServerRoot = join(buildRoot, `server-next-deploy-${name}`);
  const nextClientRoot = options.renamed === undefined ? clientRoot : join(buildRoot, `client-next-deploy-${name}`);
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
  const renames = options.renamed === undefined ? new Map<string, string>() : await planRenames(options.renamed);
  const rebuild: Rebuild = { renames, previousBuildId, nextBuildId };
  if (options.renamed !== undefined) {
    await createNextClient(nextClientRoot, rebuild);
  }
  await createNextDeploy(nextServerRoot, rebuild);
  const shells = await readShells(previousBuildId, nextBuildId, renames);
  return {
    builds: { previous: previousBuild, next: await importServerBuild(nextServerRoot) },
    shells,
    workers: await readWorkers(shells, { renames, clientRoot: nextClientRoot }),
    clientRoots: { previous: clientRoot, next: nextClientRoot },
    renames,
    previousBuildId,
    nextBuildId,
    remove: async () => {
      await rm(nextServerRoot, { recursive: true, force: true });
      if (nextClientRoot !== clientRoot) {
        await rm(nextClientRoot, { recursive: true, force: true });
      }
    },
  };
};

/**
 * A returning visitor: one persistent browser profile, each visit a browser launched on it and closed after, so the next
 * visit's first navigation is answered by whatever worker the profile holds, before any update check.
 */
export type Profile = Readonly<{
  /** Launch the browser on the profile; the caller closes the context to end the visit. */
  visit: () => Promise<BrowserContext>;
  /** Delete the profile. */
  remove: () => Promise<void>;
}>;

/**
 * Create a returning visitor's profile, with the `tau-entry=app` preference set for an origin when given, as for a
 * visitor whose `/` is Home.
 *
 * @param appEntryOrigin - The origin whose `tau-entry` cookie is set on every visit.
 * @returns The profile.
 */
export const createProfile = async (appEntryOrigin?: string): Promise<Profile> => {
  const directory = await mkdtemp(join(tmpdir(), 'tau-e2e-returning-visitor-'));
  return {
    visit: async () => {
      const context = await chromium.launchPersistentContext(directory, {
        executablePath: process.env['TAU_E2E_CHROMIUM_EXECUTABLE'],
      });
      if (appEntryOrigin !== undefined) {
        await context.addCookies([{ name: 'tau-entry', value: 'app', url: appEntryOrigin }]);
      }
      return context;
    },
    remove: async () => rm(directory, { recursive: true, force: true }),
  };
};

/** The first page of a visit's context. */
export const firstPage = async (context: BrowserContext): Promise<Page> => context.pages()[0] ?? context.newPage();

/** Every service worker version the browser reported for a page's origin, by version id, with its last status. */
export type WorkerVersions = Readonly<{
  /** The status of each version seen (`new`, `installing`, `installed`, `activating`, `activated`, `redundant`). */
  statuses: () => ReadonlyMap<number, string>;
  stop: () => Promise<void>;
}>;

/**
 * Watch the service worker versions of a page's origin over the DevTools protocol, which tells two versions of one
 * script URL apart where the page's registration cannot.
 *
 * @param context - The page's context.
 * @param page - The page.
 * @returns The versions seen so far.
 */
export const watchWorkerVersions = async (context: BrowserContext, page: Page): Promise<WorkerVersions> => {
  const session = await context.newCDPSession(page);
  const statuses = new Map<number, string>();
  session.on('ServiceWorker.workerVersionUpdated', ({ versions }) => {
    for (const version of versions) {
      statuses.set(Number(version.versionId), version.status);
    }
  });
  await session.send('ServiceWorker.enable');
  return {
    statuses: () => statuses,
    stop: async () => session.detach(),
  };
};
