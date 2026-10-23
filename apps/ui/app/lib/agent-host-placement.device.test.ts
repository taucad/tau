// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
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

const { daemonPlacementOf, unplaceableExecutionReason } = await import('#lib/agent-host-placement.js');

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
    expect(unplaceableExecutionReason(desktopCodex)).toMatch(/Tau desktop app/);
  });

  it('should place the same external agent on Tau Desktop', () => {
    build.desktop = true;

    expect(unplaceableExecutionReason(desktopCodex)).toBeUndefined();
  });

  it.each(deviceRelative)('should never refuse a Tau execution with a stored %s host', (_label, execution) => {
    expect(unplaceableExecutionReason(execution)).toBeUndefined();
  });
});
