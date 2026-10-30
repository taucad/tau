import { afterEach, describe, expect, it, vi } from 'vitest';
import { RevisionFailure, reportRevisionToast } from '#lib/revision-failure-reporting.js';

const reportUiError = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('#lib/error-reporting.js', () => ({ reportUiError }));

afterEach(() => {
  reportUiError.mockClear();
});

describe('reportRevisionToast', () => {
  it('should report an error toast with its code, subject and operation, grouped by subject and code', () => {
    reportRevisionToast({
      type: 'error',
      subject: 'connection',
      code: 'HOST_CONFIGURATION_MISMATCH',
      message: 'The host refused this revision connection.',
      generation: 1,
      connectionOperation: 'status',
    });

    expect(reportUiError).toHaveBeenCalledOnce();
    const [error, details] = reportUiError.mock.calls[0] as unknown as [Error, unknown];
    expect(error).toBeInstanceOf(RevisionFailure);
    expect(error.message).toBe('The host refused this revision connection.');
    expect(details).toEqual({
      tags: { code: 'HOST_CONFIGURATION_MISMATCH', subject: 'connection', operation: 'status' },
      fingerprint: ['revision-failure', 'connection', 'HOST_CONFIGURATION_MISMATCH'],
    });
  });

  it('should name a refusal without a code UNKNOWN', () => {
    reportRevisionToast({ type: 'error', subject: 'save', message: 'Buffer is not defined' });

    const [, details] = reportUiError.mock.calls[0] as unknown as [Error, { tags: unknown }];
    expect(details.tags).toEqual({ code: 'UNKNOWN', subject: 'save' });
  });

  it.each(['RESTORE_UNRECORDED', 'UNDO_UNAVAILABLE', 'NOTHING_TO_UNDO', 'UNDO_PAST_MERGE'])(
    'should not report %s, which lost nothing',
    (code) => {
      reportRevisionToast({ type: 'error', subject: 'restore', message: 'lost nothing', code });

      expect(reportUiError).not.toHaveBeenCalled();
    },
  );

  it('should not report a toast that is not an error', () => {
    reportRevisionToast({ type: 'restored', revisionNumber: 2 });
    reportRevisionToast({ type: 'notice', subject: 'remote', tone: 'error', message: 'The backup could not finish.' });

    expect(reportUiError).not.toHaveBeenCalled();
  });
});
