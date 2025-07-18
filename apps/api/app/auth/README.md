# Auth Module

This module provides a NestJS-compatible authentication system using BetterAuth with Drizzle ORM integration.

## Overview

The auth module follows the pattern from the [Ultimate NestJS Boilerplate](https://github.com/niraj-khatiwada/ultimate-nestjs-boilerplate/tree/main/src/auth) but adapted for Drizzle instead of TypeORM.

## Architecture

- **AuthModule**: Main module with `forRootAsync()` for global auth setup
- **AuthService**: Handles auth-related database operations and utilities  
- **BetterAuthService**: Provides access to BetterAuth API
- **AuthGuard**: Global guard for protecting routes (REST, GraphQL, WebSocket)
- **Public Decorator**: Marks routes as publicly accessible

## Key Components

### 1. Authentication Guard

The `AuthGuard` automatically protects all routes unless marked as public:

```typescript
// All routes are protected by default
@Controller('users')
export class UsersController {
  @Get()
  findAll() {} // Requires authentication
  
  @Public()
  @Get('public')
  publicEndpoint() {} // Public access
}
```

### 2. Database Integration

Uses the DatabaseService to ensure consistent connection handling:

```typescript
// AuthService uses the same database connection as your app
@Injectable()
export class AuthService {
  constructor(private readonly databaseService: DatabaseService) {}
  
  async findUserByEmail(email: string) {
    return await this.databaseService.database
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email));
  }
}
```

### 3. BetterAuth Configuration

Centralized configuration in `config/better-auth.config.ts`:

```typescript
export function getBetterAuthConfig(options) {
  return {
    database: drizzleAdapter(databaseService.database, { provider: 'pg' }),
    secret: configService.get('AUTH_SECRET'),
    // ... other config
  };
}
```

## Installation & Setup

### 1. Add Auth Module to App

```typescript
// app.module.ts
@Module({
  imports: [
    AuthModule.forRootAsync(), // Global auth setup
    // ... other modules
  ],
})
export class AppModule {}
```

### 2. Environment Variables

Add these to your `.env`:

```bash
AUTH_SECRET=your-secret-key
AUTH_URL=http://localhost:3000
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
```

### 3. Apply Auth Guard Globally (Optional)

```typescript
// main.ts
app.useGlobalGuards(new AuthGuard(reflector, auth));
```

## Usage Examples

### Protecting Routes

```typescript
@Controller('api')
export class ApiController {
  // Protected route (default)
  @Get('protected')
  protected(@Request() req) {
    return { user: req.user };
  }
  
  // Public route
  @Public()
  @Get('public')
  public() {
    return { message: 'This is public' };
  }
}
```

### Using Auth Services

```typescript
@Injectable()
export class UserService {
  constructor(
    private readonly authService: AuthService,
    private readonly betterAuthService: BetterAuthService,
  ) {}
  
  async findUser(email: string) {
    return this.authService.findUserByEmail(email);
  }
  
  async getSession(headers: any) {
    return this.betterAuthService.api.getSession({ headers });
  }
}
```

## Available Routes

BetterAuth automatically provides these endpoints at `/api/auth/*`:

- `POST /api/auth/sign-up` - User registration
- `POST /api/auth/sign-in/email` - Email/password login  
- `POST /api/auth/sign-out` - Sign out
- `GET /api/auth/session` - Get current session
- OAuth routes for GitHub, etc.

## File Structure

```
auth/
├── auth.module.ts          # Main auth module
├── auth.service.ts         # Auth-related database operations
├── better-auth.service.ts  # BetterAuth API wrapper
├── auth.guard.ts           # Authentication guard
├── auth.type.ts           # Type definitions
├── decorators/
│   └── public.decorator.ts # Public route decorator
├── client.ts              # Legacy client (backward compatibility)
└── README.md              # This file
```

## Integration with Database Module

The auth module integrates seamlessly with your database module:

- Uses the same `DatabaseService` for consistent connections
- Migrations run automatically on startup
- Schema is defined in `database/auth-schema.ts`

This ensures your auth system and application database are always in sync. 
