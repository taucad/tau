import { describe, expect, it } from 'vitest';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { clearedToolResultText, isClearedToolResult } from '#harness/compaction.js';

/* Regression review R4 and PH17 tier one: clearing a retained result keeps it retrievable by naming its file. */

const toolResult = (text: string): Extract<AgentMessage, { role: 'toolResult' }> => ({
  role: 'toolResult',
  toolCallId: 'call-1',
  toolName: 'grep',
  content: [{ type: 'text', text }],
  isError: false,
  timestamp: 0,
});

const retained = '.tau/artifacts/call-1__tool-result-txt/result.txt';

describe('clearedToolResultText', () => {
  it('should name the retained file of an offloaded result', () => {
    const message = toolResult(JSON.stringify({ matches: [], offloadedTo: { path: retained, characters: 90_000 } }));

    expect(clearedToolResultText(message)).toBe(
      `[Old tool result content cleared; the full result is retained at ${retained}. Read it with read_file if you need it again.]`,
    );
  });

  it('should find the file named in a text preview', () => {
    const message = toolResult(`head\n\n[100 more characters not shown. The full result is in ${retained}; page it.]`);

    expect(clearedToolResultText(message)).toContain(retained);
  });

  it('should keep the plain marker for a result that was never retained', () => {
    expect(clearedToolResultText(toolResult('small'))).toBe('[Old tool result content cleared]');
  });

  it('should recognize both markers as already cleared', () => {
    expect(isClearedToolResult(toolResult('[Old tool result content cleared]'))).toBe(true);
    expect(isClearedToolResult(toolResult(clearedToolResultText(toolResult(`x ${retained} y`))))).toBe(true);
    expect(isClearedToolResult(toolResult('[Old tool result content cleared] but more'))).toBe(false);
    expect(isClearedToolResult(toolResult('fresh'))).toBe(false);
  });
});
