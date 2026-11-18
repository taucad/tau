import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportProjectCreationFailure } from '#lib/project-creation-failure-reporting.js';
import { PendingProjectRecoveryError } from '@taucad/files-ui/runtime/project-library-storage';

const reportUiError = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('#lib/error-reporting.js', () => ({ reportUiError }));

afterEach(() => {
  reportUiError.mockClear();
});

describe('reportProjectCreationFailure', () => {
  it('should report a failed commit tagged and grouped by its recovery reason', () => {
    const error = new PendingProjectRecoveryError('filesystem-error', {
      cause: new TypeError('Pending project commit manifest is invalid'),
    });

    reportProjectCreationFailure(error);

    expect(reportUiError).toHaveBeenCalledExactlyOnceWith(error, {
      tags: { operation: 'create-project', reason: 'filesystem-error' },
      fingerprint: ['project-creation-failure', 'filesystem-error'],
    });
  });

  it('should report any other failure under the reason unknown', () => {
    const error = new Error('worker gone');

    reportProjectCreationFailure(error);

    expect(reportUiError).toHaveBeenCalledExactlyOnceWith(error, {
      tags: { operation: 'create-project', reason: 'unknown' },
      fingerprint: ['project-creation-failure', 'unknown'],
    });
  });
});
