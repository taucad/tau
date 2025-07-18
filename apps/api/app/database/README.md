# Database Module

This module provides a NestJS-compatible database service using Drizzle ORM with PostgreSQL.

## Features

- ✅ NestJS dependency injection support
- ✅ Automatic database migrations on startup
- ✅ Proper connection lifecycle management
- ✅ Type-safe database access
- ✅ Configuration via environment variables
- ✅ Single source of truth for database connections

## Usage

### 1. Import the DatabaseModule

```typescript
import { DatabaseModule } from '~/database/database.module.js';

@Module({
  imports: [DatabaseModule],
  // ...
})
export class YourModule {}
```

### 2. Inject DatabaseService in your services

```typescript
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '~/database/database.service.js';

@Injectable()
export class YourService {
  constructor(private readonly databaseService: DatabaseService) {}

  async findUser(id: string) {
    // Direct property access - simple and clean!
    const db = this.databaseService.database;
    
    // Use Drizzle ORM queries here
    return await db.select().from(userTable).where(eq(userTable.id, id));
  }

  async createUser(userData: CreateUserData) {
    // No method call needed - just access the property directly
    return await this.databaseService.database
      .insert(userTable)
      .values(userData);
  }
}
```

### 3. Environment Configuration

Make sure you have the following environment variable set:

```bash
DATABASE_URL=postgresql://username:password@localhost:5432/database_name
```

## Migration

Migrations run automatically during service initialization (`OnModuleInit`). The service ensures that:

- Migrations complete **before** the service is marked as ready
- All database connections use the same configuration
- No duplicate connection logic

Place your migration files in the `./migrations` directory.

## Architecture

- **DatabaseService**: Main service providing database connection via public `database` property
  - Handles database connection setup
  - Runs migrations during initialization
  - Manages connection lifecycle
- **DatabaseModule**: NestJS module that provides the database service

### Why this architecture?

✅ **Single responsibility**: DatabaseService handles all database concerns  
✅ **No duplication**: One place for connection logic  
✅ **Proper timing**: Migrations run during `OnModuleInit` before service is ready  
✅ **Consistency**: Same connection setup for both app and migrations  

## Legacy Support

The original `client.ts` file is maintained for backward compatibility, but new code should use the `DatabaseService` with proper dependency injection.

## File Structure

```
database/
├── client.ts              # Legacy export (backward compatibility)
├── database.module.ts     # NestJS module
├── database.service.ts    # Main database service (includes migrations)
├── database.provider.ts   # DI tokens and providers
├── usage-example.service.ts # Example usage
├── schema.ts             # Database schema
├── auth-schema.ts        # Authentication schema
└── README.md             # This file
``` 
