CREATE TABLE "agent_run" (
	"run_id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"project_id" text,
	"owner_id" text NOT NULL,
	"placement" text NOT NULL,
	"state" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_run_state_check" CHECK ("agent_run"."state" IN ('admitted', 'running', 'awaiting-approval', 'completed', 'failed', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "agent_device" ADD COLUMN "cloud_project_id" text;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_placement_agent_device_id_fk" FOREIGN KEY ("placement") REFERENCES "public"."agent_device"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_run_placement_idx" ON "agent_run" USING btree ("placement","updated_at" desc);--> statement-breakpoint
CREATE INDEX "agent_run_owner_idx" ON "agent_run" USING btree ("owner_id","updated_at" desc);--> statement-breakpoint
CREATE UNIQUE INDEX "agent_device_cloud_project_idx" ON "agent_device" USING btree ("owner_id","cloud_project_id") WHERE "agent_device"."revoked_at" IS NULL;