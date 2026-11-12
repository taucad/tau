import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { mock } from 'vitest-mock-extended';
import { getLoggerToken } from 'nestjs-pino';
import type { PinoLogger } from 'nestjs-pino';
import { DatabaseService } from '#database.service.js';

/* eslint-disable @typescript-eslint/naming-convention -- fixtures mirror process.env UPPER_SNAKE keys and postgres.js option names */

const { mockAssertCompatibility, mockExecute, mockEnd, mockPostgres } = vi.hoisted(() => {
  const mockAssertCompatibility = vi.fn().mockResolvedValue(undefined);
  // The probe reads the session's role and deadlines (database connection audit R1).
  const mockExecute = vi.fn();
  const mockEnd = vi.fn().mockResolvedValue(undefined);
  const mockPostgres = vi.fn((_url: string, _options: Record<string, unknown>) => ({ end: mockEnd }));
  return { mockAssertCompatibility, mockExecute, mockEnd, mockPostgres };
});

vi.mock('#database-migration.js', () => ({
  assertSchemaCompatibility: mockAssertCompatibility,
}));

vi.mock('drizzle-orm/postgres-js', () => ({
  drizzle: vi.fn(() => ({
    execute: mockExecute,
  })),
}));

vi.mock('postgres', () => ({
  default: mockPostgres,
}));

describe('DatabaseService', () => {
  let module: TestingModule;
  let service: DatabaseService;
  let logger: PinoLogger;

  const configuration: Record<string, string | number> = {
    DATABASE_URL: 'postgres://test:test@db.example.com:5432/test',
    DATABASE_POOL_MAX: 7,
    DATABASE_BACKGROUND_POOL_MAX: 1,
    DATABASE_POOLER_POOL_SIZE: 15,
    DATABASE_CONNECT_TIMEOUT_SECONDS: 11,
    DATABASE_IDLE_TIMEOUT_SECONDS: 22,
    DATABASE_STATEMENT_TIMEOUT_MS: 3300,
    DATABASE_LOCK_TIMEOUT_MS: 4400,
    DATABASE_IDLE_IN_TRANSACTION_TIMEOUT_MS: 5500,
    DATABASE_RUNTIME_ROLE: 'tau_api_runtime',
  };
  const session = {
    current_user: 'tau_api_runtime',
    statement_timeout: '3300ms',
    lock_timeout: '4400ms',
    idle_in_transaction_session_timeout: '5500ms',
  };
  const mockConfigService = {
    get: vi.fn((key: string) => configuration[key]),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    configuration['DATABASE_URL'] = 'postgres://test:test@db.example.com:5432/test';
    configuration['DATABASE_RUNTIME_ROLE'] = 'tau_api_runtime';
    mockExecute.mockResolvedValue([session]);
    mockAssertCompatibility.mockResolvedValue(undefined);

    logger = mock<PinoLogger>({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      setContext: vi.fn(),
    });

    module = await Test.createTestingModule({
      providers: [
        DatabaseService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: getLoggerToken(DatabaseService.name), useValue: logger },
      ],
    }).compile();

    service = module.get<DatabaseService>(DatabaseService);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('onModuleInit', () => {
    it('should run the connectivity probe and the schema check without running startup DDL', async () => {
      await service.onModuleInit();

      expect(mockExecute).toHaveBeenCalledTimes(1);
      expect(mockAssertCompatibility).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith({ session }, 'Database connectivity probe succeeded');
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Database schema is compatible with this build');
      expect(logger.info).toHaveBeenCalledWith('Database service initialized');
    });

    it('should bound the pool and assume the de-privileged runtime role on every connection', () => {
      const options = mockPostgres.mock.calls[0]![1];
      expect(options).toMatchObject({ max: 7, connect_timeout: 11, idle_timeout: 22, prepare: false });
      expect(options['connection']).toMatchObject({
        statement_timeout: 3300,
        lock_timeout: 4400,
        idle_in_transaction_session_timeout: 5500,
        role: 'tau_api_runtime',
      });
    });

    it('should name its connections for `tau.db.connections` (W14 OB3)', () => {
      const options = mockPostgres.mock.calls[0]![1];
      expect(options['connection']).toMatchObject({
        application_name: 'tau-api',
      });
    });

    /* Database connection audit R3/R4: pollers and gauges get their own small pool, and each pool counts its sockets. */
    it('should open a separate background pool with its own cap and name, and count both pools', () => {
      expect(mockPostgres).toHaveBeenCalledTimes(2);
      const [request, background] = mockPostgres.mock.calls.map((call) => call[1]);
      expect(background).toMatchObject({ max: 1, connect_timeout: 11, idle_timeout: 22, prepare: false });
      expect(background!['connection']).toMatchObject({
        application_name: 'tau-api-background',
        statement_timeout: 3300,
        role: 'tau_api_runtime',
      });
      expect(request!['socket']).toBeTypeOf('function');
      expect(background!['socket']).toBeTypeOf('function');
      expect(service.background).not.toBe(service.database);
    });

    it.each([
      ['the login role', { ...session, current_user: 'postgres' }],
      ['dropped timeouts', { ...session, statement_timeout: '0', lock_timeout: '0' }],
    ])('should warn, without failing boot, when the pooler drops %s', async (_label, dropped) => {
      mockExecute.mockResolvedValueOnce([dropped]);

      await service.onModuleInit();

      expect(logger.warn).toHaveBeenCalledWith(
        { session: dropped, expectedRole: 'tau_api_runtime', hint: 'startup parameters dropped by pooler' },
        'Database connection does not carry the configured role or timeouts',
      );
      expect(logger.info).toHaveBeenCalledWith('Database service initialized');
    });

    it('should omit the role startup parameter when no runtime role is configured', async () => {
      configuration['DATABASE_RUNTIME_ROLE'] = '';
      await module.close();
      module = await Test.createTestingModule({
        providers: [
          DatabaseService,
          { provide: ConfigService, useValue: mockConfigService },
          { provide: getLoggerToken(DatabaseService.name), useValue: logger },
        ],
      }).compile();
      module.get<DatabaseService>(DatabaseService);

      const options = mockPostgres.mock.calls.at(-1)![1];
      expect(options['connection']).not.toHaveProperty('role');
    });

    it('should log structured probe failure with err/host/port/hint and rethrow with cause when SELECT 1 fails', async () => {
      const probeError = Object.assign(new Error('connect ECONNREFUSED 1.2.3.4:5432'), {
        code: 'ECONNREFUSED',
      });
      mockExecute.mockRejectedValueOnce(probeError);

      try {
        await service.onModuleInit();
        expect.fail('expected onModuleInit to throw');
      } catch (error) {
        expect((error as Error).message).toBe('Database connectivity probe failed');
        expect((error as Error).cause).toBe(probeError);
      }

      expect(mockAssertCompatibility).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledTimes(1);
      const probeCall = vi.mocked(logger.error).mock.calls[0]!;
      const probePayload = probeCall[0] as Record<string, unknown>;
      const probeMessage = probeCall[1]!;
      expect(probeMessage).toBe('Database connectivity probe failed');
      expect(probePayload).toMatchObject({
        err: probeError,
        host: 'db.example.com',
        port: '5432',
      });
      expect(probePayload['hint']).toContain('Postgres host refused connection');
    });

    it('should fail readiness with a structured log when the schema check rejects a behind database', async () => {
      const schemaError = Object.assign(new Error('Database schema is behind this build: applied 31 migration(s)'), {
        code: '42501',
      });
      mockAssertCompatibility.mockRejectedValueOnce(schemaError);

      try {
        await service.onModuleInit();
        expect.fail('expected onModuleInit to throw');
      } catch (error) {
        expect((error as Error).message).toBe('Schema compatibility check failed');
        expect((error as Error).cause).toBe(schemaError);
      }

      expect(logger.error).toHaveBeenCalledTimes(1);
      const schemaCall = vi.mocked(logger.error).mock.calls[0]!;
      const schemaPayload = schemaCall[0] as Record<string, unknown>;
      expect(schemaCall[1]!).toBe('Database schema compatibility check failed');
      expect(schemaPayload).toMatchObject({ err: schemaError });
      expect(schemaPayload['hint']).toContain('Insufficient privilege');
    });

    it('should still log a probe failure (with undefined host/port) when DATABASE_URL is malformed', async () => {
      configuration['DATABASE_URL'] = 'not-a-valid-url';
      // Re-create the service with the malformed URL.
      await module.close();
      module = await Test.createTestingModule({
        providers: [
          DatabaseService,
          { provide: ConfigService, useValue: mockConfigService },
          { provide: getLoggerToken(DatabaseService.name), useValue: logger },
        ],
      }).compile();
      service = module.get<DatabaseService>(DatabaseService);

      const probeError = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
      mockExecute.mockRejectedValueOnce(probeError);

      await expect(service.onModuleInit()).rejects.toThrow('Database connectivity probe failed');

      const malformedCall = vi.mocked(logger.error).mock.calls[0]!;
      const malformedPayload = malformedCall[0] as Record<string, unknown>;
      expect(malformedPayload).toMatchObject({ err: probeError, host: undefined, port: undefined });
    });
  });

  describe('onModuleDestroy', () => {
    it('should close both postgres clients and log shutdown', async () => {
      await service.onModuleDestroy();

      expect(mockEnd).toHaveBeenCalledTimes(2);
      expect(logger.info).toHaveBeenCalledWith('Database connection closed');
    });
  });
});

/* eslint-enable @typescript-eslint/naming-convention -- fixtures mirror process.env UPPER_SNAKE keys and postgres.js option names */
