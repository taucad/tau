import { AgentHostPlacementError } from '#lib/agent-host-placement.js';

/**
 * Desktop runs the agent in its services utility and must never construct the
 * browser worker. The refusal is typed rather than a bare string so a selection
 * that reaches here lands on the same banner as every other placement failure.
 */
export const createBrowserAgentWorker = (): Worker => {
  throw new AgentHostPlacementError(
    'BROWSER_HOST_UNAVAILABLE',
    'in-process',
    'The browser agent host is unavailable in the desktop app. Place the turn on this computer instead.',
  );
};
