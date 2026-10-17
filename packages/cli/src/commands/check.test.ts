import { describe, expect, it } from 'vitest';

import { checkStatus } from '#commands/check.js';

type Issue = Parameters<typeof checkStatus>[1][number];

const issue = (code: string, severity: 'error' | 'warning' = 'error'): Issue =>
  ({ code, severity, type: 'kernel', message: code }) as unknown as Issue;

describe('checkStatus', () => {
  it('should be ok for a successful evaluation with only warnings', () => {
    expect(checkStatus(true, [issue('SLOW', 'warning')])).toBe('ok');
  });

  it.each(['KERNEL_NOT_PREPARED', 'KERNEL_CAPABILITY_MISSING', 'TRANSCODER_CAPABILITY_MISSING'])(
    'should be refused for %s',
    (code) => {
      expect(checkStatus(false, [issue(code)])).toBe('refused');
    },
  );

  it('should be an error for a model failure, or an error issue on a successful evaluation', () => {
    expect(checkStatus(false, [issue('RUNTIME')])).toBe('error');
    expect(checkStatus(true, [issue('RUNTIME')])).toBe('error');
    expect(checkStatus(false, [])).toBe('error');
  });
});
