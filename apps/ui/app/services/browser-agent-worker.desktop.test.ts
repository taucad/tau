import { describe, expect, it } from 'vitest';
import { AgentHostPlacementError } from '#lib/agent-host-placement.js';
import { createBrowserAgentWorker } from '#services/browser-agent-worker.desktop.js';

describe('createBrowserAgentWorker (desktop)', () => {
  it('refuses with a typed placement error rather than a bare string', () => {
    expect(() => createBrowserAgentWorker()).toThrow(AgentHostPlacementError);
    expect(() => createBrowserAgentWorker()).toThrow(
      expect.objectContaining({ code: 'BROWSER_HOST_UNAVAILABLE', rung: 'in-process' }),
    );
  });
});
