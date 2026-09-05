ALTER TABLE "chat_rpc_exchange" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chat_run" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chat_workspace_lease" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "paseo_run_execution" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "chat_rpc_exchange" CASCADE;--> statement-breakpoint
DROP TABLE "chat_run" CASCADE;--> statement-breakpoint
DROP TABLE "chat_workspace_lease" CASCADE;--> statement-breakpoint
DROP TABLE "paseo_run_execution" CASCADE;--> statement-breakpoint
ALTER TABLE "durable_stream" DROP CONSTRAINT "durable_stream_kind_check";--> statement-breakpoint
ALTER TABLE "paseo_connection" DROP COLUMN "last_connected_at";--> statement-breakpoint
ALTER TABLE "paseo_connection" DROP COLUMN "last_error";--> statement-breakpoint
-- Hand-added to the drizzle-kit diff: `chat_run` owned every `kind = 'chat-run'`
-- stream, and dropping the table leaves those streams (and, by the cascading
-- FK, their `durable_stream_event` rows) orphaned. They must go before the
-- tightened CHECK, or `ADD CONSTRAINT` fails validation on any database that
-- ever ran a chat turn.
DELETE FROM "durable_stream" WHERE "kind" = 'chat-run';--> statement-breakpoint
ALTER TABLE "durable_stream" ADD CONSTRAINT "durable_stream_kind_check" CHECK ("durable_stream"."kind" IN ('job', 'revision'));
