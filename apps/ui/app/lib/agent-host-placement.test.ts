// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  AgentHostPlacementError,
  discoverOriginAgentHost,
  listAgentHostPlacements,
  loopbackAdmissionRefusal,
  openAgentHostChannel,
  probeCloudPlacement,
  probeLoopbackAgentHost,
  shouldAutoOfferCloudPlacement,
} from '#lib/agent-host-placement.js';

const descriptor = { v: 1, agent: true, label: 'studio-mini', workspaceRoot: '/Users/x/tau-workspace/lamp' } as const;

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A socket that never opens, never errors — the Safari-blocked shape (SP-5a). */
const silentSocket = (): WebSocket => {
  const listeners = new Map<string, Set<(event: Event) => void>>();
  return {
    readyState: 0,
    binaryType: 'arraybuffer',
    send: () => undefined,
    close: () => undefined,
    addEventListener: (type: string, listener: (event: Event) => void) => {
      listeners.set(type, (listeners.get(type) ?? new Set()).add(listener));
    },
    removeEventListener: (type: string, listener: (event: Event) => void) => {
      listeners.get(type)?.delete(listener);
    },
  } as unknown as WebSocket;
};

describe('discoverOriginAgentHost', () => {
  it('reads the same-origin descriptor without sending anything of its own', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(descriptor));

    await expect(
      discoverOriginAgentHost({ fetch: fetchMock as unknown as typeof fetch, origin: 'http://127.0.0.1:7777' }),
    ).resolves.toEqual(descriptor);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:7777/.well-known/tau-host',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it.each([
    ['a 404 from a page nothing hosts', async () => jsonResponse({}, 404)],
    ['a body that is not a descriptor', async () => jsonResponse({ v: 2 })],
    [
      'a request the network refused',
      async () => {
        throw new Error('failed to fetch');
      },
    ],
  ])('reports no origin host for %s', async (_name, respond) => {
    await expect(
      discoverOriginAgentHost({ fetch: respond as unknown as typeof fetch, origin: 'http://127.0.0.1:7777' }),
    ).resolves.toBeUndefined();
  });
});

/**
 * PH8 and the transports doc are explicit that the cloud placement is for
 * detached runs, iOS-class limits and downlevel fallback — never for Safari,
 * which runs the browser-local host interactively like every other browser.
 */
describe('shouldAutoOfferCloudPlacement', () => {
  const safariDesktop = {
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.4 Safari/605.1.15',
    maxTouchPoints: 0,
  };
  const safariPhone = {
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
    maxTouchPoints: 5,
  };
  /* IPadOS Safari calls itself a Macintosh; touch points are the only tell. */
  const safariTablet = { userAgent: safariDesktop.userAgent, maxTouchPoints: 5 };

  it('never offers itself to Safari on a desktop', () => {
    expect(probeCloudPlacement(safariDesktop)).toMatchObject({ iosClass: false });
    expect(shouldAutoOfferCloudPlacement({ iosClass: false, downlevel: false })).toBe(false);
    expect(shouldAutoOfferCloudPlacement(probeCloudPlacement(safariDesktop))).toBe(false);
  });

  it('offers itself for iOS-class limits and for a downlevel browser', () => {
    expect(probeCloudPlacement(safariPhone).iosClass).toBe(true);
    expect(probeCloudPlacement(safariTablet).iosClass).toBe(true);
    expect(shouldAutoOfferCloudPlacement(probeCloudPlacement(safariPhone))).toBe(true);
    expect(shouldAutoOfferCloudPlacement({ iosClass: false, downlevel: true })).toBe(true);
  });
});

describe('listAgentHostPlacements', () => {
  it('lists rung 1 first and only paired devices that advertised the capability', async () => {
    await expect(
      listAgentHostPlacements({
        discoverOrigin: async () => descriptor,
        listHosts: async () => [
          {
            id: 'device-agent',
            label: 'workshop',
            createdAt: new Date(0),
            lastSeenAt: null,
            revokedAt: null,
            online: true,
            agent: { workspaceRoot: '/srv/tau' },
          },
          {
            id: 'device-offline',
            label: 'laptop',
            createdAt: new Date(0),
            lastSeenAt: null,
            revokedAt: null,
            online: false,
            agent: { workspaceRoot: '/home/tau' },
          },
          // Online, but running compute only — no agent workspace to place on.
          {
            id: 'device-compute',
            label: 'render-box',
            createdAt: new Date(0),
            lastSeenAt: null,
            revokedAt: null,
            online: true,
          },
        ],
      }),
    ).resolves.toEqual([
      { hostId: 'origin', rung: 1, label: 'studio-mini', workspaceRoot: descriptor.workspaceRoot, online: true },
      { hostId: 'device-agent', rung: 2, label: 'workshop', workspaceRoot: '/srv/tau', online: true },
      { hostId: 'device-offline', rung: 2, label: 'laptop', workspaceRoot: '/home/tau', online: false },
    ]);
  });

  it('marks a cloud host with the project it was provisioned for', async () => {
    await expect(
      listAgentHostPlacements({
        discoverOrigin: async () => undefined,
        listHosts: async () => [
          {
            id: 'agent_cloud',
            label: 'Tau Cloud',
            createdAt: new Date(0),
            lastSeenAt: null,
            revokedAt: null,
            online: true,
            agent: { workspaceRoot: '/workspace' },
            cloudProjectId: 'project-a',
          },
          {
            id: 'device-laptop',
            label: 'workshop',
            createdAt: new Date(0),
            lastSeenAt: null,
            revokedAt: null,
            online: true,
            agent: { workspaceRoot: '/srv/tau' },
            cloudProjectId: null,
          },
        ],
      }),
    ).resolves.toEqual([
      {
        hostId: 'agent_cloud',
        rung: 2,
        label: 'Tau Cloud',
        workspaceRoot: '/workspace',
        online: true,
        cloudProjectId: 'project-a',
      },
      { hostId: 'device-laptop', rung: 2, label: 'workshop', workspaceRoot: '/srv/tau', online: true },
    ]);
  });

  it('carries each host’s external agents through to the selector', async () => {
    await expect(
      listAgentHostPlacements({
        discoverOrigin: async () => ({ ...descriptor, externalAgents: ['claude', 'codex'] }),
        listHosts: async () => [
          {
            id: 'device-agent',
            label: 'workshop',
            createdAt: new Date(0),
            lastSeenAt: null,
            revokedAt: null,
            online: true,
            agent: { workspaceRoot: '/srv/tau', externalAgents: ['codex'] },
          },
        ],
      }),
    ).resolves.toEqual([
      {
        hostId: 'origin',
        rung: 1,
        label: 'studio-mini',
        workspaceRoot: descriptor.workspaceRoot,
        online: true,
        externalAgents: ['claude', 'codex'],
      },
      {
        hostId: 'device-agent',
        rung: 2,
        label: 'workshop',
        workspaceRoot: '/srv/tau',
        online: true,
        externalAgents: ['codex'],
      },
    ]);
  });

  it('lists launcher 2 first on the desktop build, with no workspace of its own', async () => {
    await expect(
      listAgentHostPlacements({ desktop: true, discoverOrigin: async () => undefined, listHosts: async () => [] }),
    ).resolves.toEqual([
      // The root belongs to the *project*, not to the host, so discovery names
      // none: `desktopWorkspaceRoot` resolves it at dial time.
      { hostId: 'desktop', rung: 'in-process', label: 'This computer', workspaceRoot: '', online: true },
    ]);
  });

  it('still lists the origin host when the pairing API is unreachable', async () => {
    await expect(
      listAgentHostPlacements({
        discoverOrigin: async () => descriptor,
        listHosts: async () => {
          throw new Error('offline');
        },
      }),
    ).resolves.toHaveLength(1);
  });
});

describe('openAgentHostChannel', () => {
  it('dials the same-origin /agent socket with no token in the URL', async () => {
    const urls: string[] = [];
    const client = await openAgentHostChannel('origin', {
      origin: 'https://studio.local:7777',
      createSocket: (url) => {
        urls.push(url);
        return { ...silentSocket(), readyState: 1 } as unknown as WebSocket;
      },
    });

    expect(urls).toEqual(['wss://studio.local:7777/agent']);
    client.close();
  });

  it.each([
    ['an offline device', { id: 'device-1', online: false, agent: { workspaceRoot: '/srv/tau' } }, 'HOST_OFFLINE'],
    ['a device with no agent workspace', { id: 'device-1', online: true }, 'HOST_NO_AGENT_ROUTE'],
  ])('refuses rung 2 for %s with a typed reason', async (_name, device, code) => {
    await expect(
      openAgentHostChannel('device-1', {
        listHosts: async () => [
          { label: 'workshop', createdAt: new Date(0), lastSeenAt: null, revokedAt: null, ...device },
        ],
        createSession: async () => {
          throw new Error('must not reach the API');
        },
      }),
    ).rejects.toMatchObject({ code, rung: 2 });
  });

  it('refuses rung 2 when the session carries no agent route', async () => {
    await expect(
      openAgentHostChannel('device-1', {
        listHosts: async () => [
          {
            id: 'device-1',
            label: 'workshop',
            createdAt: new Date(0),
            lastSeenAt: null,
            revokedAt: null,
            online: true,
            agent: { workspaceRoot: '/srv/tau' },
          },
        ],
        createSession: async () => ({
          id: 'session-1',
          runtimeVersion: '0.0.0',
          expiresAt: new Date().toISOString(),
          url: 'wss://api.tau.test/relay',
        }),
      }),
    ).rejects.toMatchObject({ code: 'HOST_NO_AGENT_ROUTE', rung: 2 });
  });

  it('gives up on a socket that never opens and never closes', async () => {
    await expect(
      openAgentHostChannel('origin', {
        origin: 'https://studio.local:7777',
        createSocket: () => silentSocket(),
        openTimeout: 20,
      }),
    ).rejects.toMatchObject({ code: 'ORIGIN_NOT_HOSTED', rung: 1 });
  });
});

/** Main refuses an ungranted root by never posting a port at all. */
const neverSettles = new Promise<MessagePort>(() => {
  /* Deliberately never settled. */
});

describe('launcher 2', () => {
  it('claims the brokered port and wraps it before any command', async () => {
    const channel = new MessageChannel();
    const connect = vi.fn(async () => channel.port1);

    const client = await openAgentHostChannel('desktop', {
      workspaceRoot: '/Users/x/Library/Application Support/Tau/home/lamp',
      bridge: () => ({ agentHost: { connect } }),
    });

    expect(connect).toHaveBeenCalledWith('/Users/x/Library/Application Support/Tau/home/lamp');
    expect(typeof client.execute).toBe('function');
    client.close();
    channel.port2.close();
  });

  it('refuses an ungranted root after a bounded wait rather than hanging', async () => {
    await expect(
      openAgentHostChannel('desktop', {
        workspaceRoot: '/somewhere/never/granted',
        openTimeout: 20,
        // Main refuses by never posting a port; the promise simply never settles.
        bridge: () => ({ agentHost: { connect: async () => neverSettles } }),
      }),
    ).rejects.toMatchObject({ code: 'DESKTOP_ROOT_NOT_GRANTED', rung: 'in-process' });
  });

  it('refuses a project that is not on disk', async () => {
    await expect(
      openAgentHostChannel('desktop', {
        bridge: () => ({ agentHost: { connect: async () => new MessageChannel().port1 } }),
      }),
    ).rejects.toBeInstanceOf(AgentHostPlacementError);
  });
});

describe('rung 5', () => {
  it('reports the permission state alongside an unreachable loopback probe', async () => {
    await expect(
      probeLoopbackAgentHost(7777, {
        createSocket: () => silentSocket(),
        queryPermission: async () => 'denied',
        probeTimeout: 20,
      }),
    ).resolves.toEqual({ reachable: false, permission: 'denied' });
  });

  it('refuses with the two rungs that do work and never a token hand-off', () => {
    const refusal = loopbackAdmissionRefusal('studio-mini');

    expect(refusal).toBeInstanceOf(AgentHostPlacementError);
    expect(refusal).toMatchObject({ code: 'RUNG5_NO_ADMISSION', rung: 5 });
    expect(refusal.message).toMatch(/tau serve --ui/u);
    expect(refusal.message).toMatch(/pair it/u);
    expect(refusal.message).not.toMatch(/token/iu);
  });
});
