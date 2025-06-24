import path from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import type { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import type { Environment } from '~/config/environment.config.js';
import * as schema from '~/database/schema.js';

export type DatabaseType = ReturnType<typeof drizzle<typeof schema>>;

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  public readonly database: DatabaseType;

  private readonly logger = new Logger(DatabaseService.name);
  private readonly client: postgres.Sql;

  public constructor(private readonly configService: ConfigService<Environment, true>) {
    const connectionString: string = this.configService.get<string>('DATABASE_URL', { infer: true });

    this.client = postgres(connectionString, { prepare: false });
    this.database = drizzle(this.client, { schema });
  }

  public async onModuleDestroy(): Promise<void> {
    await this.client.end();
    this.logger.log('Database connection closed');
  }

  public async onModuleInit(): Promise<void> {
    await this.runMigrations();
    this.logger.log('Database service initialized');
  }

  private async runMigrations(): Promise<void> {
    try {
      this.logger.log('Starting database migrations...');

      // Use the same database instance for migrations to ensure consistency
      await migrate(this.database, {
        migrationsFolder: path.join(import.meta.dirname, 'migrations'),
      });

      this.logger.log('Database migrations completed successfully');
    } catch (error) {
      this.logger.error('Database migration failed:', error);
      throw new Error(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
