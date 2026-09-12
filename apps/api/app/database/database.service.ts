import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import type { Environment } from '#config/environment.config.js';
import * as schema from '#database/schema.js';
import { SqlLogger } from '#database/database.logger.js';
import { assertSchemaCompatibility } from '#database/database-migration.js';
import { mapPostgresErrorToHint } from '#database/postgres-error-hint.utils.js';

export type DatabaseType = ReturnType<typeof drizzle<typeof schema>>;

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  public readonly database: DatabaseType;

  private readonly client: postgres.Sql;
  private readonly connectionString: string;
  private get isNoticeLogEnabled() {
    // Toggle to enable/disable verbose postgres notices logging.
    // Disabled by default as it is noisy during startup.
    return false;
  }

  public constructor(
    private readonly configService: ConfigService<Environment, true>,
    // oxlint-disable-next-line new-cap -- @InjectPinoLogger is a Nest decorator factory, not a constructor
    @InjectPinoLogger(DatabaseService.name) private readonly logger: PinoLogger,
  ) {
    this.connectionString = this.configService.get<string>('DATABASE_URL', { infer: true });
    const runtimeRole = this.configService.get('DATABASE_RUNTIME_ROLE', { infer: true });

    /* eslint-disable @typescript-eslint/naming-convention -- postgres.js option and PostgreSQL startup parameter names */
    this.client = postgres(this.connectionString, {
      prepare: false,
      // Bounded pool: replicas × max must fit the verified database capacity (B8 R3).
      max: this.configService.get('DATABASE_POOL_MAX', { infer: true }),
      connect_timeout: this.configService.get('DATABASE_CONNECT_TIMEOUT_SECONDS', { infer: true }),
      idle_timeout: this.configService.get('DATABASE_IDLE_TIMEOUT_SECONDS', { infer: true }),
      // Startup parameters apply to every pooled connection, including reconnects. `role` is
      // assumed before the first statement and survives `RESET ROLE`, so the request path cannot
      // climb back to the login identity.
      connection: {
        // Bare integers are milliseconds to PostgreSQL.
        statement_timeout: this.configService.get('DATABASE_STATEMENT_TIMEOUT_MS', { infer: true }),
        lock_timeout: this.configService.get('DATABASE_LOCK_TIMEOUT_MS', { infer: true }),
        idle_in_transaction_session_timeout: this.configService.get('DATABASE_IDLE_IN_TRANSACTION_TIMEOUT_MS', {
          infer: true,
        }),
        ...(runtimeRole ? { role: runtimeRole } : {}),
      },
      onnotice: (notice) => {
        if (this.isNoticeLogEnabled) {
          this.logger.info(`${notice['message']}`);
        }
      },
    });
    /* eslint-enable @typescript-eslint/naming-convention -- postgres.js option and PostgreSQL startup parameter names */
    this.database = drizzle(this.client, { schema, logger: new SqlLogger() });
  }

  public async onModuleDestroy(): Promise<void> {
    await this.client.end();
    this.logger.info('Database connection closed');
  }

  public async onModuleInit(): Promise<void> {
    await this.probeDatabaseConnectivity();
    await this.checkSchemaCompatibility();
    this.logger.info('Database service initialized');
  }

  /**
   * Connectivity probe run before the schema compatibility check.
   *
   * Every connection-level failure mode (paused project, DNS, TCP timeout, role
   * rotation, pooler exhaustion, a missing runtime role) otherwise surfaces as an
   * opaque query failure, making "DB unreachable" indistinguishable from "DB
   * rejected my SQL" in Fly logs. A standalone `SELECT 1` probe with structured
   * error mapping closes that gap for Fly logs and operator dashboards.
   */
  private async probeDatabaseConnectivity(): Promise<void> {
    this.logger.info('Starting database connectivity probe...');
    try {
      await this.database.execute(sql`select 1`);
      this.logger.info('Database connectivity probe succeeded');
    } catch (error) {
      const { host, port } = this.extractConnectionTarget();
      const hint = mapPostgresErrorToHint(error);
      this.logger.error({ err: error, host, port, hint }, 'Database connectivity probe failed');
      throw new Error('Database connectivity probe failed', { cause: error });
    }
  }

  /**
   * Schema compatibility check that replaced startup DDL.
   *
   * API replicas hold the de-privileged runtime role and cannot migrate; the protected
   * one-shot job (`runMigrationJob`) owns DDL. A replica whose image disagrees with the
   * applied schema — older or newer — fails readiness here instead of writing against it.
   */
  private async checkSchemaCompatibility(): Promise<void> {
    try {
      this.logger.info('Checking database schema compatibility...');
      await assertSchemaCompatibility(this.client);
      this.logger.info('Database schema is compatible with this build');
    } catch (error) {
      const hint = mapPostgresErrorToHint(error);
      this.logger.error({ err: error, hint }, 'Database schema compatibility check failed');
      throw new Error('Schema compatibility check failed', { cause: error });
    }
  }

  /**
   * Parses `DATABASE_URL` for structured logging. Returns `undefined` host/port
   * when the URL cannot be parsed (e.g. masked secret) so the probe still
   * surfaces an error log without a secondary URL-parse failure.
   */
  private extractConnectionTarget(): { host: string | undefined; port: string | undefined } {
    try {
      const parsed = new URL(this.connectionString);
      return { host: parsed.hostname, port: parsed.port };
    } catch {
      return { host: undefined, port: undefined };
    }
  }
}
