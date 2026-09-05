CREATE TABLE "chat_run" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"chat_id" text NOT NULL,
	"project_id" text NOT NULL,
	"stream_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"definition_hash" text NOT NULL,
	"configuration" jsonb NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp,
	"cancel_requested_at" timestamp,
	CONSTRAINT "chat_run_state_check" CHECK ("chat_run"."state" IN ('queued', 'running', 'waiting', 'completed', 'failed', 'cancel_requested', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "durable_stream" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"kind" text NOT NULL,
	"subject_id" text NOT NULL,
	"next_sequence" integer DEFAULT 0 NOT NULL,
	"snapshot_sequence" integer DEFAULT 0 NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "durable_stream_kind_check" CHECK ("durable_stream"."kind" IN ('chat-run', 'job', 'revision')),
	CONSTRAINT "durable_stream_sequence_check" CHECK ("durable_stream"."snapshot_sequence" <= "durable_stream"."next_sequence")
);
--> statement-breakpoint
CREATE TABLE "durable_stream_event" (
	"stream_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"event_id" text NOT NULL,
	"attempt" integer,
	"type" text NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "durable_stream_event_stream_id_sequence_pk" PRIMARY KEY("stream_id","sequence"),
	CONSTRAINT "durable_stream_event_sequence_check" CHECK ("durable_stream_event"."sequence" > 0),
	CONSTRAINT "durable_stream_event_attempt_check" CHECK ("durable_stream_event"."attempt" IS NULL OR "durable_stream_event"."attempt" > 0)
);
--> statement-breakpoint
CREATE TABLE "job_artifact" (
	"id" text PRIMARY KEY NOT NULL,
	"attempt_id" text NOT NULL,
	"job_id" text NOT NULL,
	"attempt" integer NOT NULL,
	"role" text NOT NULL,
	"logical_path" text NOT NULL,
	"media_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"storage_ref" text NOT NULL,
	"provenance" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "job_artifact_size_check" CHECK ("job_artifact"."size_bytes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "job_attempt" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"attempt" integer NOT NULL,
	"runner_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"state" text NOT NULL,
	"lease_until" timestamp NOT NULL,
	"heartbeat_at" timestamp NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"terminal_reason" text,
	CONSTRAINT "job_attempt_number_check" CHECK ("job_attempt"."attempt" > 0),
	CONSTRAINT "job_attempt_state_check" CHECK ("job_attempt"."state" IN ('assigned', 'preparing', 'running', 'uploading', 'completed', 'failed', 'cancelled', 'lost'))
);
--> statement-breakpoint
CREATE TABLE "job_run" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"project_id" text NOT NULL,
	"stream_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"definition_hash" text NOT NULL,
	"definition" jsonb NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"current_attempt" integer DEFAULT 0 NOT NULL,
	"runner_id" text,
	"lease_until" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"cancel_requested_at" timestamp,
	"finished_at" timestamp,
	CONSTRAINT "job_run_state_check" CHECK ("job_run"."state" IN ('queued', 'assigned', 'preparing', 'running', 'waiting', 'uploading', 'completed', 'failed', 'cancel_requested', 'cancelled')),
	CONSTRAINT "job_run_attempt_check" CHECK ("job_run"."current_attempt" >= 0)
);
--> statement-breakpoint
CREATE TABLE "job_runner" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text,
	"capabilities" jsonb NOT NULL,
	"total_slots" integer NOT NULL,
	"used_slots" integer DEFAULT 0 NOT NULL,
	"last_heartbeat_at" timestamp NOT NULL,
	"draining_at" timestamp,
	"revoked_at" timestamp,
	CONSTRAINT "job_runner_total_slots_check" CHECK ("job_runner"."total_slots" > 0),
	CONSTRAINT "job_runner_used_slots_check" CHECK ("job_runner"."used_slots" >= 0 AND "job_runner"."used_slots" <= "job_runner"."total_slots")
);
--> statement-breakpoint
ALTER TABLE "chat_run" ADD CONSTRAINT "chat_run_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_run" ADD CONSTRAINT "chat_run_stream_id_durable_stream_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."durable_stream"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "durable_stream" ADD CONSTRAINT "durable_stream_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "durable_stream_event" ADD CONSTRAINT "durable_stream_event_stream_id_durable_stream_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."durable_stream"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_artifact" ADD CONSTRAINT "job_artifact_attempt_id_job_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."job_attempt"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_artifact" ADD CONSTRAINT "job_artifact_job_id_job_run_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_attempt" ADD CONSTRAINT "job_attempt_job_id_job_run_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_run" ADD CONSTRAINT "job_run_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_run" ADD CONSTRAINT "job_run_stream_id_durable_stream_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."durable_stream"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_runner" ADD CONSTRAINT "job_runner_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_run_stream_idx" ON "chat_run" USING btree ("stream_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_run_idempotency_idx" ON "chat_run" USING btree ("owner_id","chat_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_run_active_chat_idx" ON "chat_run" USING btree ("chat_id") WHERE "chat_run"."state" IN ('running', 'waiting', 'cancel_requested');--> statement-breakpoint
CREATE INDEX "chat_run_queue_idx" ON "chat_run" USING btree ("owner_id","chat_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "durable_stream_kind_subject_idx" ON "durable_stream" USING btree ("kind","subject_id");--> statement-breakpoint
CREATE INDEX "durable_stream_owner_updated_idx" ON "durable_stream" USING btree ("owner_id","updated_at" desc);--> statement-breakpoint
CREATE UNIQUE INDEX "durable_stream_event_id_idx" ON "durable_stream_event" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_artifact_path_idx" ON "job_artifact" USING btree ("job_id","logical_path");--> statement-breakpoint
CREATE INDEX "job_artifact_sha_idx" ON "job_artifact" USING btree ("sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "job_attempt_number_idx" ON "job_attempt" USING btree ("job_id","attempt");--> statement-breakpoint
CREATE INDEX "job_attempt_runner_idx" ON "job_attempt" USING btree ("runner_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "job_run_stream_idx" ON "job_run" USING btree ("stream_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_run_idempotency_idx" ON "job_run" USING btree ("owner_id","project_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "job_run_queue_idx" ON "job_run" USING btree ("state","created_at");--> statement-breakpoint
CREATE INDEX "job_run_runner_lease_idx" ON "job_run" USING btree ("runner_id","lease_until");--> statement-breakpoint
CREATE INDEX "job_runner_heartbeat_idx" ON "job_runner" USING btree ("last_heartbeat_at");