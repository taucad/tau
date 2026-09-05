CREATE TABLE "chat_rpc_exchange" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"lease_epoch" integer NOT NULL,
	"rpc_name" text NOT NULL,
	"tool_call_id" text NOT NULL,
	"request" jsonb NOT NULL,
	"response" jsonb,
	"state" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp,
	CONSTRAINT "chat_rpc_exchange_epoch_check" CHECK ("chat_rpc_exchange"."lease_epoch" > 0),
	CONSTRAINT "chat_rpc_exchange_state_check" CHECK ("chat_rpc_exchange"."state" IN ('pending', 'executing', 'completed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "chat_workspace_lease" (
	"run_id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"project_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"base_revision_id" text NOT NULL,
	"preferred_host_id" text NOT NULL,
	"host_id" text,
	"epoch" integer DEFAULT 0 NOT NULL,
	"lease_until" timestamp,
	"heartbeat_at" timestamp,
	"released_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chat_workspace_lease_epoch_check" CHECK ("chat_workspace_lease"."epoch" >= 0)
);
--> statement-breakpoint
DROP INDEX "chat_run_active_chat_idx";--> statement-breakpoint
ALTER TABLE "chat_run" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "chat_run" ADD COLUMN "base_revision_id" text;--> statement-breakpoint
ALTER TABLE "chat_run" ADD COLUMN "preferred_host_id" text;--> statement-breakpoint
UPDATE "chat_run"
SET
	"workspace_id" = COALESCE("configuration" #>> '{execution,workspaceId}', 'legacy_workspace_' || "id"),
	"base_revision_id" = COALESCE("configuration" #>> '{execution,baseRevisionId}', 'legacy_revision_' || "id"),
	"preferred_host_id" = COALESCE("configuration" #>> '{execution,hostId}', 'legacy_host');--> statement-breakpoint
ALTER TABLE "chat_run" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_run" ALTER COLUMN "base_revision_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_run" ALTER COLUMN "preferred_host_id" SET NOT NULL;--> statement-breakpoint
INSERT INTO "chat_workspace_lease" (
	"run_id",
	"owner_id",
	"project_id",
	"workspace_id",
	"base_revision_id",
	"preferred_host_id"
)
SELECT
	"id",
	"owner_id",
	"project_id",
	"workspace_id",
	"base_revision_id",
	"preferred_host_id"
FROM "chat_run"
WHERE "state" IN ('queued', 'running', 'waiting', 'cancel_requested')
ON CONFLICT ("run_id") DO NOTHING;--> statement-breakpoint
ALTER TABLE "chat_rpc_exchange" ADD CONSTRAINT "chat_rpc_exchange_run_id_chat_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."chat_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_workspace_lease" ADD CONSTRAINT "chat_workspace_lease_run_id_chat_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."chat_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_workspace_lease" ADD CONSTRAINT "chat_workspace_lease_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_rpc_exchange_pending_idx" ON "chat_rpc_exchange" USING btree ("run_id","state","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_workspace_lease_workspace_idx" ON "chat_workspace_lease" USING btree ("owner_id","workspace_id");--> statement-breakpoint
CREATE INDEX "chat_workspace_lease_expiry_idx" ON "chat_workspace_lease" USING btree ("lease_until");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_run_active_chat_idx" ON "chat_run" USING btree ("owner_id","chat_id") WHERE "chat_run"."state" IN ('running', 'waiting', 'cancel_requested');
