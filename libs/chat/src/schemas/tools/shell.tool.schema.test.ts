/* oxlint-disable tau-lint/no-time-unit-suffix -- `timeoutMs` and `durationMs` are the shell tool's wire fields (API guide). */
import { describe, expect, it } from 'vitest';

import {
  isShellError,
  shellApprovalPayloadSchema,
  shellHostDescription,
  shellInputSchema,
  shellOutputSchema,
} from '#schemas/tools/shell.tool.schema.js';

describe('shellInputSchema (API guide rev 8)', () => {
  it.each([
    [{ command: "grep -rn 'wallThickness' src | head -20" }],
    [{ command: 'mv a b', cwd: 'models/bracket', timeoutMs: 30_000 }],
    [{ command: 'ls', cwd: '' }],
    [{ command: 'npm view x version', access: { reason: 'Check it.', domains: ['registry.npmjs.org'] } }],
    [{ command: 'dir', access: { reason: 'Read the supplier part.', read: [String.raw`C:\Users\me\supplier`] } }],
  ])('accepts %j', (input) => {
    expect(shellInputSchema.safeParse(input).success).toBe(true);
  });

  it.each([
    ['an unknown key', { command: 'ls', argv: ['ls'] }],
    ['a self-selected mode', { command: 'ls', permissions: 'bypass' }],
    ['an empty command', { command: '' }],
    ['a NUL', { command: 'a\u0000b' }],
    ['a command over the limit', { command: 'x'.repeat(16_385) }],
    ['traversal', { command: 'ls', cwd: '../x' }],
    ['an absolute cwd', { command: 'ls', cwd: '/etc' }],
    ['a backslash cwd', { command: 'ls', cwd: String.raw`a\b` }],
    ['a dot segment', { command: 'ls', cwd: 'a/./b' }],
    ['a timeout over the limit', { command: 'ls', timeoutMs: 600_001 }],
    ['a timeout under the limit', { command: 'ls', timeoutMs: 999 }],
    ['access without a reason', { command: 'x', access: { domains: ['example.com'] } }],
    ['access naming nothing', { command: 'x', access: { reason: 'r' } }],
    ['an empty list', { command: 'x', access: { reason: 'r', read: [] } }],
    [
      'nine folders',
      { command: 'x', access: { reason: 'r', read: Array.from({ length: 9 }, (_, i) => `/f${String(i)}`) } },
    ],
    ['a relative folder', { command: 'x', access: { reason: 'r', write: ['out'] } }],
    ['a single-label host', { command: 'x', access: { reason: 'r', domains: ['localhost'] } }],
    ['a wildcard', { command: 'x', access: { reason: 'r', domains: ['*.example.com'] } }],
    ['an IP literal', { command: 'x', access: { reason: 'r', domains: ['127.0.0.1'] } }],
    ['a hyphen-edged label', { command: 'x', access: { reason: 'r', domains: ['-bad.example.com'] } }],
    ['an unknown access key', { command: 'x', access: { reason: 'r', domains: ['example.com'], approved: true } }],
  ])('refuses %s', (_name, input) => {
    expect(shellInputSchema.safeParse(input).success).toBe(false);
  });

  it('lowercases a host name', () => {
    expect(
      shellInputSchema.parse({ command: 'x', access: { reason: 'r', domains: ['Registry.NPMjs.org'] } }).access
        ?.domains,
    ).toEqual(['registry.npmjs.org']);
  });
});

describe('shellOutputSchema', () => {
  const stream = { text: '', bytes: 0, truncated: false, undecodable: false };

  it('refuses a null exit on a completed result and an unknown not-started code', () => {
    expect(
      shellOutputSchema.safeParse({
        status: 'completed',
        exitCode: null,
        stdout: stream,
        stderr: stream,
        durationMs: 1,
      }).success,
    ).toBe(false);
    expect(shellOutputSchema.safeParse({ status: 'not-started', code: 'made-up', message: 'x' }).success).toBe(false);
  });

  it('treats only a completed exit 0 as success', () => {
    expect(isShellError({ status: 'completed', exitCode: 0, stdout: stream, stderr: stream, durationMs: 1 })).toBe(
      false,
    );
    expect(isShellError({ status: 'completed', exitCode: 1, stdout: stream, stderr: stream, durationMs: 1 })).toBe(
      true,
    );
    expect(isShellError({ status: 'cancelled', stdout: stream, stderr: stream, durationMs: 1 })).toBe(true);
    expect(isShellError({ status: 'interrupted', message: 'x' })).toBe(true);
  });
});

describe('shellApprovalPayloadSchema', () => {
  it('reads the structured request the card renders and refuses a payload of another kind', () => {
    const payload = {
      kind: 'shell',
      shell: 'bash',
      toolCallId: 'call-1',
      command: 'curl -fsS https://registry.npmjs.org/x',
      commandDigest: 'sha256:00',
      cwd: '',
      checkout: { runId: 'run-1', admission: 'a', fingerprint: 'f' },
      access: { reason: 'Check it.', read: [], write: [], domains: ['registry.npmjs.org'] },
      lifetime: 'invocation',
    };

    expect(shellApprovalPayloadSchema.parse(payload)).toEqual(payload);
    expect(shellApprovalPayloadSchema.safeParse({ ...payload, kind: 'machine-action' }).success).toBe(false);
    expect(shellApprovalPayloadSchema.safeParse({ ...payload, lifetime: 'always' }).success).toBe(false);
  });
});

describe('shellHostDescription', () => {
  it('names the language and major version on each platform', () => {
    expect(shellHostDescription({ platform: 'darwin', kind: 'bash', shellVersion: '3.2.57(1)-release' })).toContain(
      'On this macOS host the shell is Bash 3.2',
    );
    expect(shellHostDescription({ platform: 'linux', kind: 'bash', shellVersion: '5.2.21(1)-release' })).toContain(
      'Write Bash syntax.',
    );
    expect(shellHostDescription({ platform: 'win32', kind: 'powershell', shellVersion: '5.1.26100.1' })).toContain(
      'PowerShell 5.1',
    );
  });
});
