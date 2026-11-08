/**
 * Every Drizzle table of the API, one file per owning domain. The export
 * names are the ones `schema.ts` had, so `drizzle(client, { schema })` and
 * `drizzle-kit` see the identical object.
 */
export * from '#schema/auth.schema.js';
export * from '#schema/telemetry-purposes.schema.js';
export * from '#schema/agent-observability.schema.js';
export * from '#schema/storage.schema.js';
export * from '#schema/projects.schema.js';
export * from '#schema/git.schema.js';
export * from '#schema/publications.schema.js';
export * from '#schema/github.schema.js';
export * from '#schema/hosts.schema.js';
export * from '#schema/durable-events.schema.js';
export * from '#schema/jobs.schema.js';
export * from '#schema/billing.schema.js';
