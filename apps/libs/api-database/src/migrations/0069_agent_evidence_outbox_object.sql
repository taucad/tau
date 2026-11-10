ALTER TABLE "agent_evidence_outbox" ADD COLUMN "object_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_evidence_outbox_object_idx" ON "agent_evidence_outbox" USING btree ("object_id");