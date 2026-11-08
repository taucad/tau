CREATE TABLE "billing"."billing_invocation_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"operation_id" text NOT NULL,
	"payload_digest" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_invocation_evidence_delivery" UNIQUE("operation_id","payload_digest"),
	CONSTRAINT "billing_invocation_evidence_bound" CHECK (octet_length("billing"."billing_invocation_evidence"."evidence"::text) <= 32768)
);
--> statement-breakpoint
ALTER TABLE "billing"."credit_operation" ADD COLUMN "cancellation_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing"."credit_operation" ADD COLUMN "invocation" jsonb;--> statement-breakpoint
ALTER TABLE "billing"."billing_invocation_evidence" ADD CONSTRAINT "billing_invocation_evidence_operation_id_credit_operation_id_fk" FOREIGN KEY ("operation_id") REFERENCES "billing"."credit_operation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_invocation_evidence_operation" ON "billing"."billing_invocation_evidence" USING btree ("operation_id","received_at","id");