import { describe, expect, it } from 'vitest';
import {
  classifyCliOutcome,
  expectedCliGaps,
  isNotPreparedRefusal,
  mcpInitializeRequest,
} from '#check-pack-install-cli.js';

describe('classifyCliOutcome', () => {
  const exitZero = ({ status }: { status: number | undefined }): boolean => status === 0;

  it('should pass a check whose condition holds', () => {
    expect(classifyCliOutcome('check', { status: 0, output: '' }, exitZero)).toEqual({ verdict: 'pass' });
  });

  it('should report the recorded output of an undelivered check as its gap', () => {
    const output = `${expectedCliGaps['check']!.output}\nRun \`tau --help\` for usage.`;

    expect(classifyCliOutcome('check', { status: 2, output }, exitZero)).toEqual({ verdict: 'gap' });
  });

  it('should fail any other output, including another check’s gap', () => {
    expect(classifyCliOutcome('check', { status: 1, output: 'Assertion failed' }, exitZero)).toMatchObject({
      verdict: 'fail',
    });
    expect(
      classifyCliOutcome('check', { status: 3, output: expectedCliGaps['not-prepared']!.output }, exitZero),
    ).toMatchObject({ verdict: 'fail' });
  });
});

describe('isNotPreparedRefusal', () => {
  it('should accept exit 3 naming the prepare command', () => {
    expect(isNotPreparedRefusal({ status: 3, output: 'build123d is not prepared. Run `tau prepare build123d`.' })).toBe(
      true,
    );
  });

  it('should reject another exit code or a refusal that names no prepare command', () => {
    expect(isNotPreparedRefusal({ status: 1, output: 'Run `tau prepare build123d`.' })).toBe(false);
    expect(isNotPreparedRefusal({ status: 3, output: 'No kernel handles ".py".' })).toBe(false);
  });
});

describe('mcpInitializeRequest', () => {
  it('should be one newline-terminated JSON-RPC initialize request', () => {
    expect(mcpInitializeRequest.endsWith('\n')).toBe(true);
    expect(JSON.parse(mcpInitializeRequest)).toMatchObject({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  });
});
