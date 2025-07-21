[![XO code style](https://shields.io/badge/code_style-5ed9c7?logo=xo&labelColor=gray&logoSize=auto)](https://github.com/xojs/xo)

# Tau

Your AI-powered workshop companion - a free, open-source CAD platform that works offline. Design anything from 3D prints to woodworking projects with intelligent assistance, right in your browser.

## Development

### Prerequisites

- Node.js 24+
- pnpm
- Docker

### Setup

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Start the PostgreSQL database:
   ```bash
   pnpm db:up
   ```

3. Create your environment file in UI and API:
   ```bash
   cp apps/ui/.env.example apps/ui/.env.local
   cp apps/api/.env.example apps/api/.env.local
   # Edit .env.local with your API keys
   ```

4. Start the development servers:
   ```bash
   pnpm dev
   ```

   That's it! You can now start developing.

### Database Commands

#### Docker Compose Commands
```bash
# Start database
pnpm db:up

# Stop database
pnpm db:down

# Reset database (destroys all data)
pnpm db:reset

# View database logs
pnpm db:logs
```

Or, if you prefer to use Docker CLI directly:

```bash
# Start database
docker compose -f infra/docker-compose.db.yml up -d

# Stop database
docker compose -f infra/docker-compose.db.yml down

# View logs
docker compose -f infra/docker-compose.db.yml logs -f postgres
```


#### Drizzle Commands
```bash
# Generate migrations. This is required when making changes to the database schema. SQL files are generated in the apps/api/app/database/migrations directory.
pnpm db:generate

# Run migrations. This is a manual alternative to the application startup migrations.
pnpm db:migrate

# Open database studio. Useful for debugging database operations (a built-in alternative to pgAdmin)
pnpm db:studio
```

### Linting

This project uses ESLint for linting. The linting configuration is intentionally very strict, this has the following benefits:

- Open-source contributions must all adhere to the same code style.
- AI Copilots have guardrails to ensure code is consistent.

Here are some specific rules to be aware of, and why they are important:
- `tsconfig.json`
  - `strict`: required by libraries such as `zod`, enforcing TypeScript best practices.
  - `erasableSyntaxOnly`: ensures that all Typescript code can be run on Node.js directly via type-stripping. The exception is NestJS apps, which require non-erasble syntax for dependency injection.
- `eslint.config.ts`
  - `@typescript-eslint/consistent-type-imports`: enforces separate type imports, supporting the Dependency Inversion Principle by making abstractions (types) explicit and separate from implementations.
  - `@typescript-eslint/explicit-member-accessibility`: requires explicit accessibility modifiers for class members, enforcing the Single Responsibility Principle by making class member responsibilities and boundaries explicit.
  - `@typescript-eslint/no-explicit-any`: prevents use of `any` type, enforcing the Liskov Substitution Principle by ensuring type safety and preventing unsafe substitutions.
  - `@typescript-eslint/explicit-module-boundary-types`: all `export`ed functions and `public` methods must have a return type, including React components for the sake of consistency (even though it may seem overly verbose). This enforces the Interface Segregation Principle by making return types intentional and well-defined, with the additional benefit of reducing load on the TypeScript compiler by avoiding module-level type inference.
