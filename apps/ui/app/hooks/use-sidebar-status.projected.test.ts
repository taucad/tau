import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ProjectionLogic from '#machines/chat-projection.logic.js';
import type { ChatProjection } from '#machines/chat-projection.logic.js';
import { selectChatFacts, selectProjectedChatStatus } from '#hooks/use-sidebar-status.js';

/* An unopened listed chat reads its host log. Its run's phase and open calls come from the projection's own selectors,
 * which this pin sets directly, so the row's derivation is the only thing under test. */
type Projected = {
  lifecycle: string;
  tools: { count: number; toolName?: string };
  interrupts: Record<string, unknown>;
};

const projected = vi.hoisted((): Projected => ({ lifecycle: 'running', tools: { count: 0 }, interrupts: {} }));

vi.mock('#machines/chat-projection.logic.js', async (importOriginal) => ({
  ...(await importOriginal<typeof ProjectionLogic>()),
  selectCaughtUp: () => true,
  selectCurrentRun: () => ({ runId: 'run-1', lifecycle: projected.lifecycle }),
  selectToolsInFlight: () => projected.tools,
  selectOpenInterrupts: () => projected.interrupts,
  selectRunFailure: () => undefined,
}));

// The selectors above never read it.
const projection = Object.freeze({}) as unknown as ChatProjection;

describe('selectProjectedChatStatus — a listed chat whose agent is asking (WB-08, I5)', () => {
  beforeEach(() => {
    projected.lifecycle = 'running';
    projected.tools = { count: 0 };
    projected.interrupts = {};
  });

  it('reads an ask_questions call in flight as a question that needs the person', () => {
    projected.tools = { count: 1, toolName: 'ask_questions' };
    const status = selectProjectedChatStatus(projection, false);
    expect(status.state).toBe('question');
    expect(selectChatFacts(status)).toEqual({ mark: 'attention', sentence: 'Waiting for you' });
  });

  it('keeps any other call in flight a running tool', () => {
    projected.tools = { count: 1, toolName: 'geospec_check' };
    const status = selectProjectedChatStatus(projection, false);
    expect(status.state).toBe('tool');
    expect(selectChatFacts(status)).toEqual({ mark: 'running', sentence: 'Running geospec_check' });
  });
});
