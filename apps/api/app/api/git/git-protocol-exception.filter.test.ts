/* oxlint-disable eslint-plugin-promise/prefer-await-to-then, eslint-plugin-promise/valid-params -- filter.catch() is a method name, not Promise.catch() */
/* oxlint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument -- test mock casts */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InternalServerErrorException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { GitProtocolExceptionFilter } from '#api/git/git-protocol-exception.filter.js';
import { reportServerError } from '#telemetry/sentry.js';
import type * as SentryModule from '#telemetry/sentry.js';

vi.mock('#telemetry/sentry.js', async (importOriginal) => ({
  ...(await importOriginal<typeof SentryModule>()),
  reportServerError: vi.fn(),
}));

const retryableCodes = ['GIT_LEASE_OWNER_BUSY', 'GIT_LEASE_DISK_FULL', 'GIT_PUSH_RACE_LOST', 'GIT_SERVICE_RESTARTING'];

/**
 * A Nest arguments host for one git request.
 *
 * @param origin - The `Origin` header a browser sends, or undefined for stock git.
 * @returns The host plus the reply it answers on.
 */
const createHost = (origin?: string) => {
  const reply = {
    sent: false,
    header: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  const request = {
    url: '/v1/git/prj_1/git-receive-pack',
    id: 'req_git_1',
    headers: origin === undefined ? {} : { origin },
  };
  return {
    switchToHttp: () => ({ getResponse: () => reply, getRequest: () => request }),
    reply,
  };
};

const refusal = (code: string): ServiceUnavailableException =>
  new ServiceUnavailableException({ code, message: 'Busy; retry shortly.' });

describe('GitProtocolExceptionFilter', () => {
  let filter: GitProtocolExceptionFilter;
  let warn: ReturnType<typeof vi.spyOn>;
  let errorLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    filter = new GitProtocolExceptionFilter();
    vi.mocked(reportServerError).mockClear();
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    errorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('browser origin', () => {
    it.each(retryableCodes)('should answer %s as JSON and a warning, not a Sentry error (X3)', (code) => {
      const host = createHost('https://tau.new');

      filter.catch(refusal(code), host as any);

      expect(host.reply.status).toHaveBeenCalledWith(503);
      expect(host.reply.send).toHaveBeenCalledWith(expect.objectContaining({ code, statusCode: 503 }));
      expect(reportServerError).not.toHaveBeenCalled();
      expect(errorLog).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith({ code, statusCode: 503, requestId: 'req_git_1' }, 'Retryable git refusal');
    });

    it('should still report an incomplete repository to Sentry', () => {
      const host = createHost('https://tau.new');
      const incomplete = new InternalServerErrorException({ code: 'GIT_REPOSITORY_INCOMPLETE', message: 'Damaged.' });

      filter.catch(incomplete, host as any);

      expect(reportServerError).toHaveBeenCalledTimes(1);
      expect(reportServerError).toHaveBeenCalledWith(incomplete, 'req_git_1');
    });

    it('should still report a 503 whose code is not a known retryable refusal', () => {
      const host = createHost('https://tau.new');
      const unknown = refusal('GIT_SOMETHING_NEW');

      filter.catch(unknown, host as any);

      expect(reportServerError).toHaveBeenCalledTimes(1);
      expect(reportServerError).toHaveBeenCalledWith(unknown, 'req_git_1');
    });
  });

  describe('stock git', () => {
    it.each(retryableCodes)('should answer %s as text git prints, logged as a retryable refusal', (code) => {
      const host = createHost();

      filter.catch(refusal(code), host as any);

      expect(host.reply.status).toHaveBeenCalledWith(503);
      expect(host.reply.header).toHaveBeenCalledWith('content-type', 'text/plain; charset=utf-8');
      expect(host.reply.send).toHaveBeenCalledWith('Busy; retry shortly.\n');
      expect(reportServerError).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith({ code, statusCode: 503, requestId: 'req_git_1' }, 'Retryable git refusal');
    });

    it('should log any other refusal with its code', () => {
      const host = createHost();

      filter.catch(
        new InternalServerErrorException({ code: 'GIT_REPOSITORY_INCOMPLETE', message: 'Damaged.' }),
        host as any,
      );

      expect(warn).toHaveBeenCalledWith(
        { status: 500, code: 'GIT_REPOSITORY_INCOMPLETE', message: 'Damaged.' },
        'Git protocol refusal',
      );
    });
  });
});
