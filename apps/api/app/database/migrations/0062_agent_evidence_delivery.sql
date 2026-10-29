ALTER TABLE "agent_evidence_outbox" ADD COLUMN "trace_id" text;--> statement-breakpoint
ALTER TABLE "agent_evidence_outbox" ADD COLUMN "observed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent_evidence_outbox" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent_evidence_outbox" ADD COLUMN "reason" text;