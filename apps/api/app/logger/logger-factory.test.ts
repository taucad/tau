/* eslint-disable @typescript-eslint/naming-convention -- fixtures mirror environment variable names. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ConfigService } from '@nestjs/config';
import type { PinoLoggerOptions } from 'fastify/types/logger.js';
import { pinoHttp } from 'pino-http';
import type { Options } from 'pino-http';
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { Environment } from '#config/environment.config.js';
import { getFastifyLoggingConfig } from '#logger/fastify.logger.js';
import { redactUrlQuery, useLoggerFactory } from '#logger/logger-factory.js';

const requestLogOptions = async (): Promise<Options> => {
  const config = mock<ConfigService<Environment, true>>();
  config.get.mockImplementation(
    (key: keyof Environment) => ({ NODE_ENV: 'development', LOG_LEVEL: 'info', LOG_SERVICE: 'console' })[key as string],
  );
  const { pinoHttp } = await useLoggerFactory(config);
  return pinoHttp as Options;
};

describe('request log URL redaction', () => {
  it.each([
    ['/v1/github/callback?code=oauth-code&state=oauth-state', '/v1/github/callback'],
    ['/v1/github/callback/?error=access_denied&state=oauth-state', '/v1/github/callback/'],
    ['/v1/auth/callback/github?code=oauth-code&state=oauth-state', '/v1/auth/callback/github'],
    ['/v1/auth/callback/google?code=oauth-code', '/v1/auth/callback/google'],
  ])('should keep only the path of the OAuth callback %s', (url, path) => {
    expect(redactUrlQuery(url)).toBe(path);
  });

  it.each(['/v1/github/repositories?connectionId=c&page=2', '/v1/github/callbacks?code=x', '/v1/github/callback'])(
    'should leave %s unchanged',
    (url) => {
      expect(redactUrlQuery(url)).toBe(url);
    },
  );

  it('should drop the callback query from the serialized request and the response message', async () => {
    const options = await requestLogOptions();
    const serializeRequest = options.serializers?.['req'];
    const url = '/v1/github/callback?code=oauth-code&state=oauth-state';

    const serialized = serializeRequest?.({ url, query: { code: 'oauth-code', state: 'oauth-state' } }) as unknown;
    const message = options.customSuccessMessage?.(
      mock<IncomingMessage>({ id: 'request-1', method: 'GET', url }),
      mock<ServerResponse>({ statusCode: 302 }),
      4,
    );

    expect(serialized).toStrictEqual({ url: '/v1/github/callback', query: undefined });
    expect(message).toContain('/v1/github/callback');
    expect(message).not.toContain('oauth-code');
    expect(message).not.toContain('oauth-state');
  });

  it.each([true, false])(
    'should drop the callback query from the received message when middleware rewrote the URL (DEV %s)',
    async (development) => {
      vi.stubEnv('DEV', development);
      const options = await requestLogOptions();
      const message = options.customReceivedMessage?.(
        mock<IncomingMessage>({
          id: 'request-2',
          method: 'GET',
          url: '/?code=oauth-code&state=oauth-state',
          originalUrl: '/v1/auth/callback/github?code=oauth-code&state=oauth-state',
        } as Partial<IncomingMessage>),
        mock<ServerResponse>(),
      );

      vi.unstubAllEnvs();
      expect(message).toContain('/v1/auth/callback/github');
      expect(message).not.toContain('oauth-code');
      expect(message).not.toContain('oauth-state');
    },
  );

  it('should redact the session token a sign-in response sets', async () => {
    const options = await requestLogOptions();
    const lines: string[] = [];
    const { logger } = pinoHttp({ redact: options.redact }, { write: (line: string) => lines.push(line) });

    logger.info({
      res: {
        statusCode: 302,
        getHeaders: () => ({ 'set-cookie': ['tau.session_token=session-secret'], 'set-auth-token': 'session-secret' }),
      },
    });

    expect(lines.join('')).not.toContain('session-secret');
  });

  it('should keep the query of other requests in the serialized request', async () => {
    const options = await requestLogOptions();
    const request = { url: '/v1/github/repositories?page=2', query: { page: '2' } };

    expect(options.serializers?.['req']?.(request)).toStrictEqual(request);
  });
});

describe('Fastify logger URL redaction', () => {
  it('should drop the callback query from the request Fastify logs itself', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    try {
      const options = getFastifyLoggingConfig() as PinoLoggerOptions;
      const serializeRequest = options.serializers?.['req'];
      const request = {
        method: 'GET',
        headers: {},
        host: 'api.tau.test',
        ip: '127.0.0.1',
        socket: { remotePort: 4100 },
      };

      expect(
        serializeRequest?.({ ...request, url: '/v1/github/callback?code=oauth-code&state=oauth-state' }),
      ).toMatchObject({
        method: 'GET',
        url: '/v1/github/callback',
        host: 'api.tau.test',
      });
      expect(serializeRequest?.({ ...request, url: '/v1/github/repositories?page=2' })).toMatchObject({
        url: '/v1/github/repositories?page=2',
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
