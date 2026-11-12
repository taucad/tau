import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import type { Environment } from '@taucad/api-core';
import * as schema from '#schema/index.js';
import { SqlLogger } from '#database.logger.js';
import { assertSchemaCompatibility } from '#database-migration.js';
import { mapPostgresErrorToHint } from '#postgres-error-hint.utils.js';
import { applicationNameOf } from '#application-name.js';
import {
  countedSocketOption,
  initializePoolSeries,
  observePoolerCapacity,
  observeRefusals,
} from '#pool-instrumentation.js';
import type { DatabasePool } from '#pool-instrumentation.js';

export type DatabaseType = ReturnType<typeof drizzle<typeof schema>>;

/** What the boot probe reads from inside a request connection (database connection audit R1). */
type SessionIdentity = {
  readonly current_user: string;
  readonly statement_timeout: string;
  readonly lock_timeout: string;
  readonly idle_in_transaction_session_timeout: string;
};

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  /** The request pool: HTTP and WebSocket traffic. */
  public readonly database: DatabaseType;
  /**
   * The background pool (database connection audit R3): the pollers and collection-time gauges that run
   * on every Machine. It is small (`DATABASE_BACKGROUND_POOL_MAX`, default 1) so they queue among
   * themselves inside postgres.js and never take the request pool's connections. Use it only outside
   * a request, and never query it from inside one of its own transactions: with one connection that waits forever.
   */
  public readonly background: DatabaseType;

  private readonly client: postgres.Sql;
  private readonly backgroundClient: postgres.Sql;
  private readonly connectionString: string;
  private readonly stopCapacity: (() => void) | undefined;
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
    // Bounded pools: Machines × (request + background) plus the maintenance worker must fit the
    // session pool (`DATABASE_POOLER_POOL_SIZE`, `apps/api/app/config/connection-budget.test.ts`).
    this.client = this.createPool('request', this.configService.get('DATABASE_POOL_MAX', { infer: true }));
    this.backgroundClient = this.createPool(
      'background',
      this.configService.get('DATABASE_BACKGROUND_POOL_MAX', { infer: true }),
    );
    this.database = drizzle(observeRefusals(this.client, 'request'), { schema, logger: new SqlLogger() });
    this.background = drizzle(observeRefusals(this.backgroundClient, 'background'), {
      schema,
      logger: new SqlLogger(),
    });
    const capacity = this.configService.get('DATABASE_POOLER_POOL_SIZE', { infer: true });
    this.stopCapacity = capacity === undefined ? undefined : observePoolerCapacity(capacity);
  }

  public async onModuleDestroy(): Promise<void> {
    this.stopCapacity?.();
    await Promise.all([this.client.end(), this.backgroundClient.end()]);
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
   * rejected my SQL" in Fly logs. A standalone probe with structured error mapping
   * closes that gap for Fly logs and operator dashboards.
   *
   * It also reads the identity and deadlines the connection actually got (database connection
   * audit R1): a session pooler may drop the `role` and timeout startup parameters, and then the
   * request path runs as the login. That is a warning for now; R2 makes it refuse boot.
   */
  private async probeDatabaseConnectivity(): Promise<void> {
    this.logger.info('Starting database connectivity probe...');
    let session: SessionIdentity | undefined;
    try {
      const rows = await this.database.execute<SessionIdentity>(sql`
        select current_user,
               current_setting('statement_timeout') as statement_timeout,
               current_setting('lock_timeout') as lock_timeout,
               current_setting('idle_in_transaction_session_timeout') as idle_in_transaction_session_timeout
      `);
      session = (rows as unknown as readonly SessionIdentity[])[0];
    } catch (error) {
      const { host, port } = this.extractConnectionTarget();
      const hint = mapPostgresErrorToHint(error);
      this.logger.error({ err: error, host, port, hint }, 'Database connectivity probe failed');
      throw new Error('Database connectivity probe failed', { cause: error });
    }
    this.logger.info({ session }, 'Database connectivity probe succeeded');
    this.warnOnDroppedStartupParameters(session);
  }

  /**
   * Warns when the connection is not the one the startup parameters asked for.
   *
   * @param session - What the probe read, if it returned a row.
   */
  private warnOnDroppedStartupParameters(session: SessionIdentity | undefined): void {
    const runtimeRole = this.configService.get('DATABASE_RUNTIME_ROLE', { infer: true });
    const roleDropped = runtimeRole !== '' && session?.current_user !== runtimeRole;
    const timeoutsDropped =
      session !== undefined &&
      [session.statement_timeout, session.lock_timeout, session.idle_in_transaction_session_timeout].includes('0');
    if (roleDropped || timeoutsDropped) {
      this.logger.warn(
        {
          session,
          expectedRole: runtimeRole === '' ? undefined : runtimeRole,
          hint: 'startup parameters dropped by pooler',
        },
        'Database connection does not carry the configured role or timeouts',
      );
    }
  }

  /**
   * One postgres.js client: the API's startup parameters, a counted socket and its pool's series.
   *
   * @param pool - Which pool it is.
   * @param max - Its connection cap.
   * @returns The client.
   */
  private createPool(pool: DatabasePool, max: number): postgres.Sql {
    const runtimeRole = this.configService.get('DATABASE_RUNTIME_ROLE', { infer: true });
    initializePoolSeries(pool);
    /* eslint-disable @typescript-eslint/naming-convention -- postgres.js option and PostgreSQL startup parameter names */
    return postgres(this.connectionString, {
      prepare: false,
      max,
      connect_timeout: this.configService.get('DATABASE_CONNECT_TIMEOUT_SECONDS', { infer: true }),
      idle_timeout: this.configService.get('DATABASE_IDLE_TIMEOUT_SECONDS', { infer: true }),
      ...countedSocketOption(pool),
      // Startup parameters apply to every pooled connection, including reconnects. `role` is
      // assumed before the first statement and survives `RESET ROLE`, so the request path cannot
      // climb back to the login identity.
      connection: {
        // `tau.db.connections` tells Tau's processes apart by this (W14 OB3).
        application_name: applicationNameOf(pool === 'request' ? 'api' : 'api-background'),
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
