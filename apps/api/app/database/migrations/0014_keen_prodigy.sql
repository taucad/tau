ALTER TABLE "chat_run" ADD COLUMN "executor_id" text;--> statement-breakpoint
ALTER TABLE "chat_run" ADD COLUMN "executor_heartbeat_at" timestamp;--> statement-breakpoint
UPDATE "chat_run" SET "executor_heartbeat_at" = now() WHERE "state" IN ('running', 'cancel_requested');--> statement-breakpoint
CREATE INDEX "chat_run_executor_heartbeat_idx" ON "chat_run" USING btree ("state","executor_heartbeat_at");
