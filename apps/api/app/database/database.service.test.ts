import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { mock } from 'vitest-mock-extended';
import { getLoggerToken } from 'nestjs-pino';
import type { PinoLogger } from 'nestjs-pino';
import { DatabaseService } from '#database/database.service.js';

/* eslint-disable @typescript-eslint/naming-convention -- fixtures mirror process.env UPPER_SNAKE keys and postgres.js option names */

const { mockAssertCompatibility, mockExecute, mockEnd, mockPostgres } = vi.hoisted(() => {
  const mockAssertCompatibility = vi.fn().mockResolvedValue(undefined);
  // The probe issues `SELECT 1`; postgres returns `[{ '?column?': 1 }]` for that
  // query, so we mirror that wire-format in the canned mock value.
  const mockExecute = vi.fn().mockResolvedValue([{ '?column?': 1 }]);
  const mockEnd = vi.fn().mockResolvedValue(undefined);
  const mockPostgres = vi.fn((_url: string, _options: Record<string, unknown>) => ({ end: mockEnd }));
  return { mockAssertCompatibility, mockExecute, mockEnd, mockPostgres };
});

vi.mock('#database/database-migration.js', () => ({
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
    DATABASE_CONNECT_TIMEOUT_SECONDS: 11,
    DATABASE_IDLE_TIMEOUT_SECONDS: 22,
    DATABASE_STATEMENT_TIMEOUT_MS: 3300,
    DATABASE_LOCK_TIMEOUT_MS: 4400,
    DATABASE_IDLE_IN_TRANSACTION_TIMEOUT_MS: 5500,
    DATABASE_RUNTIME_ROLE: 'tau_api_runtime',
  };
  const mockConfigService = {
    get: vi.fn((key: string) => configuration[key]),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    configuration['DATABASE_URL'] = 'postgres://test:test@db.example.com:5432/test';
    configuration['DATABASE_RUNTIME_ROLE'] = 'tau_api_runtime';
    mockExecute.mockResolvedValue([{ '?column?': 1 }]);
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
      expect(logger.info).toHaveBeenCalledWith('Database connectivity probe succeeded');
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
    it('should close the underlying postgres client and log shutdown', async () => {
      await service.onModuleDestroy();

      expect(mockEnd).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith('Database connection closed');
    });
  });
});

/* eslint-enable @typescript-eslint/naming-convention -- fixtures mirror process.env UPPER_SNAKE keys and postgres.js option names */
