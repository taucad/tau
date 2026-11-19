import { describe, expect, it } from 'vitest';
import { CadmpegError } from 'cadmpeg-ts/core';

import { failureMessage, lossIssue } from '#cadmpeg-issues.js';

describe('cadmpeg issues', () => {
  it('maps a loss to a representation warning that keeps cadmpeg’s code', () => {
    expect(lossIssue({ phase: 'decode', code: 'shared/pcurve_omitted', severity: 'warning', message: 'm' })).toEqual({
      message: 'm',
      code: 'REPRESENTATION_UNSUPPORTED',
      type: 'kernel',
      severity: 'warning',
      details: { cadmpegCode: 'shared/pcurve_omitted', phase: 'decode', severity: 'warning' },
    });
    expect(lossIssue({ phase: 'export', code: 'x/y', severity: 'info', message: 'i' }).severity).toBe('info');
  });

  it('names the code and phase of a cadmpeg failure', () => {
    expect(failureMessage(new CadmpegError('REFUSED', 'no', { phase: 'export' }))).toBe('cadmpeg REFUSED (export): no');
    expect(failureMessage(new CadmpegError('NO_FILES', 'empty'))).toBe('cadmpeg NO_FILES: empty');
    expect(failureMessage(new Error('plain'))).toBe('plain');
    expect(failureMessage('thrown string')).toBe('cadmpeg conversion failed');
  });
});
