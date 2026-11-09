CREATE TABLE "agent_evidence_erasure" (
	"id" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"subject_id" text NOT NULL,
	"admitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "agent_evidence_erasure_scope_check" CHECK ("agent_evidence_erasure"."scope" IN ('account', 'project'))
);
--> statement-breakpoint
CREATE TABLE "agent_evidence_erasure_trace" (
	"erasure_id" text NOT NULL,
	"trace_id" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_owner" text,
	"due_at" timestamp with time zone DEFAULT now() NOT NULL,
	"requested_at" timestamp with time zone,
	"reason" text,
	CONSTRAINT "agent_evidence_erasure_trace_erasure_id_trace_id_pk" PRIMARY KEY("erasure_id","trace_id"),
	CONSTRAINT "agent_evidence_erasure_trace_state_check" CHECK ("agent_evidence_erasure_trace"."state" IN ('pending', 'requested', 'absent'))
);
--> statement-breakpoint
ALTER TABLE "agent_evidence_erasure_trace" ADD CONSTRAINT "agent_evidence_erasure_trace_erasure_id_agent_evidence_erasure_id_fk" FOREIGN KEY ("erasure_id") REFERENCES "public"."agent_evidence_erasure"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_evidence_erasure_subject_idx" ON "agent_evidence_erasure" USING btree ("scope","subject_id");--> statement-breakpoint
CREATE INDEX "agent_evidence_erasure_trace_due_idx" ON "agent_evidence_erasure_trace" USING btree ("state","due_at");