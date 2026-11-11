--> Erasure trusts Langfuse's delete (charter I6 as amended, ruling 9). Drizzle-kit generated the check
--> statements; the data statement is the deliberate exception to "generate migrations, never hand-author
--> them": a trace whose delete was requested and is awaiting a read-back is settled as accepted.
ALTER TABLE "agent_evidence_erasure_trace" DROP CONSTRAINT "agent_evidence_erasure_trace_state_check";--> statement-breakpoint
UPDATE "agent_evidence_erasure_trace" SET "state" = 'accepted' WHERE "state" = 'requested';--> statement-breakpoint
ALTER TABLE "agent_evidence_erasure_trace" ADD CONSTRAINT "agent_evidence_erasure_trace_state_check" CHECK ("agent_evidence_erasure_trace"."state" IN ('pending', 'accepted', 'absent'));