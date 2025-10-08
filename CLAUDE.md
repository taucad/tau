# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

Tau is an AI-powered CAD platform built as a monorepo using Nx with the following architecture:

- **Frontend**: React Router v7 app with React 19, TypeScript, and Tailwind CSS
- **Backend**: NestJS API with Fastify, PostgreSQL database via Drizzle ORM
- **CAD Engine**: Integration with ReplicaD (OpenCASCADE) and KCL WASM
- **AI Integration**: LangGraph for agent orchestration, supporting multiple LLM providers (OpenAI, Anthropic, Ollama)
- **Package Manager**: pnpm with workspace configuration
- **Build System**: Nx monorepo with Vite for frontend and TypeScript compilation

### Key Applications
- `apps/ui` - Main web application built with React Router v7
- `apps/api` - NestJS backend API with authentication and database
- `apps/ui-e2e` - End-to-end tests for the UI
- `apps/api-e2e` - End-to-end tests for the API

### Libraries
- `libs/tau-examples` - Example CAD projects and templates
- `libs/api-extractor` - API analysis and extraction utilities

## Development Commands

```bash
# Development
pnpm dev                    # Start all development servers
pnpm start                  # Start production servers
pnpm build                  # Build all projects
pnpm test                   # Run all tests
pnpm lint                   # Lint all projects
pnpm typecheck              # Type check all projects

# Database (PostgreSQL via Docker)
pnpm db:up                  # Start database
pnpm db:down                # Stop database
pnpm db:reset               # Reset database (destroys data)
pnpm db:logs                # View database logs
pnpm db:generate            # Generate Drizzle migrations
pnpm db:migrate             # Run migrations
pnpm db:studio              # Open Drizzle Studio

# CI/Testing
pnpm ci:affected            # Run affected tests, builds, lint, typecheck
pnpm ci:all                 # Run all tests, builds, lint, typecheck

# Nx-specific commands
nx run <app>:<target>       # Run specific target for app
nx run-many -t <target>     # Run target for all projects
nx affected -t <target>     # Run target for affected projects only
```

## Code Style and Linting

This project uses extremely strict linting via XO + ESLint with the following key requirements:

### TypeScript Rules
- Use `import type` for type-only imports
- All exported functions must have explicit return types (including React components)
- Use `type` instead of `interface`
- Use `undefined` instead of `null`
- No `any` type - use `unknown` instead
- Always include `.js` extensions for local imports with `#` prefix

### Code Style
- Always use curly braces for control flow statements
- Explicit class member accessibility (`public`, `private`)
- Use absolute imports with `#` prefix (e.g., `#utils/helper.js`)
- Descriptive variable names (e.g., `properties` not `props`, `event` not `e`)
- Functional programming patterns preferred

## Testing

The project uses Vitest with separate configurations for UI (jsdom) and API (node) environments:

```bash
# Run specific project tests
nx test ui                  # UI tests
nx test api                 # API tests

# Single test file
nx test ui -- src/utils/test.spec.ts
```

## Environment Setup

1. Copy environment files:
   ```bash
   cp apps/ui/.env.example apps/ui/.env.local
   cp apps/api/.env.example apps/api/.env.local
   ```

2. Start database: `pnpm db:up`

3. Start development: `pnpm dev`

## AI Integration

The project includes sophisticated AI agent orchestration using:
- **LangGraph**: State machine-based agent workflows
- **Multiple LLM Support**: OpenAI, Anthropic, Google Vertex AI, Ollama
- **Vector Database**: pgvector for embeddings storage
- **Chat Interface**: Real-time WebSocket communication

## Database

Uses PostgreSQL with Drizzle ORM:
- Schema files in `apps/api/app/database/`
- Migrations auto-generated via `pnpm db:generate`
- Connection via connection pooling
- Authentication tables managed by Better Auth

## Key Technologies

- **Frontend**: React 19, React Router v7, Tailwind CSS, Radix UI
- **Backend**: NestJS, Fastify, Drizzle ORM, PostgreSQL
- **CAD**: ReplicaD, OpenCASCADE, KCL WASM, Three.js
- **AI**: LangChain, LangGraph, OpenAI SDK, Anthropic SDK
- **Development**: Nx, Vite, TypeScript, pnpm, Docker
- **Testing**: Vitest, Playwright, Testing Library
