CREATE TABLE "paseo_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"label" text NOT NULL,
	"server_id" text NOT NULL,
	"relay_endpoint" text NOT NULL,
	"secret_ciphertext" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_connected_at" timestamp,
	"last_error" text,
	"revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "paseo_run_execution" (
	"run_id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"template_agent_id" text NOT NULL,
	"actual_agent_id" text,
	"continuation_of_run_id" text,
	"send_state" text DEFAULT 'pending' NOT NULL,
	"state" text DEFAULT 'preparing' NOT NULL,
	"cursor_epoch" text,
	"cursor_sequence" integer,
	"send_claimed_at" timestamp,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "paseo_run_execution_send_state_check" CHECK ("paseo_run_execution"."send_state" IN ('pending', 'sending', 'sent', 'approval')),
	CONSTRAINT "paseo_run_execution_state_check" CHECK ("paseo_run_execution"."state" IN ('preparing', 'running', 'waiting', 'completed', 'failed', 'cancelled')),
	CONSTRAINT "paseo_run_execution_cursor_check" CHECK (("paseo_run_execution"."cursor_epoch" IS NULL AND "paseo_run_execution"."cursor_sequence" IS NULL) OR ("paseo_run_execution"."cursor_epoch" IS NOT NULL AND "paseo_run_execution"."cursor_sequence" >= 0))
);
--> statement-breakpoint
ALTER TABLE "paseo_connection" ADD CONSTRAINT "paseo_connection_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paseo_run_execution" ADD CONSTRAINT "paseo_run_execution_run_id_chat_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."chat_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paseo_run_execution" ADD CONSTRAINT "paseo_run_execution_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paseo_run_execution" ADD CONSTRAINT "paseo_run_execution_connection_id_paseo_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."paseo_connection"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paseo_run_execution" ADD CONSTRAINT "paseo_run_execution_continuation_of_run_id_paseo_run_execution_run_id_fk" FOREIGN KEY ("continuation_of_run_id") REFERENCES "public"."paseo_run_execution"("run_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "paseo_connection_owner_server_idx" ON "paseo_connection" USING btree ("owner_id","server_id") WHERE "paseo_connection"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "paseo_connection_owner_idx" ON "paseo_connection" USING btree ("owner_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "paseo_run_execution_lineage_idx" ON "paseo_run_execution" USING btree ("owner_id","connection_id","template_agent_id","updated_at" desc);--> statement-breakpoint
CREATE INDEX "paseo_run_execution_actual_agent_idx" ON "paseo_run_execution" USING btree ("connection_id","actual_agent_id");