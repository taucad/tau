/**
 * A Paseo daemon the real SDK can talk to.
 *
 * Ruling 5's fixture. It is deliberately *not* a stub injected into the page:
 * the browser runs the real `createPaseoClient`, performs the real relay
 * handshake and the real ECDH E2EE handshake (`createDaemonChannel` and
 * `generateKeyPair` here are upstream's own primitives), and speaks the real
 * protocol-v2 session vocabulary. Nothing in `apps/ui` changes to accommodate
 * a test — the offer the API fixture serves simply points at this server.
 *
 * What it fakes is the *daemon*, not the protocol: a scripted agent inventory
 * and a scripted turn. That is the honest boundary — everything between the
 * page and this socket is production code.
 */
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { createDaemonChannel, exportPublicKey, generateKeyPair } from '@getpaseo/relay/e2ee';
import type { Transport } from '@getpaseo/relay/e2ee';
import type { AgentTimelineItem } from '@getpaseo/protocol/agent-types';
import { extractSessionMessage, wrapSessionMessage } from '@getpaseo/protocol/messages';

/** One agent this daemon offers the selector. @public */
export type FakePaseoAgent = {
  readonly id: string;
  readonly title: string;
  readonly provider: string;
  readonly model: string;
  readonly labels?: Readonly<Record<string, string>>;
};

/** What the scripted turn emits once a prompt arrives. @public */
export type FakePaseoTurn = {
  /** Canonical items streamed in order, each as its own timeline frame. */
  readonly items: readonly AgentTimelineItem[];
  /** Ask for a permission before the items, resolved through Tau's banner. */
  readonly permission?: { readonly id: string; readonly name: string; readonly title: string } | undefined;
};

/** Options for {@link startPaseoFakeDaemon}. @public */
export type StartPaseoFakeDaemonOptions = {
  readonly serverId?: string;
  readonly agents?: readonly FakePaseoAgent[];
  readonly turn?: FakePaseoTurn;
};

/** A running fake daemon. @public */
export type PaseoFakeDaemon = {
  /** `host:port`, exactly as a pairing offer spells a relay endpoint. */
  readonly endpoint: string;
  readonly serverId: string;
  readonly daemonPublicKeyB64: string;
  /** Every session message this daemon received, for assertions. */
  readonly received: () => ReadonlyArray<{ readonly type: string }>;
  /** Every `create_agent_request`, so a test can read the session it asked for. */
  readonly createRequests: () => ReadonlyArray<{
    readonly config?: { readonly mcpServers?: Record<string, unknown> } | undefined;
  }>;
  readonly close: () => Promise<void>;
};

const nowIso = (): string => new Date().toISOString();

const workspaceCwd = '/tmp/fake-paseo-workspace';

/** The placement every agent entry carries; a plain non-git directory. */
const placement = {
  projectKey: 'fake-paseo-project',
  projectName: 'Fake Paseo project',
  checkout: {
    cwd: workspaceCwd,
    isGit: false,
    currentBranch: null,
    remoteUrl: null,
    isPaseoOwnedWorktree: false,
    mainRepoRoot: null,
  },
};

const snapshotFor = (agent: FakePaseoAgent, status = 'idle') => ({
  id: agent.id,
  provider: agent.provider,
  cwd: workspaceCwd,
  model: agent.model,
  createdAt: nowIso(),
  updatedAt: nowIso(),
  lastUserMessageAt: null,
  status,
  capabilities: {
    supportsStreaming: true,
    supportsSessionPersistence: true,
    supportsDynamicModes: false,
    supportsMcpServers: true,
    supportsReasoningStream: false,
    supportsToolInvocations: true,
  },
  currentModeId: null,
  availableModes: [],
  pendingPermissions: [],
  persistence: null,
  title: agent.title,
  ...(agent.labels ? { labels: agent.labels } : { labels: {} }),
});

/** A `ws` socket as the E2EE channel's transport. */
const transportFor = (socket: WebSocket): Transport => {
  const transport: Transport = {
    send: (data) => {
      socket.send(data);
    },
    close: (code, reason) => {
      socket.close(code, reason);
    },
    onmessage: null,
    onclose: null,
    onerror: null,
  };
  socket.on('message', (data: Uint8Array<ArrayBuffer>, isBinary: boolean) => {
    transport.onmessage?.({
      data: isBinary ? new Uint8Array(data).buffer : new TextDecoder().decode(data),
      isBinary,
    });
  });
  socket.on('close', (code: number, reason: Uint8Array<ArrayBuffer>) => {
    transport.onclose?.(code, new TextDecoder().decode(reason));
  });
  socket.on('error', (error: Error) => {
    transport.onerror?.(error);
  });
  return transport;
};

/**
 * Start the fake daemon.
 *
 * @param options - Server identity, agent inventory, and the scripted turn.
 * @returns The endpoint and daemon key a pairing offer needs, plus teardown.
 * @public
 */
export const startPaseoFakeDaemon = async (options: StartPaseoFakeDaemonOptions = {}): Promise<PaseoFakeDaemon> => {
  const serverId = options.serverId ?? 'fake-paseo-daemon';
  const agents = options.agents ?? [
    { id: 'fake-claude', title: 'Claude Code', provider: 'anthropic', model: 'claude-sonnet' },
  ];
  const turn = options.turn ?? { items: [] };
  const keyPair = generateKeyPair();
  const daemonPublicKeyB64 = exportPublicKey(keyPair.publicKey);
  const received: Array<{ readonly type: string }> = [];
  const createRequests: Array<{ readonly config?: { readonly mcpServers?: Record<string, unknown> } | undefined }> = [];

  /** Run-scoped agents this daemon created, keyed by id. */
  const created = new Map<string, FakePaseoAgent>();
  /** Canonical timeline per agent; `seqEnd` is the index + 1. */
  const timelines = new Map<string, AgentTimelineItem[]>();
  const epoch = 'epoch-1';

  const agentById = (id: string): FakePaseoAgent | undefined =>
    created.get(id) ?? agents.find((agent) => agent.id === id);

  const server: Server = createServer();
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (socket, request) => {
    const role = new URL(request.url ?? '/', 'http://localhost').searchParams.get('role');
    if (role !== 'client') {
      socket.close(1008, 'only client role is served');
      return;
    }
    // async-iife: bootstrap — one connection handshake; the server owns its lifetime.
    void (async (): Promise<void> => {
      let send: (value: unknown) => void = () => undefined;
      const channel = await createDaemonChannel(transportFor(socket), keyPair, {
        onmessage: (data) => {
          const envelope: unknown = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data));
          // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the wire is unknown until the envelope is read.
          const message = (extractSessionMessage(envelope as never) ?? envelope) as {
            type: string;
            requestId?: string;
            agentId?: string;
            text?: string;
            config?: { provider?: string; mcpServers?: Record<string, unknown> };
            title?: string;
            labels?: Record<string, string>;
            cursor?: { epoch: string; seq: number };
            direction?: string;
            filter?: { labels?: Record<string, string> };
          };
          received.push({ type: message.type });
          handle(message, send);
        },
      });
      send = (value: unknown) => {
        void channel.send(JSON.stringify(wrapSessionMessage(value as never)));
      };
      /* The client only reports "connected" once it sees server_info; every
       * request it queues before that is flushed the moment this lands. */
      send({ type: 'status', payload: { status: 'server_info', serverId } });
    })();
  });

  const timelineResponse = (requestId: string, agentId: string, cursor?: { epoch: string; seq: number }) => {
    const items = timelines.get(agentId) ?? [];
    const after = cursor?.epoch === epoch ? cursor.seq : 0;
    const entries = items.slice(after).map((item, index) => ({
      provider: agentById(agentId)?.provider ?? 'anthropic',
      item,
      timestamp: nowIso(),
      seqStart: after + index + 1,
      seqEnd: after + index + 1,
      sourceSeqRanges: [],
      collapsed: false,
    }));
    const agent = agentById(agentId);
    return {
      type: 'fetch_agent_timeline_response',
      payload: {
        requestId,
        agentId,
        agent: agent ? snapshotFor(agent) : null,
        direction: 'after',
        projection: 'canonical',
        epoch,
        reset: false,
        staleCursor: false,
        gap: false,
        window: { minSeq: 1, maxSeq: items.length, nextSeq: items.length + 1 },
        startCursor: entries.length > 0 ? { epoch, seq: entries[0]!.seqStart } : null,
        endCursor: entries.length > 0 ? { epoch, seq: entries.at(-1)!.seqEnd } : null,
        hasOlder: after > 0,
        hasNewer: false,
        entries,
        error: null,
      },
    };
  };

  /** Stream the scripted turn: one `agent_stream` frame per canonical item. */
  const runTurn = (agentId: string, send: (value: unknown) => void): void => {
    const items = timelines.get(agentId) ?? [];
    const provider = agentById(agentId)?.provider ?? 'anthropic';
    const emit = (event: unknown, seq?: number): void => {
      send({
        type: 'agent_stream',
        payload: { agentId, timestamp: nowIso(), event, ...(seq === undefined ? {} : { epoch, seq }) },
      });
    };
    emit({ type: 'turn_started', provider });
    if (turn.permission) {
      emit({
        type: 'permission_requested',
        provider,
        request: {
          id: turn.permission.id,
          provider,
          name: turn.permission.name,
          kind: 'tool',
          title: turn.permission.title,
        },
      });
      return;
    }
    for (const item of turn.items) {
      items.push(item);
      emit({ type: 'timeline', provider, item }, items.length);
    }
    timelines.set(agentId, items);
    emit({ type: 'turn_completed', provider });
  };

  const handle = (
    message: {
      type: string;
      requestId?: string;
      agentId?: string;
      config?: { provider?: string; mcpServers?: Record<string, unknown> };
      title?: string;
      labels?: Record<string, string>;
      cursor?: { epoch: string; seq: number };
      filter?: { labels?: Record<string, string> };
    },
    send: (value: unknown) => void,
  ): void => {
    const requestId = message.requestId ?? '';
    switch (message.type) {
      case 'fetch_agents_request': {
        const wanted = message.filter?.labels;
        const matching = [...agents, ...created.values()].filter((agent) =>
          wanted === undefined ? true : Object.entries(wanted).every(([key, value]) => agent.labels?.[key] === value),
        );
        send({
          type: 'fetch_agents_response',
          payload: {
            requestId,
            entries: matching.map((agent) => ({ agent: snapshotFor(agent), project: placement })),
            pageInfo: { nextCursor: null, prevCursor: null, hasMore: false },
          },
        });
        return;
      }
      case 'fetch_agent_request': {
        /* What `agents.ref(id).refresh()` actually sends — the runner reads the
         * template's provider and model through it before creating its run. */
        const agent = agentById(message.agentId ?? '');
        send({
          type: 'fetch_agent_response',
          payload: {
            requestId,
            agentId: message.agentId ?? '',
            agent: agent ? snapshotFor(agent) : null,
            project: agent ? placement : null,
            error: null,
          },
        });
        return;
      }
      case 'refresh_agent_request': {
        const agent = agentById(message.agentId ?? '');
        send({
          type: 'status',
          payload: {
            status: 'agent_refreshed',
            requestId,
            agentId: message.agentId ?? '',
            ...(agent ? { agent: snapshotFor(agent) } : {}),
            timeline: [],
          },
        });
        return;
      }
      case 'create_agent_request': {
        createRequests.push({ config: message.config });
        const id = `run-agent-${created.size + 1}`;
        const template = agents[0]!;
        created.set(id, {
          id,
          title: message.title ?? template.title,
          provider: message.config?.provider?.split('/')[0] ?? template.provider,
          model: template.model,
          ...(message.labels ? { labels: message.labels } : {}),
        });
        timelines.set(id, []);
        send({
          type: 'status',
          payload: { status: 'agent_created', requestId, agentId: id, agent: snapshotFor(created.get(id)!) },
        });
        return;
      }
      case 'send_agent_message_request': {
        const agentId = message.agentId ?? '';
        send({
          type: 'send_agent_message_response',
          payload: { requestId, agentId, accepted: true, error: null },
        });
        runTurn(agentId, send);
        return;
      }
      case 'agent_permission_response': {
        const agentId = message.agentId ?? '';
        const items = timelines.get(agentId) ?? [];
        const provider = agentById(agentId)?.provider ?? 'anthropic';
        send({
          type: 'agent_permission_resolved',
          payload: {
            agentId,
            requestId,
            provider,
            resolution: { behavior: 'allow' },
            timestamp: nowIso(),
          },
        });
        for (const item of turn.items) {
          items.push(item);
          send({
            type: 'agent_stream',
            payload: {
              agentId,
              timestamp: nowIso(),
              event: { type: 'timeline', provider, item },
              epoch,
              seq: items.length,
            },
          });
        }
        timelines.set(agentId, items);
        send({
          type: 'agent_stream',
          payload: { agentId, timestamp: nowIso(), event: { type: 'turn_completed', provider } },
        });
        return;
      }
      case 'ping': {
        /* The SDK's liveness check. Without it the client tears the socket down
         * after 15s and every in-flight turn dies with it. */
        const at = Date.now();
        send({ type: 'pong', payload: { requestId, serverReceivedAt: at, serverSentAt: at } });
        return;
      }
      case 'fetch_agent_timeline_request': {
        send(timelineResponse(requestId, message.agentId ?? '', message.cursor));
        break;
      }
      /* Everything else — heartbeats, subscriptions, provider snapshots — is
       * acknowledged by silence, which the SDK treats as "unsupported by this
       * daemon" rather than an error. */
      default:
    }
  };

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('The fake Paseo daemon did not bind a port.');
  }

  return {
    endpoint: `127.0.0.1:${address.port}`,
    serverId,
    daemonPublicKeyB64,
    received: () => received,
    createRequests: () => createRequests,
    close: async () => {
      /* `wss.close` waits for every client to go away, and the page keeps its
       * session open for the life of the tab — so terminate first or teardown
       * hangs until the test times out. */
      for (const socket of wss.clients) {
        socket.terminate();
      }
      await new Promise<void>((resolve) => {
        wss.close(() => {
          resolve();
        });
      });
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    },
  };
};
