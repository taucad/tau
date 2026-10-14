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

### Git hooks

`pnpm install` prepares the hooks in `tools/git-hooks/`. After updating an existing clone from the former `.husky/` layout, run `pnpm run prepare` once before committing. The pre-commit hook checks staged files; the commit-message hook validates the Conventional Commit scope. Linked worktrees share Git configuration, so update their checkouts together before switching the hook path.

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

### Linting and TypeScript

Run `pnpm nx lint <project>` for Oxlint followed by the remaining ESLint rules. Oxfmt owns formatting; its root configuration preserves byte-sensitive snapshots. The root quality configs retain native editor and Nx discovery.

Projects extend the shared compiler options in `tools/typescript/base.json`; the root `tsconfig.json` remains the tooling and solution entrypoint. See the [lint policy](../docs/policy/lint-policy.md) and [TypeScript policy](../docs/policy/typescript-policy.md) for the authoritative rules.

### Production releases

Each application (UI, API, desktop) has its own bot-managed release pull request on `release/<app>`; merging one creates that application's `<app>@<version>` tag and GitHub Release, whose release build verifies it and deploys it to production. Merging a release pull request is therefore a production release: only the maintainer does it. Rollbacks go through [`.github/workflows/deploy-production.yml`](workflows/deploy-production.yml) with an earlier `ui@` or `api@` tag; each deploys only that application. Do **not** push to the `release/*` branches.
