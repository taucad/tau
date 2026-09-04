/**
 * The page's own Paseo SDK client, one per paired connection.
 *
 * SP-10: `@getpaseo/client` is browser-native, so the E2EE session runs
 * browser ↔ relay ↔ daemon and the Tau API never sees a frame. The API keeps
 * the directory record and releases the pairing material to its owner through
 * `POST /v1/connectors/paseo/:id/offer` — a directory operation, never the data
 * path.
 *
 * The offer is fetched **by whichever thread opens the socket**, never handed
 * across a `postMessage` and never persisted: the API already stores it
 * encrypted at rest, so a second copy in browser storage would add a secret
 * without adding a capability. The fetch rides the session cookie, which a
 * dedicated worker shares with its document.
 */
/* oxlint-disable tau-lint/no-time-unit-suffix -- Public @getpaseo/client option names use millisecond suffixes. */
import { createPaseoClient } from '@getpaseo/client';
import type { PaseoClient } from '@getpaseo/client';
import { buildRelayWebSocketUrl, parseHostPort } from '@getpaseo/protocol/daemon-endpoints';
import { z } from 'zod';

/**
 * The connector's offer response.
 *
 * Validated here rather than trusted: this is a trust boundary (PH22(c)/CL11),
 * and the fields decide which relay a socket dials and which daemon key it
 * pins.
 */
const offerResponseSchema = z.object({
  offer: z.object({
    v: z.literal(2),
    serverId: z.string().min(1),
    daemonPublicKeyB64: z.string().min(1),
    relay: z.object({ endpoint: z.string().min(1), useTls: z.boolean().optional() }),
  }),
  password: z.string().min(1).optional(),
});

/** A paired Paseo connection's pairing material. @public */
export type PaseoConnectionOffer = z.infer<typeof offerResponseSchema>;

/**
 * Fetch the decrypted offer for one connection.
 *
 * @param input - API base and the connection id.
 * @returns The offer and its optional daemon password.
 */
export const fetchPaseoOffer = async (input: {
  readonly apiBaseUrl: string;
  readonly connectionId: string;
  readonly fetch?: typeof globalThis.fetch;
}): Promise<PaseoConnectionOffer> => {
  const request = input.fetch ?? globalThis.fetch;
  const response = await request(
    `${input.apiBaseUrl}/v1/connectors/paseo/${encodeURIComponent(input.connectionId)}/offer`,
    { method: 'POST', credentials: 'include' },
  );
  if (!response.ok) {
    throw Object.assign(new Error(`Paseo connection ${input.connectionId} could not be opened.`), {
      code: 'PASEO_OFFER_UNAVAILABLE',
      status: response.status,
    });
  }
  return offerResponseSchema.parse(await response.json());
};

/** The relay socket URL a client dials for one offer. */
const relayUrl = (offer: PaseoConnectionOffer['offer']): string => {
  const endpoint = parseHostPort(offer.relay.endpoint);
  return buildRelayWebSocketUrl({
    endpoint: offer.relay.endpoint,
    useTls: offer.relay.useTls ?? endpoint.port === 443,
    serverId: offer.serverId,
    role: 'client',
    version: '2',
  });
};

const silent = {
  debug: (): void => undefined,
  info: (): void => undefined,
  warn: (): void => undefined,
  error: (): void => undefined,
};

/**
 * A per-connection SDK client cache.
 *
 * One connection is one daemon, and one socket per daemon is what the relay's
 * multi-client fanout expects; opening a second for a concurrent run would
 * double the E2EE handshake for nothing.
 *
 * ponytail: no eviction — a worker holds a handful of connections for its
 * lifetime. Add idle close if a session ever pairs enough daemons to matter.
 */
export const createPaseoClientCache = (input: {
  readonly apiBaseUrl: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly connect?: (offer: PaseoConnectionOffer, connectionId: string) => Promise<PaseoClient>;
}): {
  readonly clientFor: (connectionId: string) => Promise<PaseoClient>;
  readonly close: () => Promise<void>;
} => {
  const clients = new Map<string, Promise<PaseoClient>>();

  const open = async (connectionId: string): Promise<PaseoClient> => {
    const offer = await fetchPaseoOffer({
      apiBaseUrl: input.apiBaseUrl,
      connectionId,
      ...(input.fetch ? { fetch: input.fetch } : {}),
    });
    if (input.connect) {
      return input.connect(offer, connectionId);
    }
    const client = createPaseoClient({
      url: relayUrl(offer.offer),
      clientId: `tau-web-${connectionId}`,
      appVersion: 'tau-web',
      ...(offer.password ? { password: offer.password } : {}),
      e2ee: { enabled: true, daemonPublicKeyB64: offer.offer.daemonPublicKeyB64 },
      reconnect: { enabled: true, baseDelayMs: 500, maxDelayMs: 10_000 },
      connectTimeoutMs: 15_000,
      logger: silent,
    });
    await client.connect();
    return client;
  };

  return {
    clientFor: async (connectionId) => {
      const cached = clients.get(connectionId);
      if (cached) {
        return cached;
      }
      const pending = open(connectionId);
      clients.set(connectionId, pending);
      try {
        return await pending;
      } catch (error) {
        clients.delete(connectionId);
        throw error;
      }
    },
    close: async () => {
      const pending = [...clients.values()];
      clients.clear();
      const settled = await Promise.allSettled(pending);
      await Promise.allSettled(
        settled.flatMap((result) => (result.status === 'fulfilled' ? [result.value.close()] : [])),
      );
    },
  };
};

/**
 * The page-side client cache the selector lists agents through.
 *
 * Separate from the worker cache on purpose: they are different threads, and
 * the relay's protocol-v2 data sockets are built for multi-client fanout, so a
 * page listing agents while a worker runs a turn is the shape upstream expects.
 */
let pageClients: ReturnType<typeof createPaseoClientCache> | undefined;

/**
 * List the agents one paired connection offers, browser-side.
 *
 * This replaced `GET /v1/connectors/paseo/:id/agents`: the API no longer holds
 * an SDK client, and a directory has no business enumerating a daemon it cannot
 * reach. Agents already bound to a Tau run are filtered out — they are
 * per-run children, never something to start a second turn on.
 *
 * @param input - API base and the connection to enumerate.
 * @returns The selectable agents, in daemon order.
 */
export const listPaseoAgentsOverSdk = async (input: {
  readonly apiBaseUrl: string;
  readonly connectionId: string;
}): Promise<ReadonlyArray<{ id: string; label: string; provider: string; status: string }>> => {
  pageClients ??= createPaseoClientCache({ apiBaseUrl: input.apiBaseUrl });
  const client = await pageClients.clientFor(input.connectionId);
  const agents: Array<{ id: string; label: string; provider: string; status: string }> = [];
  let cursor: string | undefined;
  do {
    // oxlint-disable-next-line no-await-in-loop -- pagination cursors come from the preceding page.
    const result = await client.agents.list({
      scope: 'active',
      page: { limit: 200, ...(cursor ? { cursor } : {}) },
    });
    for (const entry of result.entries) {
      const { agent } = entry;
      if (agent.labels['tauRunId']) {
        continue;
      }
      agents.push({
        id: agent.id,
        label: agent.title ?? `${agent.provider} agent`,
        provider: agent.provider,
        status: agent.status,
      });
    }
    cursor = result.pageInfo.nextCursor ?? undefined;
  } while (cursor);
  return agents;
};
