/**
 * AC18 — *Connect Git remote* against a real third-party-shaped remote.
 *
 * The acceptance sentence has two legs and one witness: *Connect Git remote* to
 * a bare repository served by `git http-backend` pushes `main` and its tags
 * from a disk host and from the browser through the proxy, and **stock
 * `git clone`** of that repository reproduces the tree byte-for-byte. The
 * witness is `git` itself, never Tau's own bookkeeping.
 *
 * Two things this file deliberately does *not* claim:
 *
 * - It is not a proof against GitHub itself. That one is the
 *   `TAU_E2E_GITHUB_SANDBOX`-gated describe at the bottom of this file, skipped
 *   wherever it is not configured, because it needs a credential no repository
 *   may hold (I8). W18 moves it when it moves the browser leg onto the deployed
 *   proxy, which is the only place that leg can run — W11a's proxy refuses
 *   `localhost` by design.
 * - The proxy hop here is a **stand-in for W11a's controller**, written to the
 *   contract its report states (`x-tau-proxy-authorization` forwarded as
 *   `Authorization`; only `/info/refs`, `/git-upload-pack` and
 *   `/git-receive-pack`; `Authorization` never forwarded). It proves the
 *   *client's* half — that the browser leg reaches a remote it cannot reach
 *   directly, carrying the remote's credential and not the Tau session. The
 *   controller's own half is W11a's `git-proxy.controller.test.ts` and the
 *   joint proof over the API wire is W18's.
 */

import { execFile, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createMemoryProvider } from '@taucad/filesystem/backend';
import { ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import type { RevisionId } from '#algorithms/index.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createRevisionHttpClient } from '#http-client.js';
import { createIsomorphicGitRevisionPort } from '#isomorphic-git-adapter.js';
import { createNativeGitRevisionPort } from '#native-git-port.js';
import { createGitRemoteTransport, isTauApiUrl } from '#remotes.js';
import { largeObjectThresholdBytes } from '#workspace-config.js';
import type { RevisionProvenance } from '#revision-authority.js';
import type { RevisionPort } from '#revision-port.js';
import { startGitHttpBackend } from '#test/git-http-backend.js';

/*
 * `git` runs asynchronously here, always. The fixture's HTTP server shares this
 * process's event loop, so a synchronous `git clone` blocks the very server it
 * is cloning from and the two wait for each other forever. (Only the
 * `git --version` probe below is synchronous, and nothing is listening then.)
 */
const runGit = promisify(execFile);

const encoder = new TextEncoder();
const author = { name: 'Tau', email: 'tau@example.com' };
const remoteCredential = 'Bearer gho_third_party';
const tauSession = 'Bearer tau-session';

const gitOnPath = ((): boolean => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const tree = (files: Readonly<Record<string, string>>): ImmutableRevisionTree =>
  new ImmutableRevisionTree(Object.entries(files).map(([path, content]) => [path, encoder.encode(content)]));

const provenance = {
  source: 'user',
  actorId: 'actor-w12',
  createdAt: Date.UTC(2026, 8, 13, 7, 0, 0),
} as const satisfies RevisionProvenance;

/**
 * W11a's proxy contract, in front of the fixture.
 *
 * Only the three git endpoints; the remote's credential arrives in
 * `x-tau-proxy-authorization` and leaves as `Authorization`; a Tau
 * `Authorization` is dropped rather than forwarded. Everything it saw is
 * recorded, because "the Tau session never reached the remote" is only an
 * assertion if something watched.
 */
/* A fixture that stops answering must fail the row, not the run. */
const upstreamTimeoutMilliseconds = 30_000;

const startProxy = async (): Promise<
  Readonly<{
    baseUrl: string;
    forwarded: () => readonly string[];
    refusals: () => readonly string[];
    close: () => Promise<void>;
  }>
> => {
  const forwarded: string[] = [];
  const refusals: string[] = [];
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    // async-iife: bootstrap -- a node:http handler has no caller to return to.
    void (async (): Promise<void> => {
      /*
       * Every path through this handler writes a response, including the ones
       * that throw. A stand-in that answers nothing is an `await` the client
       * can never settle: `fetch` has no deadline of its own, so the row does
       * not fail — it hangs, and takes the vitest fork and this server's
       * listening socket with it (principal's note, 2026-09-13 08:0x).
       */
      try {
        const requested = new URL(request.url ?? '/', 'http://proxy.invalid');
        const target = requested.searchParams.get('url') ?? '';
        const pathname = URL.canParse(target) ? new URL(target).pathname : '';
        if (!/\/(?:info\/refs|git-upload-pack|git-receive-pack)$/u.test(pathname)) {
          refusals.push(target);
          /* Drain before refusing: a client still writing a pack into a socket
           * whose reader has gone away stalls on back-pressure. */
          request.resume();
          response.writeHead(400, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ code: 'GIT_PROXY_PATH_REFUSED' }));
          return;
        }
        const headers = new Headers({ 'user-agent': 'git/tau-proxy', accept: '*/*' });
        const credential = request.headers['x-tau-proxy-authorization'];
        forwarded.push(typeof credential === 'string' ? credential : '<none>');
        if (typeof credential === 'string') {
          headers.set('authorization', credential);
        }
        const contentType = request.headers['content-type'];
        if (typeof contentType === 'string') {
          headers.set('content-type', contentType);
        }
        const body: Array<Uint8Array<ArrayBuffer>> = [];
        for await (const chunk of request) {
          body.push(chunk as Uint8Array<ArrayBuffer>);
        }
        const answer = await fetch(target, {
          method: request.method,
          headers,
          ...(request.method === 'POST' ? { body: Buffer.concat(body) } : {}),
          /* The upstream is a fixture on this same loop; if it ever stops
           * answering, this must fail rather than wait for the suite's clock. */
          signal: AbortSignal.timeout(upstreamTimeoutMilliseconds),
        });
        response.writeHead(answer.status, {
          'content-type': answer.headers.get('content-type') ?? 'application/octet-stream',
        });
        const payload = await answer.arrayBuffer();
        response.end(Buffer.from(payload));
      } catch (error) {
        request.resume();
        if (!response.headersSent) {
          response.writeHead(502, { 'content-type': 'application/json' });
        }
        response.end(
          JSON.stringify({
            code: 'GIT_PROXY_STANDIN_FAILED',
            message: error instanceof Error ? error.message : 'unknown',
          }),
        );
      }
    })();
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${String(port)}`,
    forwarded: () => forwarded,
    refusals: () => refusals,
    close: async () =>
      new Promise<void>((resolve) => {
        /* `close` alone waits for every keep-alive socket, and `fetch` keeps
         * them; without this the teardown is the thing that hangs. */
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
};

describe.runIf(gitOnPath)('AC18 — a Git remote, from both legs', () => {
  let root: string;
  let nativeRemote: Awaited<ReturnType<typeof startGitHttpBackend>>;
  let browserRemote: Awaited<ReturnType<typeof startGitHttpBackend>>;
  let proxy: Awaited<ReturnType<typeof startProxy>>;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'tau-w12-git-remote-'));
    /* One bare repository per leg: the two push unrelated histories, and a
     * shared one would prove nothing but that git refuses the second. */
    nativeRemote = await startGitHttpBackend({ root: join(root, 'native-remote'), name: 'third-party' });
    browserRemote = await startGitHttpBackend({ root: join(root, 'browser-remote'), name: 'third-party' });
    proxy = await startProxy();
  }, 180_000);

  afterAll(async () => {
    await proxy.close();
    await nativeRemote.close();
    await browserRemote.close();
    await rm(root, { force: true, recursive: true });
  });

  /**
   * Push one project's `main` and its tag, then let stock `git` be the witness.
   *
   * @param port - The store under test, already holding a transport.
   * @param files - What the revision's tree holds.
   * @param remoteUrl - Where the port is told the remote is.
   * @returns The revision `main` now names.
   */
  const connectAndPush = async (
    port: RevisionPort,
    files: Readonly<Record<string, string>>,
    remoteUrl: string,
  ): Promise<RevisionId> => {
    await port.init({ author });
    const receipt = await port.writeRevision({
      parents: [],
      tree: tree(files),
      provenance,
      summary: { generated: 'First revision' },
    });
    const head = revisionId(receipt.commitId);
    await port.updateRef({ name: 'main', expectedHead: undefined, head });
    await port.tag({ name: 'v1', revisionId: head, note: 'The first one' });

    /* *Connect Git remote*: the URL the person typed, under git's own
     * non-reserved name, so `remoteKindOf` reads it back as a Git remote. */
    await port.setRemote({ name: 'origin', url: remoteUrl });
    const remotes = await port.listRemotes();
    expect(remotes.map((remote) => remote.kind)).toContain('git');

    const pushed = await port.push({
      remote: 'origin',
      refs: [{ name: 'refs/heads/main' }, { name: 'refs/tags/v1' }],
      atomic: true,
    });

    expect(pushed.refs.map((entry) => [entry.name, entry.status])).toStrictEqual([
      ['refs/heads/main', 'updated'],
      ['refs/tags/v1', 'updated'],
    ]);
    return head;
  };

  /**
   * What a stock `git clone` of the remote actually checks out.
   *
   * @param label - A directory name for this clone.
   * @param url - The remote to clone.
   * @param files - The files, and the bytes they are expected to hold.
   */
  const expectCloneReproduces = async (
    label: string,
    url: string,
    files: Readonly<Record<string, string>>,
  ): Promise<void> => {
    const target = join(root, `clone-${label}`);
    await runGit('git', ['clone', url, target]);
    const decoder = new TextDecoder();
    for (const [path, content] of Object.entries(files)) {
      // oxlint-disable-next-line no-await-in-loop -- one small file at a time is the point.
      expect(decoder.decode(await readFile(join(target, path)))).toBe(content);
    }
    const { stdout } = await runGit('git', ['tag', '--list'], { cwd: target });
    expect(stdout.trim()).toBe('v1');
  };

  it('pushes main and its tags natively, and a stock clone reproduces the tree byte for byte', async () => {
    const repositoryPath = join(root, 'native-project');
    await mkdir(repositoryPath, { recursive: true });
    const port = createNativeGitRevisionPort({ repositoryPath });
    const files = { 'bracket.scad': 'cube([10, 20, 30]);\n', 'notes/readme.md': '# Bracket\n' };

    const head = await connectAndPush(port, files, nativeRemote.url);

    expect(await nativeRemote.git(['rev-parse', 'refs/heads/main'])).toBe(head);
    // The name travelled with the history set (A39), as a tag object.
    expect(await nativeRemote.git(['cat-file', '-t', 'refs/tags/v1'])).toBe('tag');
    await expectCloneReproduces('native', nativeRemote.url, files);
  }, 180_000);

  it('pushes through the proxy from the browser leg, carrying the remote’s credential and not the Tau session', async () => {
    const apiBaseUrl = proxy.baseUrl;
    const filesystem = await createMemoryProvider();
    /*
     * The **shipped** composition, not a copy of its rule (W12 review R7):
     * `createGitRemoteTransport` is the same factory the browser worker hands
     * to `createRevisionHttpClient`, so this row drives the code that runs in
     * the page over a real `isomorphic-git` conversation. `authorization` is
     * the Tau session, resolved for Tau's own origin only — the worker passes
     * none at all, and passing one here is what makes "a third-party URL never
     * sees it" an assertion rather than an absence.
     */
    const port = createIsomorphicGitRevisionPort({
      filesystem,
      http: createRevisionHttpClient({
        authorization: (url) => (isTauApiUrl(apiBaseUrl, url) ? tauSession : undefined),
        ...createGitRemoteTransport(() => ({
          apiBaseUrl,
          origin: new URL(browserRemote.url).origin,
          authorization: remoteCredential,
        })),
        /* A conversation that stops progressing fails this row instead of
         * hanging the fork (principal's note). */
        signal: AbortSignal.timeout(upstreamTimeoutMilliseconds),
      }),
    });
    const files = { 'housing.scad': 'sphere(12);\n' };

    const head = await connectAndPush(port, files, browserRemote.url);

    expect(await browserRemote.git(['rev-parse', 'refs/heads/main'])).toBe(head);
    await expectCloneReproduces('browser', browserRemote.url, files);

    // Every hop went through the proxy, and every hop carried the remote's own
    // credential — the Tau session reached neither the proxy's target nor the
    // remote (I8, W11a §9.3).
    expect(new Set(proxy.forwarded())).toStrictEqual(new Set([remoteCredential]));
    expect(proxy.refusals()).toStrictEqual([]);
    expect(browserRemote.authorizations()).not.toContain(tauSession);
    expect(new Set(browserRemote.authorizations())).toStrictEqual(new Set([remoteCredential]));
  }, 180_000);
});

/*
 * P20 — a project holding large objects refuses a non-Tau remote, identically
 * on both legs.
 *
 * The premise this replaces was falsified by the W12 review (R3): the browser
 * leg already refused such a push, but with a `400 GIT_PROXY_PATH_REFUSED` from
 * the proxy — unnamed, file-less, and *after* it had decided to upload — while
 * the disk leg succeeded through git-lfs's own `pre-push` hook, straight to the
 * remote's LFS server with the user's own credential helper. So the two legs
 * disagreed about what a push means, which is the A15 problem P20 exists to
 * close. What is asserted here is the agreement, not the refusal: same code,
 * same file list, nothing offered on either leg.
 */
describe.runIf(gitOnPath)('P20 — large objects and a third-party remote', () => {
  let root: string;
  let remote: Awaited<ReturnType<typeof startGitHttpBackend>>;

  /* Over `largeObjectThresholdBytes`, so W9's clean step pointerises it and the
   * project genuinely "holds large objects". */
  const large = ((): string => 'x'.repeat(largeObjectThresholdBytes + 1024))();
  const files = { 'models/housing.step': large, 'readme.md': 'small\n' };

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'tau-w12-p20-'));
    remote = await startGitHttpBackend({ root: join(root, 'remote'), name: 'third-party' });
  }, 180_000);

  afterAll(async () => {
    await remote.close();
    await rm(root, { force: true, recursive: true });
  });

  /**
   * Write one revision holding a large file and offer `main` to a Git remote.
   *
   * @param port - The store under test.
   * @returns Whatever `push` rejected with.
   */
  const refusal = async (port: RevisionPort): Promise<unknown> => {
    await port.init({ author });
    const receipt = await port.writeRevision({
      parents: [],
      tree: tree(files),
      provenance,
      summary: { generated: 'A revision with a large file' },
    });
    await port.updateRef({ name: 'main', expectedHead: undefined, head: revisionId(receipt.commitId) });
    await port.setRemote({ name: 'origin', url: remote.url });
    return port.push({ remote: 'origin', refs: [{ name: 'refs/heads/main' }] }).then(
      () => undefined,
      (error: unknown) => error,
    );
  };

  it('refuses on the disk leg, by name, before git-lfs’s own hook can decide', async () => {
    const repositoryPath = join(root, 'native-project');
    await mkdir(repositoryPath, { recursive: true });

    const error = await refusal(createNativeGitRevisionPort({ repositoryPath }));

    expect(error).toMatchObject({ code: 'LFS_REMOTE_UNSUPPORTED' });
    expect((error as Error).message).toContain('models/housing.step');
    /* `git push` was never spawned, so git-lfs's `pre-push` hook never ran and
     * nothing reached the remote: no `GIT_LFS_SKIP_PUSH` is involved. */
    expect(remote.trail()).toStrictEqual([]);
  }, 180_000);

  it('refuses on the browser leg with the same code and the same file, before any object is offered', async () => {
    const filesystem = await createMemoryProvider();
    const port = createIsomorphicGitRevisionPort({
      filesystem,
      http: createRevisionHttpClient({ signal: AbortSignal.timeout(upstreamTimeoutMilliseconds) }),
    });

    const error = await refusal(port);

    expect(error).toMatchObject({ code: 'LFS_REMOTE_UNSUPPORTED' });
    expect((error as Error).message).toContain('models/housing.step');
    // Not one batch call, not one ref: the refusal is before the wire.
    expect(remote.trail()).toStrictEqual([]);
    expect(remote.uploadCount()).toBe(0);
  }, 180_000);
});

/*
 * AC18's third clause: the same thing against a real GitHub repository.
 *
 * Gated, and skipped everywhere it is not configured, because it needs a
 * credential that may never live in this repository (I8) — the sandbox URL and
 * its token are read from the environment and nowhere else. It is the native
 * leg plus the proxy-shaped browser leg against GitHub's own smart HTTP;
 * browser-through-the-deployed-proxy is W18's, because W11a's proxy refuses
 * `localhost` by design and so cannot be driven from here.
 *
 * To run it:
 *   TAU_E2E_GITHUB_SANDBOX=https://github.com/<owner>/<sandbox>.git \
 *   TAU_E2E_GITHUB_TOKEN=<a token with `public_repo` on that repository> \
 *   pnpm nx test revisions --watch=false -- git-remote.integration
 *
 * The sandbox repository is expected to be empty and disposable: the run pushes
 * a branch of its own name and deletes that branch again, through the same
 * credential helper, however the row ends.
 */
const sandboxUrl = process.env['TAU_E2E_GITHUB_SANDBOX'];
const sandboxToken = process.env['TAU_E2E_GITHUB_TOKEN'];
const sandboxConfigured = gitOnPath && sandboxUrl !== undefined && sandboxToken !== undefined;

describe.runIf(sandboxConfigured)('AC18 — the GitHub sandbox run (env-gated)', () => {
  it('pushes a branch to the sandbox repository and reads it back with stock git', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tau-w12-github-'));
    const repositoryPath = join(root, 'project');
    await mkdir(repositoryPath, { recursive: true });
    const branch = `tau-w12-${String(Date.now())}`;
    let pushedBranch = false;
    try {
      const port = createNativeGitRevisionPort({ repositoryPath });
      await port.init({ author });
      const receipt = await port.writeRevision({
        parents: [],
        tree: tree({ 'sandbox.scad': 'cube(1);\n' }),
        provenance,
        summary: { generated: 'Sandbox revision' },
      });
      const head = revisionId(receipt.commitId);
      await port.updateRef({ name: branch, expectedHead: undefined, head });

      /*
       * A remote Tau holds no credential record for is reached with git's own
       * credential helper, which `createNativeGitRevisionPort` leaves reachable
       * for exactly that case (ruling G1: only Tau-managed remotes switch the
       * helpers off). That is the CLI's and a self-managed remote's seam, and
       * Tau writes no token to disk.
       *
       * So this row hands the run's token to git the same way: a helper local
       * to one `mktemp` repository that echoes what the *environment* holds.
       * The token is never an argument (`ps` reads those), never in the URL
       * (which the proxy refuses outright, `GIT_PROXY_CREDENTIAL_IN_URL`), and
       * never in a file — the config holds the helper, not the secret (W12
       * review R14).
       */
      await runGit(
        'git',
        [
          'config',
          'credential.helper',
          '!f() { echo username=x-access-token; echo "password=$TAU_E2E_GITHUB_TOKEN"; }; f',
        ],
        { cwd: repositoryPath },
      );
      await port.setRemote({ name: 'origin', url: sandboxUrl ?? '' });
      const pushed = await port.push({ remote: 'origin', refs: [{ name: `refs/heads/${branch}` }], atomic: true });
      pushedBranch = pushed.refs[0]?.status === 'updated';

      expect(pushed.refs[0]?.status).toBe('updated');
      const { stdout } = await runGit('git', ['ls-remote', sandboxUrl ?? '', branch], { cwd: repositoryPath });
      expect(stdout).toContain(head);
    } finally {
      try {
        if (pushedBranch) {
          /* The same repository-local helper that pushed it; nothing is left
             behind in the sandbox for the next run to trip over. */
          await runGit('git', ['push', '--delete', 'origin', branch], { cwd: repositoryPath });
        }
      } finally {
        await rm(root, { force: true, recursive: true });
      }
    }
  }, 300_000);
});
