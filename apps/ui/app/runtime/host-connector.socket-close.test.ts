/**
 * HA3 end to end: a paired daemon's socket close reaches the read loop's R6 mapping through the real dial
 * (`openAgentHostChannel`), the real daemon client and the connector, into the host attachment. Only the API calls
 * and the WebSocket are faked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { CadAgentExecution } from '@taucad/chat';
import type { fileManagerMachine } from '#machines/file-manager.machine.js';
import { chatProjectionLogic } from '#machines/chat-projection.logic.js';
import type { ProjectChoices } from '#runtime/choices.js';
import { hostConnectorCallback } from '#runtime/host-connector.js';
import type { HostConnectorChatStore } from '#runtime/host-connector.js';
import { hostAttachment } from '#chat-clients/_internal/host-attachment.js';
import type { HostAttachmentStatus } from '#chat-clients/_internal/host-attachment.js';
import { RemoteHostApiError } from '#lib/remote-host-client.js';

const api = vi.hoisted(() => ({ sessionRefusal: undefined as Error | undefined }));

vi.mock('#lib/remote-host-client.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listRemoteHosts: async () => [{ id: 'hst_daemon', label: 'Daemon', online: true, agent: true }],
  createRemoteHostSession: async () => {
    if (api.sessionRefusal !== undefined) {
      throw api.sessionRefusal;
    }
    return { id: 'as_1', agentUrl: 'wss://relay.test/agent' };
  },
}));

/** A relayed socket that opens at once and that the test closes as the API would. */
class RelaySocket extends EventTarget {
  public static readonly opened: RelaySocket[] = [];
  public readyState = 0;
  public binaryType = 'blob';
  public constructor() {
    super();
    RelaySocket.opened.push(this);
    queueMicrotask(() => {
      this.readyState = 1;
      this.dispatchEvent(new Event('open'));
    });
  }

  public send(): void {
    /* The daemon never answers: the test is about how its socket closes. */
  }

  public close(code = 1000, reason = ''): void {
    this.serverClose(code, reason);
  }

  public serverClose(code: number, reason: string): void {
    if (this.readyState === 3) {
      return;
    }
    this.readyState = 3;
    this.dispatchEvent(Object.assign(new Event('close'), { code, reason }));
  }
}

const projectId = 'prj_socket_close';
const chatId = 'chat-daemon';
const daemonExecution: CadAgentExecution = { kind: 'tau', model: 'm', hostId: 'hst_daemon' };

const fileManagerRef = {
  getSnapshot: () => ({
    context: { worker: { name: 'worker' }, rootDirectory: `/projects/${projectId}` },
    matches: (state: string) => state === 'ready',
  }),
  subscribe: () => ({ unsubscribe: () => undefined }),
} as unknown as ActorRefFrom<typeof fileManagerMachine>;

/** Publish the real connector and follow the daemon-placed chat with a host attachment, as the store does. */
const attachThroughConnector = () => {
  let connect: Parameters<HostConnectorChatStore['publishProjectHostConnector']>[1] | undefined;
  const store: HostConnectorChatStore = {
    publishProjectHostConnector: (_projectId, next) => {
      connect = next;
      return () => undefined;
    },
    getChatHostSettings: async () => ({ activeExecution: daemonExecution }),
  };
  const stopConnector = hostConnectorCallback({
    chatSessions: store,
    choices: () => ({ defaultExecution: daemonExecution }) as unknown as ProjectChoices,
    reportFault: (error) => {
      throw error;
    },
  })({ input: { projectId, fileManagerRef, syncProjectRoots: async () => undefined } });
  const projection = createActor(chatProjectionLogic).start();
  const statuses: HostAttachmentStatus[] = [];
  const attachment = createActor(hostAttachment, {
    input: {
      chatId,
      connect: async () => {
        if (connect === undefined) {
          throw new Error('The connector was not published.');
        }
        return connect(chatId);
      },
      projection,
      onStatus: (event) => statuses.push(event),
    },
  }).start();
  return {
    statuses,
    stop: () => {
      attachment.stop();
      projection.stop();
      stopConnector();
    },
  };
};

describe('a daemon socket close through dial, client, connector and attachment (HA3)', () => {
  beforeEach(() => {
    RelaySocket.opened.length = 0;
    api.sessionRefusal = undefined;
    vi.stubGlobal('WebSocket', RelaySocket);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    [4003, 'device revoked', 'revoked'],
    [1008, 'session unavailable', 'grant-refused'],
  ] as const)('should report a %i %s close as R6', async (code, reason, refusal) => {
    const chat = attachThroughConnector();
    try {
      await vi.waitFor(() => {
        expect(RelaySocket.opened).toHaveLength(1);
      });
      await vi.waitFor(() => {
        expect(RelaySocket.opened[0]?.readyState).toBe(1);
      });
      RelaySocket.opened[0]?.serverClose(code, reason);
      await vi.waitFor(() => {
        expect(chat.statuses).toContainEqual({ type: 'attachment.lost', reason: refusal, residual: 'R6' });
      });
    } finally {
      chat.stop();
    }
  });

  it('should keep the peerless reap transient', async () => {
    const chat = attachThroughConnector();
    try {
      await vi.waitFor(() => {
        expect(RelaySocket.opened[0]?.readyState).toBe(1);
      });
      RelaySocket.opened[0]?.serverClose(1008, 'route peer did not connect');
      await vi.waitFor(() => {
        expect(chat.statuses.some((event) => event.type === 'attachment.lost')).toBe(true);
      });
      expect(chat.statuses.some((event) => event.residual !== undefined)).toBe(false);
    } finally {
      chat.stop();
    }
  });

  it('should report a dial the API refuses with AGENT_NOT_FOUND as R6', async () => {
    api.sessionRefusal = new RemoteHostApiError('AGENT_NOT_FOUND', 'That computer is no longer paired.');
    const chat = attachThroughConnector();
    try {
      await vi.waitFor(() => {
        expect(chat.statuses).toContainEqual(expect.objectContaining({ type: 'attachment.lost', residual: 'R6' }));
      });
      expect(RelaySocket.opened).toHaveLength(0);
    } finally {
      chat.stop();
    }
  });
});
