/**
 * Two deploys of one built UI behind one origin (TAU-UI-6, progressive loading PL7): the previous deploy is the build
 * in `apps/ui/build`, the next one the same server bundle copied under a later build id, with its own project shell and
 * service worker. `deploy()` makes the next one live: a request carrying the previous deploy's cookie for a hashed file
 * the next deploy does not have gets Netlify's deleted-asset answer, a request with no deploy cookie (the worker's
 * precache) reaches the live deploy, and project URLs get the live deploy's prerendered shell, as Netlify answers them
 * (PL3).
 *
 * Shared by `stale-deploy-recovery.test.ts` (merge-queue suite `test:e2e:deploy-skew`) and
 * `service-worker-deploy.test.ts` (nightly suite `test:e2e:service-worker`).
 */
import { createHash } from 'node:crypto';
import { cp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import type { Request, Response } from 'express';
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

/** Each deploy's project shell: the prerendered file, and for the next deploy the same file under its build id. */
export const readShells = async (previousBuildId: number, nextBuildId: number): Promise<Record<Deploy, string>> => {
  const previous = await readFile(projectShellFile, 'utf8');
  if (readBuildId(previous) !== previousBuildId) {
    throw new Error('The prerendered project shell carries another build id than the server bundle it was built with.');
  }
  return { previous, next: previous.replaceAll(String(previousBuildId), String(nextBuildId)) };
};

/**
 * Each deploy's service worker: the build's own for the previous deploy, and for the next one the same worker whose
 * precache names the next deploy's shell, by its content revision, as a new build's worker does.
 */
export const readWorkers = async (
  shells: Readonly<Record<Deploy, string>>,
): Promise<{ scripts: Record<Deploy, string>; shellRevisions: Record<Deploy, string> }> => {
  const previous = await readFile(join(clientRoot, serviceWorkerUrl.slice(1)), 'utf8');
  const entry = new RegExp(`"revision":"([\\da-f]+)","url":"${projectShellUrl}"`, 'u').exec(previous);
  if (entry?.[1] === undefined) {
    throw new Error('The built service worker does not precache the project shell.');
  }
  const nextRevision = createHash('sha256').update(shells.next).digest('hex').slice(0, entry[1].length);
  return {
    scripts: { previous, next: previous.replace(entry[0], entry[0].replace(entry[1], nextRevision)) },
    shellRevisions: { previous: entry[1], next: nextRevision },
  };
};

/**
 * Copy the previous deploy's server bundle as the next deploy: the same code under a later build id.
 *
 * @param nextServerRoot - Where the copy goes: beside `server/`, so it resolves the same externals and `../client` assets.
 */
const createNextDeploy = async (
  nextServerRoot: string,
  previousBuildId: number,
  nextBuildId: number,
): Promise<void> => {
  await rm(nextServerRoot, { recursive: true, force: true });
  await cp(join(buildRoot, 'server'), nextServerRoot, { recursive: true });
  const entries = await readdir(nextServerRoot, { recursive: true });
  const scripts = entries.filter((name) => name.endsWith('.js'));
  const replaced = await Promise.all(
    scripts.map(async (name) => {
      const path = join(nextServerRoot, name);
      const source = await readFile(path, 'utf8');
      if (!source.includes(String(previousBuildId))) {
        return false;
      }
      await writeFile(path, source.replaceAll(String(previousBuildId), String(nextBuildId)));
      return true;
    }),
  );
  if (!replaced.includes(true)) {
    throw new Error(`Build id ${String(previousBuildId)} does not occur in the server bundle.`);
  }
};

export const importServerBuild = async (root: string): Promise<ServerBuild> =>
  (await import(pathToFileURL(join(root, 'index.js')).href)) as ServerBuild;

/** Two deploys behind one origin, switched by `deploy`. */
export type DeployServer = {
  readonly origin: string;
  readonly documents: Deploy[];
  /** How many `/health/build` answers the next deploy gave. */
  readonly buildChecks: () => number;
  readonly heldRequest: Promise<void>;
  deploy(): void;
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
  }>,
  { hold = true, retain = false }: { readonly hold?: boolean; readonly retain?: boolean } = {},
): Promise<DeployServer> => {
  const shells = files?.shells;
  const workers = files?.workers;
  const retiredWorkers = files?.retiredWorkers;
  let live: Deploy = 'previous';
  let buildChecks = 0;
  const documents: Deploy[] = [];
  const held: Array<() => void> = [];
  let markHeld: () => void = () => undefined;
  const heldRequest = new Promise<void>((resolve) => {
    markHeld = resolve;
  });
  const handlers = {
    previous: createRequestHandler({ build: builds.previous }),
    next: createRequestHandler({ build: builds.next }),
  };
  const serveAsset = express.static(clientRoot, { immutable: true, maxAge: '1y' });

  const app = express();
  app.disable('x-powered-by');
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
    serveAsset(request, response, next);
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
  app.use(express.static(clientRoot, { maxAge: '1h' }));
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
    buildChecks: () => buildChecks,
    heldRequest,
    deploy() {
      live = 'next';
      for (const release of held.splice(0)) {
        release();
      }
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
  previousBuildId: number;
  nextBuildId: number;
  /** Removes the next deploy's server copy. */
  remove: () => Promise<void>;
}>;

/**
 * Prepare both deploys from the build: read the previous deploy's build id from a rendered page, copy its server bundle
 * as the next deploy, and derive the next deploy's shell and worker.
 *
 * @param name - Names the next deploy's server copy, so suites never share one.
 * @returns Both deploys.
 */
export const prepareDeploys = async (name: string): Promise<Deploys> => {
  const nextServerRoot = join(buildRoot, `server-next-deploy-${name}`);
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
  await createNextDeploy(nextServerRoot, previousBuildId, nextBuildId);
  const shells = await readShells(previousBuildId, nextBuildId);
  return {
    builds: { previous: previousBuild, next: await importServerBuild(nextServerRoot) },
    shells,
    workers: await readWorkers(shells),
    previousBuildId,
    nextBuildId,
    remove: async () => rm(nextServerRoot, { recursive: true, force: true }),
  };
};
