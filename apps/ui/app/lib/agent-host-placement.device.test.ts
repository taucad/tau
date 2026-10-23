// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CadAgentExecution } from '@taucad/chat';
import { portableExecutionOf } from '#utils/chat-execution.js';

/**
 * The chat owns intent; the device owns placement (cross-device chat handoff, XD2).
 *
 * A chat record synced from another device is read here exactly as that device
 * wrote it, then placed by *this* build: the web, or Tau Desktop.
 */
const build = vi.hoisted(() => ({ desktop: false }));

vi.mock('#filesystem/desktop-bridge.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  get isDesktopTarget() {
    return build.desktop;
  },
}));

const {
  daemonPlacementOf,
  isPlacementOnThisDevice,
  resetLoopbackAgentHosts,
  resetOriginAgentHostAnswer,
  unplaceableExecutionReason,
} = await import('#lib/agent-host-placement.js');

const model = 'anthropic-claude-opus-4.8';
/** Every device-relative Tau placement a chat record can carry from the device that wrote it, and none. */
const deviceRelative: ReadonlyArray<readonly [label: string, execution: CadAgentExecution]> = [
  ['absent', { kind: 'tau', model }],
  ["'desktop'", { kind: 'tau', model, hostId: 'desktop' }],
  ["'origin'", { kind: 'tau', model, hostId: 'origin' }],
  ['a loopback id', { kind: 'tau', model, hostId: 'loopback:http://127.0.0.1:4100' }],
];
const paired: CadAgentExecution = { kind: 'tau', model, hostId: 'dev_studio_mini' };

/** A stored execution, as the chat record store hands it to a reader on this device. */
const placeStored = (execution: CadAgentExecution) => daemonPlacementOf(portableExecutionOf(execution));

afterEach(() => {
  build.desktop = false;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('device-local placement of a stored Tau chat', () => {
  describe('on the web', () => {
    it.each(deviceRelative)('should place a stored %s host on this page’s own worker', (_label, execution) => {
      expect(placeStored(execution)).toBeUndefined();
    });

    it('should place an unnormalized desktop execution on this page’s own worker, never the missing launcher', () => {
      // TAU-UI-5: the stored execution reached the read connector as written on the desktop.
      expect(daemonPlacementOf({ kind: 'tau', model, hostId: 'desktop' })).toBeUndefined();
    });
  });

  describe('on Tau Desktop', () => {
    it.each(deviceRelative)('should place a stored %s host on this computer', (_label, execution) => {
      build.desktop = true;

      expect(placeStored(execution)).toBe('desktop');
    });
  });

  it.each([false, true])('should keep a paired device id on every build (desktop: %s)', (desktop) => {
    build.desktop = desktop;

    expect(portableExecutionOf(paired)).toEqual(paired);
    expect(placeStored(paired)).toBe('dev_studio_mini');
  });
});

describe('unplaceableExecutionReason', () => {
  const desktopCodex: CadAgentExecution = { kind: 'acp', hostId: 'desktop', agentId: 'codex' };

  it('should refuse an external agent pinned to Tau Desktop when this build is the web', () => {
    expect(unplaceableExecutionReason(desktopCodex)).toBe(
      'codex runs in Tau Desktop. Open this chat there, or choose Tau to continue here.',
    );
  });

  it('should place the same external agent on Tau Desktop', () => {
    build.desktop = true;

    expect(unplaceableExecutionReason(desktopCodex)).toBeUndefined();
  });

  it.each(deviceRelative)('should never refuse a Tau execution with a stored %s host', (_label, execution) => {
    expect(unplaceableExecutionReason(execution)).toBeUndefined();
  });

  describe('an external agent pinned to the daemon that served its page', () => {
    const originCodex: CadAgentExecution = { kind: 'acp', hostId: 'origin', agentId: 'codex' };

    it('should refuse at once on the web build, whose origin is never a daemon', () => {
      vi.stubEnv('TAU_ORIGIN_AGENT_HOST', 'absent');

      expect(unplaceableExecutionReason(originCodex)).toMatch(/choose Tau to continue here\.$/u);
    });

    it('should refuse at once on Tau Desktop, whose window no daemon serves', () => {
      build.desktop = true;

      expect(unplaceableExecutionReason(originCodex)).toMatch(/choose Tau to continue here\.$/u);
    });

    it('should leave a page a daemon may have served to discovery', () => {
      expect(unplaceableExecutionReason(originCodex)).toBeUndefined();
    });

    /* XD2: a failed discovery is no answer about the origin: it is asked again, and a daemon found later counts. */
    it('should ask the origin again after a failed discovery, and keep a daemon it finds', async () => {
      vi.useFakeTimers({ now: Date.parse('2026-10-23T10:00:00.000Z'), toFake: ['Date'] });
      resetOriginAgentHostAnswer();
      vi.stubGlobal('location', { origin: 'http://127.0.0.1:7777' });
      const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValueOnce(new TypeError('network down'));
      fetch.mockResolvedValue(
        new Response(JSON.stringify({ v: 1, agent: true, label: 'Studio', workspaceRoot: '/work' }), {
          headers: { 'content-type': 'application/json' },
        }),
      );
      vi.stubGlobal('fetch', fetch);
      try {
        await expect(isPlacementOnThisDevice('origin')).resolves.toBe(false);
        vi.setSystemTime(Date.parse('2026-10-23T10:01:00.000Z'));

        await expect(isPlacementOnThisDevice('origin')).resolves.toBe(true);
        await expect(isPlacementOnThisDevice('origin')).resolves.toBe(true);
        expect(fetch).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
        resetOriginAgentHostAnswer();
      }
    });

    /* XD2: a legacy chat record's `origin` placement is no host on a page no daemon serves. */
    it('should not count an origin placement as this device’s on the web build', async () => {
      vi.stubEnv('TAU_ORIGIN_AGENT_HOST', 'absent');

      await expect(isPlacementOnThisDevice('origin')).resolves.toBe(false);
    });
  });

  describe('an external agent pinned to a loopback daemon', () => {
    const origin = 'http://127.0.0.1:4100';
    const loopbackCodex: CadAgentExecution = { kind: 'acp', hostId: `loopback:${origin}`, agentId: 'codex' };
    const storage = new Map<string, string>();

    beforeEach(() => {
      storage.clear();
      vi.stubGlobal('sessionStorage', {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      });
      resetLoopbackAgentHosts();
    });

    it('should refuse at once while this tab has not been handed that daemon', () => {
      expect(unplaceableExecutionReason(loopbackCodex)).toMatch(/tau open --desktop.*choose Tau to continue here\.$/u);
    });

    it('should place it once this tab holds a session for that daemon', () => {
      storage.set('tau:loopback-agent-hosts', JSON.stringify([{ origin, session: 'session_1' }]));

      expect(unplaceableExecutionReason(loopbackCodex)).toBeUndefined();
    });

    /* XD2: a legacy chat record's loopback placement is kept on this device only where this tab can reach it. */
    it('should count a loopback placement as this device’s only while this tab holds its session', async () => {
      storage.set('tau:loopback-agent-hosts', JSON.stringify([{ origin, session: 'session_1' }]));

      await expect(isPlacementOnThisDevice(`loopback:${origin}`)).resolves.toBe(true);
      await expect(isPlacementOnThisDevice('loopback:http://127.0.0.1:4200')).resolves.toBe(false);
    });
  });
});
