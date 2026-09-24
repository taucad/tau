/**
 * `remotes.ts` is the whole remotes model both legs read, so its rows are here
 * rather than inside one leg's adapter suite (testing policy: the owning module
 * carries its own).
 *
 * The table that matters is {@link refPatternIsHostLocal}'s: it is asked about
 * *patterns*, and a rule written against the prefix instead of the expansion
 * refuses `+refs/heads/*:refs/remotes/tau/*` — the ordinary fetch refspec.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRevisionHttpClient } from '#http-client.js';

import {
  createGitRemoteTransport,
  gitProxyUrl,
  gitRemoteUrlProblem,
  isGithubRemoteUrl,
  isHostLocalRef,
  isTauApiUrl,
  lfsRemoteUnsupportedMessage,
  refPatternIsHostLocal,
  publishFailureMessage,
  publishOverHttp,
  registerProjectFailureMessage,
  registerProjectOverHttp,
  remoteCarriesLargeObjects,
  remoteKindOf,
  remoteOf,
  remoteTrackingRef,
  remoteTransportError,
  tauRemoteName,
  tauRemoteUrl,
} from '#remotes.js';
import type { GitRemoteCredential } from '#remotes.js';
import type { PublishPublicationActorInput } from '#publish.machine.js';
/* The two W4 rows assert the *consequence* of the code, not only the code: a
   terminal class is what stops `sync.machine` retrying, and that classifier is
   the machine's, not this module's. */
import { syncFailureReason } from '#sync.machine.js';
import { RevisionPortError } from '#revision-port.js';

describe('remotes', () => {
  it('reads the kind from the reserved name, never from the URL', () => {
    expect(remoteKindOf(tauRemoteName)).toBe('tau');
    expect(remoteKindOf('origin')).toBe('git');
    /* A GitHub URL under the reserved name is still the Tau remote, and the Tau
     * API's own URL under `origin` is still a git remote: a host that was
     * configured with another API origin reads the same answer. */
    expect(remoteOf('tau', 'https://github.com/acme/parts.git')).toStrictEqual({
      name: 'tau',
      url: 'https://github.com/acme/parts.git',
      kind: 'tau',
    });
    expect(remoteOf('origin', 'https://api.tau.new/v1/git/p1.git').kind).toBe('git');
  });

  it('builds the smart-HTTP URL a stock git clone is given, with or without a trailing slash', () => {
    expect(tauRemoteUrl('https://api.tau.new', 'p1')).toBe('https://api.tau.new/v1/git/p1.git');
    expect(tauRemoteUrl('https://api.tau.new/', 'p1')).toBe('https://api.tau.new/v1/git/p1.git');
    expect(tauRemoteUrl('https://api.tau.new///', 'p1')).toBe('https://api.tau.new/v1/git/p1.git');
  });

  it('never offers a host-local ref to a remote (W3a R4)', () => {
    for (const ref of [
      'refs/tau/owners/o1',
      'refs/tau/workspaces/w1',
      'refs/tau/revisions/r1',
      'refs/tau/transactions/t1',
      'refs/tau/retention/records/r1',
      'refs/tau/head',
      'refs/remotes/tau/main',
      'refs/heads/sync',
    ]) {
      expect(isHostLocalRef(ref)).toBe(true);
    }
    /* The record set is the half the design *does* push (D14, A15, A30). */
    for (const ref of [
      'refs/heads/main',
      'refs/tags/v1',
      'refs/tau/chats/c1',
      'refs/tau/evidence/e1',
      'refs/tau/artifacts/a1',
    ]) {
      expect(isHostLocalRef(ref)).toBe(false);
    }
  });

  it('refuses only the refspec patterns that address a Tau-managed namespace', () => {
    const answers = [
      'refs/heads/*',
      'refs/heads/main',
      'refs/heads/sync',
      'refs/tags/*',
      'refs/tau/chats/*',
      'refs/remotes/tau/*',
      'refs/tau/*',
      'refs/tau/owners/*',
      'refs/*',
    ].map((pattern) => [pattern, refPatternIsHostLocal(pattern)] as const);

    expect(answers).toStrictEqual([
      /* The ordinary fetch refspec. It can expand to `refs/heads/sync`, which is
       * never *offered* — a per-ref rule, enforced where the name is known. */
      ['refs/heads/*', false],
      ['refs/heads/main', false],
      ['refs/heads/sync', false],
      ['refs/tags/*', false],
      ['refs/tau/chats/*', false],
      // Where a fetch writes: naming it is the point, not an attack.
      ['refs/remotes/tau/*', false],
      ['refs/tau/*', true],
      ['refs/tau/owners/*', true],
      // A pattern wide enough to cover a managed namespace is refused whole.
      ['refs/*', true],
    ]);
  });

  it('lands a fetched ref in git’s own remote-tracking layout', () => {
    expect(remoteTrackingRef('tau', 'refs/heads/main')).toBe('refs/remotes/tau/main');
    expect(remoteTrackingRef('tau', 'refs/tags/v1')).toBe('refs/remotes/tau/tags/v1');
    expect(remoteTrackingRef('tau', 'refs/tau/chats/c1')).toBe('refs/remotes/tau/tau/chats/c1');
  });

  /*
   * The browser's routing rule (S34, P17, W11b review Q2).
   *
   * The `HttpClient` sets whatever its resolvers return, so this predicate is
   * the whole guard between "the Tau session goes to Tau" and "the remote's own
   * credential goes to the remote".
   */
  it('tells Tau’s own API origin from every other remote', () => {
    const api = 'https://api.tau.new';

    expect(isTauApiUrl(api, 'https://api.tau.new/v1/git/p1.git/info/refs?service=git-upload-pack')).toBe(true);
    expect(isTauApiUrl('https://api.tau.new/', 'https://api.tau.new/v1/git/proxy')).toBe(true);
    expect(isTauApiUrl(api, 'https://github.com/owner/repository.git')).toBe(false);
    // A host that merely starts with the origin's text is a different origin.
    expect(isTauApiUrl(api, 'https://api.tau.new.example.com/v1/git/p1.git')).toBe(false);
    expect(isTauApiUrl(api, 'http://api.tau.new/v1/git/p1.git')).toBe(false);
    expect(isTauApiUrl(api, 'not a url')).toBe(false);
  });

  it('sends a third-party request to the API’s git proxy with the remote URL encoded', () => {
    expect(gitProxyUrl('https://api.tau.new/', 'https://github.com/o/r.git/info/refs?service=git-upload-pack')).toBe(
      'https://api.tau.new/v1/git/proxy?url=https%3A%2F%2Fgithub.com%2Fo%2Fr.git%2Finfo%2Frefs%3Fservice%3Dgit-upload-pack',
    );
    // The remote's own query survives as one opaque parameter value.
    expect(
      new URL(gitProxyUrl('https://api.tau.new', 'https://github.com/o/r.git/git-receive-pack')).searchParams.get(
        'url',
      ),
    ).toBe('https://github.com/o/r.git/git-receive-pack');
  });

  it('answers the origin question the same way for case, default port and lookalikes', () => {
    const api = 'https://api.tau.new';

    /* `URL.origin` lowercases the host and drops the default port, so these are
     * the same origin and the predicate says so without a normaliser. */
    expect(isTauApiUrl(api, 'https://API.tau.new:443/v1/git/p1.git')).toBe(true);
    expect(isTauApiUrl(api, 'HTTPS://api.tau.new/v1/git/p1.git')).toBe(true);
    // A different port is a different origin, and so is a path that only looks like one.
    expect(isTauApiUrl(api, 'https://api.tau.new:8443/x')).toBe(false);
    expect(isTauApiUrl(api, 'https://evil.com/https://api.tau.new/x')).toBe(false);
  });

  it('knows which remotes the GitHub sign-in is the credential for', () => {
    expect(isGithubRemoteUrl('https://github.com/owner/repository.git')).toBe(true);
    expect(isGithubRemoteUrl('https://www.github.com/owner/repository.git')).toBe(true);
    expect(isGithubRemoteUrl('https://gitlab.com/owner/repository.git')).toBe(false);
    expect(isGithubRemoteUrl('https://github.com.example.com/owner/repository.git')).toBe(false);
    expect(isGithubRemoteUrl('')).toBe(false);
  });

  it('refuses the four addresses the proxy would refuse, while the person is still typing', () => {
    expect(gitRemoteUrlProblem('https://github.com/owner/repository.git')).toBeUndefined();
    expect(gitRemoteUrlProblem('github.com/owner/repository.git')).toContain('https://');
    expect(gitRemoteUrlProblem('http://github.com/owner/repository.git')).toContain('https');
    expect(gitRemoteUrlProblem('https://user:token@github.com/owner/repository.git')).toContain('password');
    expect(gitRemoteUrlProblem('https://github.com/')).toContain('repository');
    // Two more of the proxy's own refusals, brought forward (review R8).
    expect(gitRemoteUrlProblem('https://github.com/o/r.git?access_token=gho_x')).toContain('token');
    expect(gitRemoteUrlProblem('https://localhost/o/r.git')).toContain('private network');
  });

  /* Ruling P50 (W18 DEF-3): the operator relaxation moves the scheme and the
     address, and nothing else. The default is the row above. */
  it('accepts a local git http-backend only when the host allows private addresses', () => {
    const local = 'http://127.0.0.1:5014/two-client.git';
    expect(gitRemoteUrlProblem(local)).toContain('https');
    expect(gitRemoteUrlProblem(local, {})).toContain('https');
    expect(gitRemoteUrlProblem(local, { allowPrivate: false })).toContain('https');

    expect(gitRemoteUrlProblem(local, { allowPrivate: true })).toBeUndefined();
    expect(gitRemoteUrlProblem('http://dev.localhost:5014/o/r.git', { allowPrivate: true })).toBeUndefined();
    // Everything refused for another reason stays refused.
    expect(gitRemoteUrlProblem('http://user:token@127.0.0.1:5014/o/r.git', { allowPrivate: true })).toContain(
      'password',
    );
    expect(gitRemoteUrlProblem('http://127.0.0.1:5014/', { allowPrivate: true })).toContain('repository');
    expect(gitRemoteUrlProblem('ftp://127.0.0.1/o/r.git', { allowPrivate: true })).toContain('https');
  });

  it('lets only Tau Cloud carry a project’s large objects (P20)', () => {
    expect(remoteCarriesLargeObjects('tau')).toBe(true);
    expect(remoteCarriesLargeObjects('origin')).toBe(false);
    // The refusal names files, never a count (D16, AC16).
    expect(lfsRemoteUnsupportedMessage(['models/housing.step', 'models/bracket.step'])).toBe(
      'Large files cannot be backed up to a Git remote: models/bracket.step, models/housing.step. Connect Tau Cloud instead, or remove them from the project.',
    );
  });
});

/*
 * The two credentials, and the wall between them (charter W12, S34, P17).
 *
 * `createRevisionHttpClient` sets whatever its resolvers return and guards
 * nothing itself (W11b review Q2), so this factory *is* the guard. The rows
 * below are what make its three claims facts: Tau's own origin is reached
 * directly with no proxy header; a third-party origin is reached through the
 * proxy and carries the credential **minted for that origin and no other**
 * (review R1); and nothing is reached at all before routing is known.
 */
describe('remoteTransportError', () => {
  /* Contract §4: the server refuses a rewind or a deletion on *every* ref
   * family from its `pre-receive` hook, which answers over the sideband and
   * never with an HTTP status — so the status rule alone read a refusal every
   * retry would repeat as an outage the next one would clear. */
  it('reads a sideband refusal with no HTTP status as a rejection, in the server’s own words', () => {
    const stderr = [
      'remote: Tau: refused refs/tau/chats/abc — it does not fast-forward 1a2b3c4d',
      'To https://api.tau.build/v1/git/p1.git',
      ' ! [remote rejected] refs/tau/chats/abc -> refs/tau/chats/abc (pre-receive hook declined)',
      "error: failed to push some refs to 'https://api.tau.build/v1/git/p1.git'",
    ].join('\n');

    const refusal = remoteTransportError(new Error(stderr), { remote: tauRemoteName, stderr });

    expect(refusal.code).toBe('REMOTE_REJECTED');
    // N4: the sentence is surfaced, never replaced with one of Tau's own.
    expect(refusal.message).toBe('Tau: refused refs/tau/chats/abc — it does not fast-forward 1a2b3c4d');
  });

  /*
   * D20's ceiling refusal arrives the same way — on the sideband, with no HTTP
   * status — but it is a quota answer, not a rule the caller broke, so it must
   * reach the machine as `quota` and not offer "Sync now" again. It is told
   * apart by the marker the hook opens with (`ceilingRefusalMarker`,
   * `apps/api/app/api/git/git.constants.ts`), and the remote's own sentence and
   * file list are still what the caller reads (NI13, N4).
   */
  it('reads the ceiling refusal on the sideband as a quota answer, with the file list intact', () => {
    const stderr = [
      'remote: Tau: repository size limit exceeded — this push needs 4080 bytes more than this repository may hold.',
      'remote: Tau: the largest files it adds are:',
      'remote:   huge.bin (5000 bytes)',
      'remote: Tau: nothing was written.',
      'To https://api.tau.build/v1/git/p1.git',
      ' ! [remote rejected] refs/heads/main -> refs/heads/main (pre-receive hook declined)',
    ].join('\n');

    const refusal = remoteTransportError(new Error(stderr), { remote: tauRemoteName, stderr });

    expect(refusal.code).toBe('REMOTE_QUOTA_EXCEEDED');
    expect(syncFailureReason(refusal)).toBe('quota');
    expect(refusal.message).toContain('Tau: repository size limit exceeded');
    expect(refusal.message).toContain('huge.bin (5000 bytes)');
  });

  /* D18: a Git remote that cannot hold large objects is not a plan problem,
   * so the class that offers *Upgrade* must not claim it. */
  it('should classify a large-object refusal on a Git remote apart from the storage plan', () => {
    const refusal = new RevisionPortError('LFS_REMOTE_UNSUPPORTED', lfsRemoteUnsupportedMessage(['huge.step']));

    expect(syncFailureReason(refusal)).toBe('largeFiles');
  });

  it('leaves a sideband refusal without the ceiling marker a plain rejection', () => {
    const stderr = [
      'remote: Tau: refused refs/heads/main — Tau Cloud never deletes a ref; retention is decided on the server.',
      ' ! [remote rejected] refs/heads/main -> refs/heads/main (pre-receive hook declined)',
    ].join('\n');

    const refusal = remoteTransportError(new Error(stderr), { remote: tauRemoteName, stderr });

    expect(refusal.code).toBe('REMOTE_REJECTED');
    expect(syncFailureReason(refusal)).toBe('rejected');
  });

  /* Rule 19: a browser request always sends `Origin`, so the API answers with
   * its JSON envelope, whose sentence is `error` (`HttpExceptionFilter`); only
   * git-lfs's batch body names it `message`. Reading `message` alone rendered
   * the generic class sentence for every browser refusal but the one whose
   * copy happens to coincide. */
  it('surfaces the server’s sentence from the API envelope’s `error` field', () => {
    const sentence = 'You have reached the 3-project limit of your plan.';
    const thrown = Object.assign(new Error('HTTP Error: 403 Forbidden'), {
      data: {
        statusCode: 403,
        response: JSON.stringify({
          error: sentence,
          code: 'PROJECT_LIMIT_REACHED',
          statusCode: 403,
          path: '/v1/git/p1.git/git-receive-pack',
          requestId: 'r1',
        }),
      },
    });

    const refusal = remoteTransportError(thrown, { remote: tauRemoteName });

    expect(refusal.code).toBe('REMOTE_FORBIDDEN');
    expect(refusal.message).toBe(sentence);
  });

  it('still prefers `message` where a body carries one, as git-lfs batch refusals do', () => {
    const thrown = Object.assign(new Error('HTTP Error: 413'), {
      data: {
        statusCode: 413,
        response: JSON.stringify({ code: 'GIT_QUOTA_EXCEEDED', message: 'Tau Cloud storage is full.', error: 'x' }),
      },
    });

    expect(remoteTransportError(thrown, { remote: tauRemoteName }).message).toBe('Tau Cloud storage is full.');
  });

  /* W4: the hosted remote answers `410 GIT_REPOSITORY_DELETED` for a project it
   * has tombstoned (charter NI12). Without a ladder row it fell through to
   * `REMOTE_UNAVAILABLE`, which `sync.machine` retries — so a sync loop kept
   * asking a deleted project for its refs forever. It joins 404's terminal
   * class, and the server's own sentence is what says which of the two it was. */
  it('reads a tombstoned project as terminally not found, in the server’s own words', () => {
    const sentence = 'This project has been deleted.';
    const thrown = Object.assign(new Error('HTTP Error: 410 Gone'), {
      data: {
        statusCode: 410,
        response: JSON.stringify({ error: sentence, code: 'GIT_REPOSITORY_DELETED', statusCode: 410 }),
      },
    });

    const refusal = remoteTransportError(thrown, { remote: tauRemoteName });

    expect(refusal.code).toBe('REMOTE_NOT_FOUND');
    expect(refusal.message).toBe(sentence);
    /* The point of the row: `notFound` is terminal, so nothing retries it. */
    expect(syncFailureReason(refusal)).toBe('notFound');
  });

  /* W4: `422 GIT_PUSH_NOT_COMMITTABLE` is the commit protocol refusing the refs
   * themselves — loose objects, or packs that failed the connectivity check.
   * A re-push reproduces it, so it is a rejection in the server's words rather
   * than the retryable outage `REMOTE_UNAVAILABLE` made it. */
  it('reads an uncommittable push as a rejection carrying the server’s sentence', () => {
    const sentence = 'the lease holds 3 loose objects; committing would name refs whose objects are in no pack';
    const thrown = Object.assign(new Error('HTTP Error: 422'), {
      data: {
        statusCode: 422,
        response: JSON.stringify({ error: sentence, code: 'GIT_PUSH_NOT_COMMITTABLE', statusCode: 422 }),
      },
    });

    const refusal = remoteTransportError(thrown, { remote: tauRemoteName });

    expect(refusal.code).toBe('REMOTE_REJECTED');
    expect(refusal.message).toBe(sentence);
    expect(syncFailureReason(refusal)).toBe('rejected');
  });

  /* D11: the git proxy refuses to carry a credential across a redirect and says
   * so with a typed 409. That is a moved repository, not an outage to retry. */
  it('reads the proxy’s refused credentialed redirect as a moved repository', () => {
    const body = {
      statusCode: 409,
      code: 'GIT_PROXY_REDIRECTED_CREDENTIAL',
      error: 'The repository moved; confirm its new location before sending the credential there',
      location: 'https://github.com/octo/renamed.git/info/refs',
    };
    const thrown = Object.assign(new Error('HTTP Error: 409 Conflict'), {
      data: { statusCode: 409, response: JSON.stringify(body) },
    });

    const refusal = remoteTransportError(thrown, { remote: 'origin' });

    expect(refusal.code).toBe('REMOTE_MOVED');
    expect(refusal.message).toBe(body.error);
    expect(syncFailureReason(refusal)).toBe('moved');
    /* Any other 409 is still the retryable class. */
    const other = Object.assign(new Error('HTTP Error: 409 Conflict'), {
      data: { statusCode: 409, response: JSON.stringify({ code: 'SOMETHING_ELSE' }) },
    });
    expect(remoteTransportError(other, { remote: 'origin' }).code).toBe('REMOTE_UNAVAILABLE');
  });

  it('still reads a failure with neither a status nor a server sentence as unreachable', () => {
    const stderr = "fatal: unable to access 'https://api.tau.build/v1/git/p1.git/': Could not resolve host";

    expect(remoteTransportError(new Error(stderr), { remote: tauRemoteName, stderr }).code).toBe('ENGINE_FAILED');
  });
});

describe('createGitRemoteTransport', () => {
  const apiBaseUrl = 'https://api.tau.test';
  const github = 'https://github.com';
  const credential = 'Bearer gho_third_party';
  const held =
    (value: GitRemoteCredential): (() => GitRemoteCredential) =>
    () =>
      value;

  /** Records what actually reached the network, which is the only honest witness. */
  const recordFetch = (): Array<{ url: string; headers: Headers }> => {
    const calls: Array<{ url: string; headers: Headers }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      calls.push({
        url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        headers: new Headers(init?.headers),
      });
      return new Response(new Uint8Array(), { status: 200 });
    });
    return calls;
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never sends the proxy header to Tau’s own origin, and never proxies its URL', async () => {
    const calls = recordFetch();
    const client = createRevisionHttpClient({
      credentials: 'include',
      ...createGitRemoteTransport(held({ apiBaseUrl, origin: github, authorization: credential })),
    });
    const tauUrl = `${apiBaseUrl}/v1/git/p1.git/info/refs?service=git-upload-pack`;

    await client.request({ url: tauUrl });

    expect(calls[0]?.url).toBe(tauUrl);
    expect(calls[0]?.headers.get('x-tau-proxy-authorization')).toBeNull();
  });

  it('sends a third-party request through the proxy, with the remote’s credential and no Tau session', async () => {
    const calls = recordFetch();
    const client = createRevisionHttpClient({
      credentials: 'include',
      /* A browser host passes no `authorization` at all: the Tau session is the
       * cookie, which the browser scopes to the API origin for us. */
      ...createGitRemoteTransport(held({ apiBaseUrl, origin: github, authorization: credential })),
    });

    await client.request({ url: 'https://github.com/o/r.git/info/refs?service=git-receive-pack' });

    const [call] = calls;
    expect(call?.url).toBe(
      `${apiBaseUrl}/v1/git/proxy?url=https%3A%2F%2Fgithub.com%2Fo%2Fr.git%2Finfo%2Frefs%3Fservice%3Dgit-receive-pack`,
    );
    expect(call?.headers.get('x-tau-proxy-authorization')).toBe(credential);
    // The Tau session never travels as a header, and never to a third party.
    expect(call?.headers.get('authorization')).toBeNull();
  });

  /*
   * Review R1, the defect this attempt exists for: within one page session a
   * person connects GitHub, disconnects, and connects GitLab. A credential
   * bound to "not Tau" would be handed to gitlab.com through the proxy, which
   * forwards it as `Authorization`.
   */
  it('never offers a credential minted for one remote to the next one', async () => {
    const calls = recordFetch();
    let current: GitRemoteCredential = { apiBaseUrl, origin: github, authorization: credential };
    const client = createRevisionHttpClient({ ...createGitRemoteTransport(() => current) });

    await client.request({ url: 'https://github.com/o/r.git/info/refs' });
    expect(calls[0]?.headers.get('x-tau-proxy-authorization')).toBe(credential);

    /* Disconnect, then connect a different host. The page sends a frame for the
     * new remote; nothing about the old one survives it. */
    current = { apiBaseUrl, origin: 'https://gitlab.com' };
    await client.request({ url: 'https://gitlab.com/o/r.git/info/refs' });

    expect(calls[1]?.url).toBe(`${apiBaseUrl}/v1/git/proxy?url=https%3A%2F%2Fgitlab.com%2Fo%2Fr.git%2Finfo%2Frefs`);
    expect(calls[1]?.headers.get('x-tau-proxy-authorization')).toBeNull();

    /* Even while the GitHub credential is still the held one — a frame that has
     * not arrived yet — a different origin gets nothing. */
    current = { apiBaseUrl, origin: github, authorization: credential };
    await client.request({ url: 'https://gitlab.com/o/r.git/git-receive-pack' });

    expect(calls[2]?.headers.get('x-tau-proxy-authorization')).toBeNull();
  });

  it('reads a session that can no longer mint a credential as *Reconnect*, and only for its own remote', () => {
    const transport = createGitRemoteTransport(
      held({ apiBaseUrl, origin: github, unavailable: 'Your GitHub connection needs renewing.' }),
    );

    expect(() => transport.proxyAuthorization('https://github.com/o/r.git/git-receive-pack')).toThrow(
      'Your GitHub connection needs renewing.',
    );
    // A remote GitHub has nothing to do with is not *Reconnect GitHub* (review R1).
    expect(transport.proxyAuthorization('https://gitlab.com/o/r.git/git-receive-pack')).toBeUndefined();
    expect(transport.proxyAuthorization(`${apiBaseUrl}/v1/git/p1.git/git-receive-pack`)).toBeUndefined();
  });

  it('reaches nothing at all before the page has said which origin is Tau’s', async () => {
    recordFetch();
    const client = createRevisionHttpClient({ ...createGitRemoteTransport(() => undefined) });

    await expect(client.request({ url: 'https://github.com/o/r.git/info/refs' })).rejects.toThrow(
      'has not been told where the Tau API is',
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

/**
 * W5b: a collaborator pressing *Connect* (D27).
 *
 * `PUT /v1/projects/:id` needs `owner`, so a `write` collaborator reaching it
 * is answered `403 PROJECT_ROLE_INSUFFICIENT` — a class this ladder had no rung
 * for, which made it fall through to "Try again" on a refusal that retrying
 * cannot fix.
 */
describe('registerProjectFailureMessage', () => {
  it('tells a collaborator the owner alone backs a project up', () => {
    expect(registerProjectFailureMessage(403, 'PROJECT_ROLE_INSUFFICIENT', 'Forbidden')).toBe(
      'Only the project owner can back this project up to Tau Cloud.',
    );
  });

  it('keeps the classes it already answered', () => {
    expect(registerProjectFailureMessage(403, 'GIT_SYNC_NOT_ENTITLED')).toBe(
      'Syncing files to Tau Cloud is a paid plan feature.',
    );
    expect(registerProjectFailureMessage(404)).toBe('Tau Cloud has no project with this id for your account.');
    expect(registerProjectFailureMessage(500)).toBe('Tau Cloud could not register this project. Try again.');
  });
});

/**
 * W10.5: one publish-refusal ladder for both compositions.
 *
 * The browser worker and the Node daemon each carried their own copy, and they
 * disagreed: the worker answered 401 with *Sign in to publish this project.*
 * and had a rung for a version too large to share, while the daemon answered
 * 401 with a `TAU_API_TOKEN` hint and had no 413 rung at all — so the same
 * response produced a different sentence depending on which host asked (C6).
 */
describe('publishFailureMessage', () => {
  const rows: ReadonlyArray<readonly [status: number, code: string | undefined, message: string]> = [
    [401, undefined, 'Sign in to publish this project.'],
    [401, 'ENTITLEMENT_REQUIRED', 'Sign in to publish this project.'],
    [403, 'ENTITLEMENT_REQUIRED', 'Private links need the Pro plan.'],
    [400, 'MISSING_ENTRY_PATH', 'This version does not contain the file this project opens with.'],
    [413, undefined, 'This version is larger than a shared link may be.'],
    [400, 'PAYLOAD_TOO_LARGE', 'This version is larger than a shared link may be.'],
    [500, undefined, 'Tau Cloud could not publish this project. Try again.'],
    [429, 'SOMETHING_NEW', 'Tau Cloud could not publish this project. Try again.'],
  ];

  it.each(rows)('answers %i/%s with one sentence for every host', (status, code, message) => {
    expect(publishFailureMessage(status, code)).toBe(message);
  });
});

/**
 * The two legs differ by their credential and by nothing else (W10.5).
 *
 * A browser worker has the document's cookie and a terminal has a bearer token;
 * both reach the same endpoint, read the same body and raise the same sentence,
 * which is what makes one function the right shape for the pair.
 */
describe('the Tau Cloud publish and register legs', () => {
  const capture = (
    status: number,
    body: unknown,
  ): Readonly<{ calls: RequestInit[]; urls: string[]; restore: () => void }> => {
    const calls: RequestInit[] = [];
    const urls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      urls.push(input instanceof Request ? input.url : input.toString());
      calls.push(init ?? {});
      return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof globalThis.fetch;
    return {
      calls,
      urls,
      restore: () => {
        globalThis.fetch = original;
      },
    };
  };

  const draft = { revisionId: 'r1', projectId: 'p1', tag: 'v1' } as unknown as PublishPublicationActorInput;

  it('raises the same refusal for the same response on the cookie and the bearer leg', async () => {
    const refused = capture(413, {});
    try {
      await expect(publishOverHttp('https://api.test', { kind: 'cookie' }, draft)).rejects.toThrow(
        'This version is larger than a shared link may be.',
      );
      await expect(
        publishOverHttp('https://api.test', { kind: 'bearer', authorization: 'Bearer t' }, draft),
      ).rejects.toThrow('This version is larger than a shared link may be.');
    } finally {
      refused.restore();
    }
  });

  it('carries the document cookie on one leg and the bearer header on the other', async () => {
    const answered = capture(200, { id: 'pub-1', urls: { share: 'https://tau.new/s/1' } });
    try {
      await publishOverHttp('https://api.test/', { kind: 'cookie' }, draft);
      await publishOverHttp('https://api.test', { kind: 'bearer', authorization: 'Bearer t' }, draft);

      expect(answered.urls).toEqual(['https://api.test/v1/publications', 'https://api.test/v1/publications']);
      expect(answered.calls[0]?.credentials).toBe('include');
      expect((answered.calls[0]?.headers ?? {}) as Record<string, string>).not.toHaveProperty('Authorization');
      expect(answered.calls[1]?.credentials).toBeUndefined();
      expect((answered.calls[1]?.headers ?? {}) as Record<string, string>).toHaveProperty('Authorization', 'Bearer t');
    } finally {
      answered.restore();
    }
  });

  it('registers a project on either leg and raises the shared register ladder', async () => {
    const refused = capture(403, { code: 'PROJECT_ROLE_INSUFFICIENT', message: 'Forbidden' });
    try {
      await expect(
        registerProjectOverHttp('https://api.test', { kind: 'cookie' }, { id: 'p1', name: 'Alpha' }),
      ).rejects.toThrow('Only the project owner can back this project up to Tau Cloud.');
      await expect(
        registerProjectOverHttp(
          'https://api.test',
          { kind: 'bearer', authorization: 'Bearer t' },
          { id: 'p1', name: undefined },
        ),
      ).rejects.toThrow('Only the project owner can back this project up to Tau Cloud.');

      expect(refused.urls).toEqual(['https://api.test/v1/projects/p1', 'https://api.test/v1/projects/p1']);
      expect(refused.calls[0]?.body).toBe(JSON.stringify({ name: 'Alpha' }));
      expect(refused.calls[1]?.body).toBe(JSON.stringify({}));
    } finally {
      refused.restore();
    }
  });
});
