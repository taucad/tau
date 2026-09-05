/* eslint-disable @typescript-eslint/naming-convention -- ConfigService consumes environment keys. */
import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { pinoHttp } from 'pino-http';
import type { Environment } from '#config/environment.config.js';
import { logServiceProvider } from '#constants/app.constant.js';
import { useLoggerFactory } from '#logger/logger-factory.js';

describe('bearer authentication logging', () => {
  it('redacts authorization bearer values without mutating the request', async () => {
    const configService = new ConfigService<Environment, true>({
      NODE_ENV: 'production',
      LOG_LEVEL: 'info',
      LOG_SERVICE: logServiceProvider.fly,
    });
    const loggerParameters = await useLoggerFactory(configService);
    const { pinoHttp: options } = loggerParameters;
    if (!options || Array.isArray(options) || 'write' in options) {
      throw new Error('Logger factory did not return pino-http options.');
    }

    let output = '';
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        output += String(chunk);
        callback();
      },
    });
    const { logger } = pinoHttp(options, destination);
    const token = 'bearer-session-secret-that-must-not-log';
    const request = { req: { headers: { authorization: `Bearer ${token}` } } };

    logger.info(request, 'authenticated request');

    expect(request.req.headers.authorization).toBe(`Bearer ${token}`);
    expect(output).toContain('authenticated request');
    expect(output).not.toContain(token);
    expect(output).not.toContain(`Bearer ${token}`);
  });
});
