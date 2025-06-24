import type { DatabaseType } from '~/database/database.service.js';
import { DatabaseService } from '~/database/database.service.js';

export const databaseToken = Symbol('DATABASE_TOKEN');

/**
 * Alternative provider for cases where you want to inject the database instance directly
 * instead of the service. Usually, injecting DatabaseService is preferred.
 */
export const databaseProvider = {
  provide: databaseToken,
  useFactory: (databaseService: DatabaseService): DatabaseType => databaseService.database,
  inject: [DatabaseService],
};

export type DatabaseProviderType = typeof databaseProvider;
