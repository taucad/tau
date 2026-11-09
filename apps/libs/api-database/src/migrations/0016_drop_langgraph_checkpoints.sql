-- W3-CUT: the API no longer runs a LangGraph agent. `CheckpointerService`
-- (PostgresSaver, schema `langgraph`) is deleted, so the four tables it created
-- with `setup()` — checkpoints, checkpoint_blobs, checkpoint_writes and its own
-- checkpoint_migrations bookkeeping — have no reader and no writer left.
-- These tables were never declared in `schema.ts` (PostgresSaver created them at
-- boot), so drizzle-kit cannot generate this drop: it is hand-written.
DROP SCHEMA IF EXISTS "langgraph" CASCADE;
