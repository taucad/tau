CREATE TABLE "agent_evidence_outbox" (
	"receipt_id" text PRIMARY KEY NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"key_version" integer NOT NULL,
	"payload" text,
	"payload_bytes" integer NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_evidence_receipt" (
	"id" text PRIMARY KEY NOT NULL,
	"principal_id" text NOT NULL,
	"project_id" text NOT NULL,
	"source_key" text NOT NULL,
	"semantic_key" text NOT NULL,
	"projection_key" text NOT NULL,
	"source_digest" text NOT NULL,
	"projection_digest" text NOT NULL,
	"plane" text NOT NULL,
	"family" text NOT NULL,
	"lineage" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_evidence_source" (
	"principal_id" text NOT NULL,
	"project_id" text NOT NULL,
	"source_id" text NOT NULL,
	"digest" text NOT NULL,
	"protection" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_evidence_source_principal_id_project_id_source_id_pk" PRIMARY KEY("principal_id","project_id","source_id")
);
--> statement-breakpoint
ALTER TABLE "agent_evidence_outbox" ADD CONSTRAINT "agent_evidence_outbox_receipt_id_agent_evidence_receipt_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."agent_evidence_receipt"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_evidence_receipt" ADD CONSTRAINT "agent_evidence_receipt_principal_id_user_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_evidence_source" ADD CONSTRAINT "agent_evidence_source_principal_id_user_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_evidence_outbox_dispatch_idx" ON "agent_evidence_outbox" USING btree ("state","lease_expires_at");--> statement-breakpoint
CREATE INDEX "agent_evidence_outbox_expiry_idx" ON "agent_evidence_outbox" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_evidence_receipt_projection_idx" ON "agent_evidence_receipt" USING btree ("projection_key");--> statement-breakpoint
CREATE INDEX "agent_evidence_receipt_source_idx" ON "agent_evidence_receipt" USING btree ("source_key");--> statement-breakpoint
CREATE INDEX "agent_evidence_receipt_scope_idx" ON "agent_evidence_receipt" USING btree ("principal_id","project_id");--> statement-breakpoint
CREATE INDEX "agent_evidence_receipt_expiry_idx" ON "agent_evidence_receipt" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "agent_evidence_source_expiry_idx" ON "agent_evidence_source" USING btree ("expires_at");