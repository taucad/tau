[![XO code style](https://shields.io/badge/code_style-5ed9c7?logo=xo&labelColor=gray&logoSize=auto)](https://github.com/xojs/xo)

# Tau

Your AI-powered workshop companion - a free, open-source CAD platform that works offline. Design anything from 3D prints to woodworking projects with intelligent assistance, right in your browser.

## Development

### Prerequisites

- Node.js 22+
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
   pnpm start
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
