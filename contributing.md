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

2. Start the infrastructure (PostgreSQL + Redis):

   ```bash
   pnpm infra:up
   ```

3. Create your environment file in UI and API:

   ```bash
   cp apps/ui/.env.example apps/ui/.env.local
   cp apps/api/.env.example apps/api/.env.local
   # Edit .env.local with your API keys
   ```

   Public GitHub import lists a repository's branches only when the API has `GITHUB_API_TOKEN`, a fine-grained personal access token with read-only access to public repositories (see `apps/api/.env.example`). It is optional locally. Without it, the import page says "This server isn’t set up to list branches, so import will use the `<branch>` branch. Its administrator can enable branch listing with GITHUB_API_TOKEN." The import then uses the branch the link names, or the repository's default branch, and archive downloads use GitHub's lower unauthenticated rate limit.

4. Start the development servers:

   ```bash
   pnpm dev
   ```

   That's it! You can now start developing.

### Infrastructure Commands

#### Docker Compose Commands

```bash
# Start all infrastructure (PostgreSQL + Redis)
pnpm infra:up

# Stop all infrastructure
pnpm infra:down

# Reset all infrastructure (destroys all data)
pnpm infra:reset

# View all logs
pnpm infra:logs

# View specific service logs
pnpm infra:logs:postgres
pnpm infra:logs:redis
```

Or, if you prefer to use Docker CLI directly:

```bash
# Start infrastructure
docker-compose -f infra/docker-compose.yml up -d

# Stop infrastructure
docker-compose -f infra/docker-compose.yml down

# View logs
docker-compose -f infra/docker-compose.yml logs -f
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
  - `erasableSyntaxOnly`: ensures that all Typescript code can be run on Node.js directly via type-stripping. The exception is NestJS apps, which require non-erasable syntax for dependency injection.
- `eslint.config.ts`
  - `@typescript-eslint/consistent-type-imports`: enforces separate type imports, supporting the Dependency Inversion Principle by making abstractions (types) explicit and separate from implementations.
  - `@typescript-eslint/explicit-member-accessibility`: requires explicit accessibility modifiers for class members, enforcing the Single Responsibility Principle by making class member responsibilities and boundaries explicit.
  - `@typescript-eslint/no-explicit-any`: prevents use of `any` type, enforcing the Liskov Substitution Principle by ensuring type safety and preventing unsafe substitutions.
  - `@typescript-eslint/explicit-module-boundary-types`: all `export`ed functions and `public` methods must have a return type, including React components for the sake of consistency (even though it may seem overly verbose). This enforces the Interface Segregation Principle by making return types intentional and well-defined, with the additional benefit of reducing load on the TypeScript compiler by avoiding module-level type inference.

### Production releases

Each application (UI, API, desktop) has its own bot-managed release pull request on `release/<app>`; merging one creates that application's `<app>@<version>` tag and GitHub Release, whose release build verifies it and deploys it to production. Merging a release pull request is therefore a production release: only the maintainer does it. Rollbacks go through [`.github/workflows/deploy-production.yml`](.github/workflows/deploy-production.yml) with an earlier `ui@` or `api@` tag; each deploys only that application. Do **not** push to the `release/*` branches.
