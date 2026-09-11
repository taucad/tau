/**
 * The plain-output line one durable event prints.
 *
 * A tool row used to print its whole record as JSON, which made an external
 * agent's turn unreadable in `tau agent tail` and in the TUI, which renders the
 * same line. It now prints one titled line per call, with the status on a
 * leading glyph — so `NO_COLOR` and a piped stdout lose no meaning at all.
 */

import { describe, expect, it } from 'vitest';

import type { AgentLogEvent } from '@taucad/agent-host';

import { eventLine } from '#commands/agent/client.js';

const base = {
  version: 1,
  leaderEpoch: 'leader-1',
  sequence: 7,
  recordedAt: '2026-09-08T00:00:00.000Z',
  runId: 'run-1',
} as const;

const lineFor = (message: unknown): string =>
  eventLine({ ...base, type: 'message.appended', message } as AgentLogEvent);

describe('eventLine', () => {
  it("prints one titled line per external call, not the agent's raw record", () => {
    const line = lineFor({
      id: 'm1',
      role: 'tool-input',
      toolCallId: 'call-1',
      toolName: 'listFiles',
      call: { toolCallId: 'list-1', kind: 'read', title: 'List files', status: 'in_progress' },
      content: { path: '.' },
    });

    expect(line).toBe('7\tmessage.appended\t● List files');
  });

  it('marks a completed call, and a failed one, on the glyph alone', () => {
    const completed = lineFor({
      id: 'm2',
      role: 'tool-output',
      toolCallId: 'call-1',
      toolName: 'listFiles',
      call: { toolCallId: 'list-1', title: 'List files' },
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Codex's own `rawOutput` field name.
      content: { formatted_output: 'tau.json' },
      isError: false,
    });
    const failed = lineFor({
      id: 'm3',
      role: 'tool-output',
      toolCallId: 'call-2',
      toolName: 'shell',
      call: { toolCallId: 'shell-1', title: 'openscad main.scad' },
      content: 'exit 1',
      isError: true,
    });

    expect(completed).toBe('7\tmessage.appended\t✓ List files');
    expect(failed).toBe('7\tmessage.appended\t✗ openscad main.scad');
    // Piped output carries no escape sequences at all, whatever NO_COLOR says.
    // oxlint-disable-next-line no-control-regex -- the absence of this exact byte is the assertion.
    expect(completed).not.toMatch(/\u001B/u);
  });

  it("falls back to Tau's own tool name when no emitter wrote a title", () => {
    expect(
      lineFor({ id: 'm4', role: 'tool-input', toolCallId: 'call-3', toolName: 'read_file', content: { path: 'a' } }),
    ).toBe('7\tmessage.appended\t○ read_file');
  });

  it('folds an agent-authored title onto one inert line', () => {
    const line = lineFor({
      id: 'm5',
      role: 'tool-input',
      toolCallId: 'call-4',
      toolName: 'shell',
      call: { toolCallId: 'shell-2', title: 'rm -rf \u001B[2J/tmp\nx', status: 'pending' },
      content: {},
    });

    expect(line).toBe('7\tmessage.appended\t○ rm -rf /tmp x');
  });

  it('prints the replacement a compaction or an external turn wrote, not a blank row', () => {
    /* `message.envelope-replaced` carries the whole message, so the tail has
     * everything it needs; it used to fall through to an empty summary and
     * print a bare `7\tmessage.envelope-replaced\t`. */
    const line = eventLine({
      ...base,
      type: 'message.envelope-replaced',
      messageId: 'm6',
      replacement: {
        id: 'm6',
        role: 'assistant',
        content: 'Filleted the top edge.',
        metadata: { tauInternal: { kind: 'external-agent', agentId: 'codex', model: 'gpt-5.3-codex' } },
      },
    } as AgentLogEvent);

    expect(line).toBe('7\tmessage.envelope-replaced\tassistant Filleted the top edge. [codex gpt-5.3-codex]');
  });
});
