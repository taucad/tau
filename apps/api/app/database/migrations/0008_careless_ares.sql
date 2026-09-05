CREATE TABLE "job_dispatch_outbox" (
	"job_id" text PRIMARY KEY NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp DEFAULT now() NOT NULL,
	"claimed_until" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "job_dispatch_outbox_attempts_check" CHECK ("job_dispatch_outbox"."attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "job_run" ADD COLUMN "orchestrator_run_id" text;--> statement-breakpoint
ALTER TABLE "job_dispatch_outbox" ADD CONSTRAINT "job_dispatch_outbox_job_id_job_run_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_dispatch_outbox_ready_idx" ON "job_dispatch_outbox" USING btree ("available_at","claimed_until");--> statement-breakpoint
CREATE UNIQUE INDEX "job_run_orchestrator_idx" ON "job_run" USING btree ("orchestrator_run_id");