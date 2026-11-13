# Auth Module

This module provides a NestJS-compatible authentication system using BetterAuth with Drizzle ORM integration.

## Overview

The auth module follows the pattern from the [Ultimate NestJS Boilerplate](https://github.com/niraj-khatiwada/ultimate-nestjs-boilerplate/tree/main/src/auth) but adapted for Drizzle instead of TypeORM.

## Architecture

- **AuthModule**: Main module with `forRootAsync()` for global auth setup
- **AuthService**: Handles auth-related database operations and utilities
- **BetterAuthService**: Named Better Auth calls that need request headers (`getAccessToken`), each with the session snapshot removed
- **SessionResolver**: The only caller of `getSession`; single-flight, read modes and the resolution counter
- **AuthGuard**: Global guard for protecting routes (REST, GraphQL, WebSocket)
- **Public Decorator**: Marks routes as publicly accessible

## Authentication Transports

Browser user agents continue to use Better Auth's HTTP-only session cookies. Non-browser user agents may sign in at `POST /v1/auth/sign-in/email`, read the `set-auth-token` response header, and send that session token as `Authorization: Bearer <token>` to guarded HTTP endpoints and Socket.IO handshakes.

Bearer session tokens are not a browser authentication mechanism; browser code stays on cookies. They are also not machine identity. Agents and host daemons obtain device credentials through `/v1/agents` pairing and use those credentials for machine-authenticated connections.

## Session resolution

`SessionResolver` is the only caller of Better Auth `getSession` for Tau routes and WebSocket upgrades, and `BetterAuthService` is the only other way Tau code reaches Better Auth with request headers. The Better Auth instance token is not exported. Design: Tau Brain `research/auth-session-cookie-blueprint.md`.

- **Read mode.** A `GET` or `HEAD` with no `Authorization` header is read in _cached_ mode: when `AUTH_SESSION_CACHE_MAX_AGE_SECONDS` is non-zero, a valid encrypted `session_data` snapshot answers it without a store read. Everything else is _authoritative_: any other method, any request with `Authorization` (empty or invalid included), WebSocket upgrades and routes marked `@AuthoritativeSession()`. Authoritative reads pass `disableCookieCache` and have the snapshot removed from the `Cookie` header. On `/v1/auth/*` only a cookie `GET get-session` keeps the snapshot. The mode is decided from the method, `Authorization` and the route marker only, never by parsing a cookie.
- **Only `user.id` from a cached read.** Other fields of `request.user` on a `GET` may be up to the cache's age old. Read anything else from the database by id.
- **A `GET` that mints a link or token needs `@AuthoritativeSession()`.** A signed URL, presigned download, HMAC or token outlives the request, so it must not be served from a session that may have been revoked. `apps/api/app/testing/authoritative-routes.test.ts` enforces this over the import graph.
- **Cookies.** A Tau route forwards at most one cookie: an unchunked `session_data` with exactly the configured `Max-Age`, or its expiry, and never to a request that carried `Authorization`. It never sets or clears `session_token`. With the flag at 0 it forwards nothing.
- **Single-flight.** Concurrent `GET`/`HEAD` lookups with the same credentials share one store read for at most 250 ms. Nothing is kept after a lookup settles.

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
    return await this.databaseService.database.select({ id: user.id }).from(user).where(eq(user.email, email));
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
    AuthExtensionsModule.forRoot(mode), // Binds the extension ports below (apps/api/app/composition)
    AuthModule.forRootAsync(mode), // Global auth setup
    // ... other modules
  ],
})
export class AppModule {}
```

Auth depends on neither billing nor hosts. What an account deletion and the auth routes are extended with comes
through the ports in `src/auth-extensions.ts`, which the app binds:

- `accountDeletionGateToken` (`AccountDeletionGate`): may refuse a deletion; billing's account closure in Tau Cloud.
- `accountDeletionHooksToken` (`AccountDeletionHook[]`): the rest of an accepted deletion, by stage around the storage
  tombstone (cloud hosts stop before it, agent evidence is erased after it).
- `authRouteExtensionsToken` (`AuthRouteExtension[]`): raw routes under the auth base path, registered ahead of the
  Better Auth wildcard (the byte-exact Stripe webhook in Tau Cloud).

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
- Schema is defined in `@taucad/api-database/schema` (`auth.schema.ts`); `src/auth-schema.generated.ts` is the Better Auth CLI's reference output

This ensures your auth system and application database are always in sync.
