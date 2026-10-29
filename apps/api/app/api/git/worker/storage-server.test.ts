import { generateKeyPairSync } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import type { IncomingMessage, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { MetricsService } from '#telemetry/metrics.js';
import { developmentPublicKeysJson, developmentSigningKeyJson } from '#api/git/forwarding/contract/development-keys.js';
import { grantContractVersion, grantHeader, mintGrant, storagePath } from '#api/git/forwarding/contract/grant.js';
import type { StorageGrantFacts, StorageOperation } from '#api/git/forwarding/contract/grant.js';
import { parsePublicKeys, parseSigningKey } from '#api/git/forwarding/contract/keys.js';
import type { SigningKey } from '#api/git/forwarding/contract/keys.js';
import { ReplayGuard } from '#api/git/forwarding/contract/replay-guard.js';
import type { StorageGitService } from '#api/git/worker/storage-git.service.js';
import { createStorageRequestHandler } from '#api/git/worker/storage-server.js';
import type { StorageServerOptions } from '#api/git/worker/storage-server.js';

/**
 * DC1 acceptance, over HTTP: tau-storage refuses a bad grant **before it reads
 * a byte of the body**. Every request here sends its headers and the first
 * chunk of a body it never finishes; a server that read the body before it
 * judged the grant would hang on it, and one that judged it first answers
 * `401` at once with `Connection: close` and calls no git operation.
 */

const grantKey = parseSigningKey(developmentSigningKeyJson('grant'), 'grant');
const grantKeys = parsePublicKeys(developmentPublicKeysJson('grant'), 'grant');

const strangerKey = (): SigningKey => {
  const { privateKey } = generateKeyPairSync('ed25519');
  return parseSigningKey(
    JSON.stringify({
      kid: 'grant-9-0000000000000000',
      alg: 'Ed25519',
      privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    }),
    'grant',
  );
};

const project = 'proj-dc1-server';
const otherProject = 'proj-dc1-other';

const factsFor = (operation: StorageOperation, target = project): StorageGrantFacts => ({
  method: 'POST',
  path: storagePath(target, operation),
  owner: 'user-dc1-owner',
  project: target,
  callerId: 'user-dc1-owner',
  committedBy: 'user-dc1-owner',
  remainingBytes: 1024 ** 3,
  storageLimitBytes: 1024 ** 3,
  quotaSentence: 'Your plan is full.',
  recordedGeneration: 0,
  route: { store: 'r2', authoritative: true },
});

/** Every git operation tau-storage serves, each a spy that answers nothing. */
const service = {
  assertServable: vi.fn(),
  uploadPack: vi.fn(),
  receivePack: vi.fn(),
  removeRef: vi.fn(async () => ({ ref: 'refs/heads/main', tip: '0'.repeat(40), generation: 1, receipt: undefined })),
  derive: vi.fn(async () => ({ receipt: undefined })),
  gitRead: vi.fn(),
  endReadSession: vi.fn(),
};

const rejected: Array<{ reason: string }> = [];
const metrics = new Proxy({} as Record<string | symbol, unknown>, {
  get: (target, name) => {
    if (name === 'gitGrantsRejected') {
      return { add: (_count: number, attributes: { reason: string }) => rejected.push(attributes) };
    }
    target[name] ??= { add: vi.fn(), record: vi.fn() };
    return target[name];
  },
}) as unknown as MetricsService;

const logged: string[] = [];
const logger = {
  warn: (fields: Record<string, unknown>, message: string) => logged.push(JSON.stringify({ ...fields, message })),
  error: (fields: Record<string, unknown>, message: string) => logged.push(JSON.stringify({ ...fields, message })),
};

let server: Server;
let base: string;
const replay = new ReplayGuard();

beforeAll(async () => {
  server = createServer(
    createStorageRequestHandler({
      service: service as unknown as StorageGitService,
      grantKeys,
      metrics,
      logger,
      stopping: () => false,
      replay,
    }),
  );
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
});

afterEach(() => {
  vi.clearAllMocks();
  rejected.length = 0;
  logged.length = 0;
});

/**
 * Sends the headers and 64 KiB of a body it never ends, and resolves with the
 * answer, or `undefined` if none came within the window (the body was waited on).
 */
const sendUnfinished = async (
  path: string,
  token: string | undefined,
  at = base,
): Promise<{ status: number; connection: string | undefined; body: string } | undefined> =>
  new Promise((resolve) => {
    const outgoing = httpRequest(new URL(path, at), {
      method: 'POST',
      headers: {
        ...(token === undefined ? {} : { [grantHeader]: token }),
        'content-type': 'application/x-git-receive-pack-request',
        'transfer-encoding': 'chunked',
      },
    });
    const timer = setTimeout(() => {
      outgoing.destroy();
      resolve(undefined);
    }, 2000);
    outgoing.on('response', (response: IncomingMessage) => {
      const chunks: Array<Uint8Array<ArrayBuffer>> = [];
      response.on('data', (chunk: Uint8Array<ArrayBuffer>) => chunks.push(chunk));
      response.on('end', () => {
        clearTimeout(timer);
        outgoing.destroy();
        resolve({
          status: response.statusCode ?? 0,
          connection: response.headers.connection,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    outgoing.on('error', () => undefined);
    outgoing.write(Buffer.alloc(64 * 1024, 7));
  });

/** A second tau-storage whose verifier is at contract version `version`. */
const serve = async (
  version: number,
  extra?: Partial<StorageServerOptions>,
): Promise<{ url: string; close: () => Promise<void> }> => {
  const mixed = createServer(
    createStorageRequestHandler({
      service: service as unknown as StorageGitService,
      grantKeys,
      metrics,
      logger,
      stopping: () => false,
      grantVersion: version,
      ...extra,
    }),
  );
  await new Promise<void>((resolve) => {
    mixed.listen(0, '127.0.0.1', resolve);
  });
  return {
    url: `http://127.0.0.1:${String((mixed.address() as AddressInfo).port)}`,
    close: async () =>
      new Promise<void>((resolve) => {
        mixed.closeAllConnections();
        mixed.close(() => {
          resolve();
        });
      }),
  };
};

const noOperationRan = (): void => {
  for (const spy of Object.values(service)) {
    expect(spy).not.toHaveBeenCalled();
  }
};

describe('tau-storage refuses a grant before it reads the body (DC1)', () => {
  const pushPath = storagePath(project, 'git-receive-pack');

  it('should refuse a grant signed under a kid it does not hold', async () => {
    const { token } = mintGrant(factsFor('git-receive-pack'), { key: strangerKey() });
    const answer = await sendUnfinished(pushPath, token);
    expect(answer).toEqual({ status: 401, connection: 'close', body: '' });
    expect(rejected).toEqual([{ reason: 'unknown_kid' }]);
    noOperationRan();
  });

  it('should refuse a grant at contract version N-2', async () => {
    /* This build is version 1, so N-2 is a verifier two versions ahead of the signer. */
    const ahead = await serve(grantContractVersion + 2);
    try {
      const { token } = mintGrant(factsFor('git-receive-pack'), { key: grantKey });
      const answer = await sendUnfinished(pushPath, token, ahead.url);
      expect(answer).toEqual({ status: 401, connection: 'close', body: '' });
      expect(rejected).toEqual([{ reason: 'version' }]);
      noOperationRan();
    } finally {
      await ahead.close();
    }
  });

  it('should refuse a grant issued more than 30 s in the future or the past', async () => {
    const ahead = mintGrant(factsFor('git-receive-pack'), { key: grantKey, now: Date.now() + 31_000 });
    const behind = mintGrant(factsFor('git-receive-pack'), { key: grantKey, now: Date.now() - 31_000 });
    expect(await sendUnfinished(pushPath, ahead.token)).toEqual({ status: 401, connection: 'close', body: '' });
    expect(await sendUnfinished(pushPath, behind.token)).toEqual({ status: 401, connection: 'close', body: '' });
    expect(rejected.map((entry) => entry.reason)).toEqual(['iat_skew', 'iat_skew']);
    noOperationRan();
  });

  it('should refuse a grant presented at another repository’s path, or naming a path its project does not build', async () => {
    const { token } = mintGrant(factsFor('git-receive-pack'), { key: grantKey });
    const swapped = await sendUnfinished(storagePath(otherProject, 'git-receive-pack'), token);
    /* The facts of one project with the path of another: signed, but not a request this API would mint. */
    const crossed = mintGrant(
      { ...factsFor('git-receive-pack'), path: storagePath(otherProject, 'git-receive-pack') },
      { key: grantKey },
    );
    const forged = await sendUnfinished(storagePath(otherProject, 'git-receive-pack'), crossed.token);
    expect(swapped).toEqual({ status: 401, connection: 'close', body: '' });
    expect(forged).toEqual({ status: 401, connection: 'close', body: '' });
    expect(rejected.map((entry) => entry.reason)).toEqual(['path', 'path']);
    noOperationRan();
  });

  it('should refuse a replayed request id', async () => {
    const { token } = mintGrant(factsFor('derive'), { key: grantKey });
    const first = await fetch(new URL(storagePath(project, 'derive'), base), {
      method: 'POST',
      headers: { [grantHeader]: token },
    });
    expect(first.status).toBe(200);
    expect(service.derive).toHaveBeenCalledTimes(1);
    vi.clearAllMocks();

    const replayed = await sendUnfinished(storagePath(project, 'derive'), token);
    expect(replayed).toEqual({ status: 401, connection: 'close', body: '' });
    expect(rejected).toEqual([{ reason: 'replay' }]);
    noOperationRan();
  });

  it('should refuse a request with no grant at all', async () => {
    expect(await sendUnfinished(pushPath, undefined)).toEqual({ status: 401, connection: 'close', body: '' });
    noOperationRan();
  });

  it('should log the reason and never the grant it refused', async () => {
    const { token } = mintGrant(factsFor('git-receive-pack'), { key: strangerKey() });
    await sendUnfinished(pushPath, token);
    const [signature = 'unreachable'] = token.split('.').slice(-1);
    expect(logged.join('\n')).toContain('unknown_kid');
    expect(logged.join('\n')).not.toContain(signature);
    expect(logged.join('\n')).not.toContain(token);
  });
});

describe('a mixed fleet over HTTP (DC1, FR12)', () => {
  /* N is one past this build, so the rows hold whatever the current version is.
     An API at N signs N-1 until every verifier is at N (the deploy order). */
  const next = grantContractVersion + 1;
  it.each([
    { signed: next, storage: next, label: 'API N with storage N' },
    { signed: grantContractVersion, storage: next, label: 'API N-1 with storage N' },
    { signed: grantContractVersion, storage: grantContractVersion, label: 'API N (signing N-1) with storage N-1' },
  ])('should serve $label', async ({ signed, storage }) => {
    const mixed = await serve(storage);
    try {
      const { token } = mintGrant(factsFor('derive'), { key: grantKey, version: signed });
      const response = await fetch(new URL(storagePath(project, 'derive'), mixed.url), {
        method: 'POST',
        headers: { [grantHeader]: token },
      });
      expect(response.status).toBe(200);
    } finally {
      await mixed.close();
    }
  });

  it('should refuse a grant two versions ahead of the verifier, which is why the verifier deploys first', async () => {
    const mixed = await serve(grantContractVersion);
    try {
      const { token } = mintGrant(factsFor('derive'), { key: grantKey, version: grantContractVersion + 2 });
      const response = await fetch(new URL(storagePath(project, 'derive'), mixed.url), {
        method: 'POST',
        headers: { [grantHeader]: token },
      });
      expect(response.status).toBe(401);
    } finally {
      await mixed.close();
    }
  });
});

describe('git-read sessions on the wire (DC1 review S1)', () => {
  const readPath = storagePath(project, 'git-read');
  const post = async (body: unknown): Promise<number> => {
    const { token } = mintGrant(factsFor('git-read'), { key: grantKey });
    const response = await fetch(new URL(readPath, base), {
      method: 'POST',
      headers: { [grantHeader]: token, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    await response.arrayBuffer();
    return response.status;
  };

  it('should pass a read’s session to the worker', async () => {
    service.gitRead.mockResolvedValueOnce(new Uint8Array(0));
    expect(await post({ args: ['rev-parse', 'HEAD'], generation: 1, session: 'tau-storage-lease:s1' })).toBe(200);
    expect(service.gitRead).toHaveBeenCalledWith(expect.objectContaining({ project }), {
      args: ['rev-parse', 'HEAD'],
      generation: 1,
      session: 'tau-storage-lease:s1',
    });
  });

  it('should end a session without running a command', async () => {
    expect(await post({ session: 'tau-storage-lease:s1', end: true })).toBe(200);
    expect(service.endReadSession).toHaveBeenCalledWith(expect.objectContaining({ project }), 'tau-storage-lease:s1');
    expect(service.gitRead).not.toHaveBeenCalled();
  });
});

describe('tau-storage readiness owns the git probe (DC3)', () => {
  it('should refuse readiness on a Machine with no git, and pass on one with it', async () => {
    const missing = await serve(grantContractVersion, { gitVersion: async () => undefined });
    const present = await serve(grantContractVersion, { gitVersion: async () => 'git version 2.39.5' });
    try {
      const refused = await fetch(new URL('/health/ready', missing.url));
      expect(refused.status).toBe(503);
      expect(await refused.text()).toBe('git is not installed');
      const ready = await fetch(new URL('/health/ready', present.url));
      expect(ready.status).toBe(200);
      /* Liveness stays process-local: a missing binary drains, it does not restart. */
      const live = await fetch(new URL('/health/live', missing.url));
      expect(live.status).toBe(200);
    } finally {
      await missing.close();
      await present.close();
    }
  });
});

describe('tau-storage names itself and its members for the router (DC2)', () => {
  it('should answer the deployed members and name the answering Machine on every response', async () => {
    const fleet = await serve(grantContractVersion, {
      member: '5683d5e1b46e18',
      members: async () => ['5683d5e1b46e18', 'e2865123a62986'],
    });
    try {
      const listed = await fetch(new URL('/v1/members', fleet.url));
      expect(listed.status).toBe(200);
      expect(await listed.json()).toEqual({ members: ['5683d5e1b46e18', 'e2865123a62986'] });
      expect(listed.headers.get('tau-storage-member')).toBe('5683d5e1b46e18');
      const ready = await fetch(new URL('/health/ready', fleet.url));
      await ready.arrayBuffer();
      expect(ready.headers.get('tau-storage-member')).toBe('5683d5e1b46e18');
      /* A refused grant names the Machine too, so a spill is visible from the API. */
      const refused = await fetch(new URL(storagePath(project, 'derive'), fleet.url), { method: 'POST' });
      expect(refused.status).toBe(401);
      expect(refused.headers.get('tau-storage-member')).toBe('5683d5e1b46e18');
    } finally {
      await fleet.close();
    }
  });

  it('should answer no members when none are configured', async () => {
    const lone = await serve(grantContractVersion);
    try {
      const listed = await fetch(new URL('/v1/members', lone.url));
      expect(await listed.json()).toEqual({ members: [] });
    } finally {
      await lone.close();
    }
  });
});

describe('tau-storage answers when a probe or the member list throws (DC2/DC3 review)', () => {
  it('should answer readiness 503 when the git probe throws, and refuse the member list when it throws', async () => {
    const failing = await serve(grantContractVersion, {
      gitVersion: async () => {
        throw new Error('spawn EAGAIN');
      },
      members: async () => {
        throw new Error('the DNS lookup failed');
      },
    });
    try {
      const ready = await fetch(new URL('/health/ready', failing.url), { signal: AbortSignal.timeout(2000) });
      expect(ready.status).toBe(503);
      const listed = await fetch(new URL('/v1/members', failing.url), { signal: AbortSignal.timeout(2000) });
      expect(listed.status).toBe(500);
      expect(await listed.json()).toMatchObject({ code: 'GIT_STORAGE_ERROR' });
    } finally {
      await failing.close();
    }
  });
});
