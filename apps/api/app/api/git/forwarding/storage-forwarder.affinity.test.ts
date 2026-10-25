import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { afterEach, describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import type { MetricsService } from '#telemetry/metrics.js';
import { developmentSigningKeyJson } from '#api/git/forwarding/contract/development-keys.js';
import {
  encodeReceiptPrefix,
  framingHeader,
  outcomeHeader,
  receiptPrefixed,
  refusedOutcome,
} from '#api/git/forwarding/contract/framing.js';
import { memberHeader, membersPath, preferInstanceHeader } from '#api/git/forwarding/contract/grant.js';
import { parseSigningKey } from '#api/git/forwarding/contract/keys.js';
import type { GrantFacts } from '#api/git/forwarding/git-executor.js';
import { rendezvousRank } from '#api/git/forwarding/rendezvous.js';
import { StorageForwarder } from '#api/git/forwarding/storage-forwarder.js';
import { StorageRouter } from '#api/git/forwarding/storage-router.js';

/**
 * DC2's router against a stand-in for Fly Proxy in front of three tau-storage
 * Machines: one address, `fly-prefer-instance-id` picks the Machine, any
 * other is answered by the first that is up, and every answer names its
 * Machine in `tau-storage-member`, as tau-storage does.
 */

const members = ['5683d5e1b46e18', '9185079a124e98', 'e2865123a62986'];

const factsFor = (project: string): GrantFacts => ({
  owner: 'user-dc2-hop',
  project,
  callerId: 'user-dc2-hop',
  committedBy: 'user-dc2-hop',
  remainingBytes: 1024 ** 3,
  storageLimitBytes: 1024 ** 3,
  recordedGeneration: 0,
  route: { store: 'r2', authoritative: true },
});

type Member = {
  /** Whether it answers at all; a stopped Machine does not, and the proxy routes elsewhere. */
  up: boolean;
  /** Refuses admission, before reading the body. */
  busy: boolean;
  /** RPC paths it served, with the body bytes it read. */
  served: Array<{ path: string; body: Uint8Array<ArrayBuffer> }>;
};

const upMember = (): Member => ({ up: true, busy: false, served: [] });

const servers: Server[] = [];
const forwarders: StorageForwarder[] = [];

afterEach(async () => {
  for (const forwarder of forwarders.splice(0)) {
    forwarder.close();
  }
  await Promise.all(
    servers.splice(0).map(
      async (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => {
            resolve();
          });
        }),
    ),
  );
});

/** Records `tau.git.spills` by reason; every other instrument is a no-op. */
const recordingMetrics = (): { metrics: MetricsService; spills: string[] } => {
  const spills: string[] = [];
  const metrics = new Proxy({} as Record<string | symbol, unknown>, {
    get: (target, name) => {
      if (name === 'gitSpills') {
        return { add: (_count: number, attributes: { reason: string }) => spills.push(attributes.reason) };
      }
      target[name] ??= { add: () => undefined, record: () => undefined };
      return target[name];
    },
  }) as unknown as MetricsService;
  return { metrics, spills };
};

const proxy = async (): Promise<{
  readonly fleet: Map<string, Member>;
  readonly forwarder: StorageForwarder;
  readonly spills: string[];
  readonly probes: string[];
}> => {
  const fleet = new Map(members.map((id) => [id, upMember()]));
  const probes: string[] = [];
  const answer = async (id: string, request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const member = fleet.get(id)!;
    response.setHeader(memberHeader, id);
    if (request.url === '/health/ready') {
      response.writeHead(200).end('ok');
      return;
    }
    if (member.busy) {
      /* Admission refuses before a byte of the body is read, as tau-storage does. */
      response
        .writeHead(503, { 'content-type': 'application/json', [outcomeHeader]: refusedOutcome })
        .end(JSON.stringify({ code: 'GIT_LEASE_OWNER_BUSY', message: 'Busy.' }));
      return;
    }
    const body = new Uint8Array(await buffer(request));
    member.served.push({ path: request.url ?? '', body });
    if (request.url?.endsWith('/git-receive-pack')) {
      response.writeHead(200, { [framingHeader]: receiptPrefixed });
      response.end(Buffer.concat([encodeReceiptPrefix(undefined), Buffer.from('0000')]));
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ receipt: undefined }));
  };
  const server = createServer((request, response) => {
    if (request.url === membersPath) {
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ members }));
      return;
    }
    const preferred = request.headers[preferInstanceHeader];
    if (request.url === '/health/ready' && typeof preferred === 'string') {
      probes.push(preferred);
    }
    /* Fly Proxy: the preferred Machine when it can take the request, else the first one up. */
    const chosen =
      typeof preferred === 'string' && fleet.get(preferred)?.up === true
        ? preferred
        : members.find((id) => fleet.get(id)!.up)!;
    void answer(chosen, request, response);
  });
  servers.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  const { metrics, spills } = recordingMetrics();
  const forwarder = new StorageForwarder({
    urls: [url],
    key: parseSigningKey(developmentSigningKeyJson('grant'), 'grant'),
    metrics,
    router: new StorageRouter({ urls: [url] }),
    startWaitMilliseconds: 200,
  });
  forwarders.push(forwarder);
  return { fleet, forwarder, spills, probes };
};

const servedBy = (fleet: Map<string, Member>): string[] =>
  [...fleet.entries()].filter(([, member]) => member.served.length > 0).map(([id]) => id);

describe('rendezvous affinity over the deployed members (DC2)', () => {
  it('should send every request of a project to its preferred member, and spread projects over the fleet', async () => {
    const { fleet, forwarder, spills } = await proxy();
    const project = 'proj-dc2-affinity';
    for (let index = 0; index < 4; index += 1) {
      // oxlint-disable-next-line no-await-in-loop -- sequential, so each request sees the last one's answer
      await forwarder.derive(factsFor(project));
    }
    expect(servedBy(fleet)).toEqual([rendezvousRank(project, members)[0]]);

    for (const member of fleet.values()) {
      member.served.length = 0;
    }
    await Promise.all(
      Array.from({ length: 30 }, async (_, index) => forwarder.derive(factsFor(`proj-dc2-spread-${String(index)}`))),
    );
    expect(servedBy(fleet).length).toBeGreaterThan(1);
    expect(spills).toEqual([]);
  });

  it('should send a push the preferred member refused at admission to the next-ranked one, whole, once', async () => {
    const { fleet, forwarder, spills } = await proxy();
    const project = 'proj-dc2-spill';
    const [preferred, next] = rendezvousRank(project, members);
    await forwarder.derive(factsFor(project));
    fleet.get(preferred!)!.busy = true;
    const pack = randomBytes(200 * 1024);

    await forwarder.receivePack(factsFor(project), {
      body: Readable.from([pack.subarray(0, 70_000), pack.subarray(70_000)]),
      gzipped: false,
    });

    const received = fleet.get(next!)!.served.find((entry) => entry.path.endsWith('/git-receive-pack'));
    expect(received?.body).toEqual(new Uint8Array(pack));
    expect(spills).toEqual(['admission']);
  });

  it('should relay the refusal when the next-ranked member refuses too, without a second spill', async () => {
    const { fleet, forwarder, spills } = await proxy();
    for (const member of fleet.values()) {
      member.busy = true;
    }
    const refused = await forwarder.derive(factsFor('proj-dc2-both')).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(HttpException);
    expect((refused as HttpException).getResponse()).toMatchObject({ code: 'GIT_LEASE_OWNER_BUSY' });
    expect(spills).toEqual(['admission']);
  });

  it('should keep a stopped member’s projects ranked to it, spill once within the start wait, and return when it answers', async () => {
    const { fleet, forwarder, spills, probes } = await proxy();
    const project = 'proj-dc2-stopped';
    const [preferred, next] = rendezvousRank(project, members);
    fleet.get(preferred!)!.up = false;

    await forwarder.derive(factsFor(project));
    expect(probes).toEqual([preferred]);
    expect(spills).toEqual(['start_wait']);
    expect(servedBy(fleet)).toEqual([next]);

    /* Started again: the next request probes, finds it, and the project is back. */
    fleet.get(preferred!)!.up = true;
    fleet.get(next!)!.served.length = 0;
    await forwarder.derive(factsFor(project));
    await forwarder.derive(factsFor(project));
    expect(servedBy(fleet)).toEqual([preferred]);
    /* Once it has answered it is warm, so the third request is sent without a probe. */
    expect(probes).toEqual([preferred, preferred]);
    expect(spills).toEqual(['start_wait']);
  });
});
