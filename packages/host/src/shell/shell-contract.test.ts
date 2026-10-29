/* oxlint-disable tau-lint/no-time-unit-suffix -- `timeoutMs` and `durationMs` are the shell tool's wire fields (API guide). */
/**
 * The host's `shell` contract and the chat schema the model sees are one contract (API guide rev 8). `@taucad/host`
 * cannot import the private `@taucad/chat`, so this test pins the two: equal bounds and codes, every host output parses
 * as the chat schema, and the host shell is a registry `ShellClient` by type.
 */
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  isShellError as chatIsShellError,
  shellInputSchema,
  shellLimits as chatShellLimits,
  shellNotStartedCodes as chatShellNotStartedCodes,
  shellOutputSchema,
} from '@taucad/chat';
import type { ShellInput as ChatShellInput } from '@taucad/chat';
import type { ShellClient } from '@taucad/agent-tools/registry';

import { isShellError, shellLimits, shellNotStartedCodes } from '#shell/shell-contract.js';
import type { ShellInput, ShellOutput } from '#shell/shell-contract.js';
import type { HostShell } from '#shell/shell-service.js';
import { hostMcpAllowedTools } from '#mcp-server.js';

const stream = { text: 'ok\n', bytes: 3, truncated: false, undecodable: false } as const;

const outputs: readonly ShellOutput[] = [
  { status: 'completed', exitCode: 0, stdout: stream, stderr: stream, durationMs: 4 },
  {
    status: 'completed',
    exitCode: 2,
    stdout: { ...stream, truncated: true },
    stderr: stream,
    durationMs: 4,
    log: { status: 'saved', path: '.tau/offloaded-tool-results/shell/call-1.log', bytes: 300_003, discardedBytes: 0 },
    approval: { approvedBy: 'person', mode: 'ask' },
  },
  { status: 'signalled', signal: 'SIGSEGV', stdout: stream, stderr: stream, durationMs: 1 },
  { status: 'timed-out', timeoutMs: 1000, stdout: stream, stderr: stream, durationMs: 1000 },
  {
    status: 'cancelled',
    stdout: stream,
    stderr: stream,
    durationMs: 0,
    log: { status: 'unavailable', message: 'x', discardedBytes: 0 },
  },
  { status: 'interrupted', message: 'The host stopped while the command ran.' },
  { status: 'not-started', code: 'access-denied', message: 'Denied.' },
];

describe('the shell contract mirror', () => {
  it('shares bounds and not-started codes with the chat schema', () => {
    expect(chatShellLimits).toStrictEqual(shellLimits);
    expect(chatShellNotStartedCodes).toStrictEqual(shellNotStartedCodes);
  });

  it.each(outputs.map((output) => [output.status, output] as const))(
    'parses a host %s output as the chat schema and agrees on isError',
    (_status, output) => {
      expect(shellOutputSchema.parse(output)).toStrictEqual(output);
      expect(chatIsShellError(shellOutputSchema.parse(output))).toBe(isShellError(output));
    },
  );

  it('hands every chat input to the host unchanged, and the host shell is a registry client', () => {
    const input = shellInputSchema.parse({
      command: 'ls',
      cwd: 'models',
      timeoutMs: 5000,
      access: { reason: 'Read the supplier part.', read: ['/srv/supplier'], domains: ['Registry.NPMjs.org'] },
    });

    expect(input.access?.domains).toStrictEqual(['registry.npmjs.org']);
    expectTypeOf<ChatShellInput>().toExtend<ShellInput>();
    expectTypeOf<HostShell>().toExtend<ShellClient>();
  });

  it('never lets an external agent reach shell through the MCP endpoint (E21)', () => {
    expect(hostMcpAllowedTools).not.toContain('shell');
  });
});
