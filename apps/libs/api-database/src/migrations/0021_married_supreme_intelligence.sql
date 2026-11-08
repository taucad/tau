ALTER TABLE "billing"."credit_operation" ADD COLUMN "history_version" integer;--> statement-breakpoint
ALTER TABLE "billing"."credit_operation" ADD COLUMN "model_display_name" text;--> statement-breakpoint
ALTER TABLE "billing"."credit_operation" ADD COLUMN "provider_id" text;--> statement-breakpoint
ALTER TABLE "billing"."credit_operation" ADD COLUMN "project_hint" text;--> statement-breakpoint
ALTER TABLE "billing"."credit_operation" ADD COLUMN "chat_hint" text;--> statement-breakpoint
ALTER TABLE "billing"."credit_operation" ADD COLUMN "admitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing"."credit_operation" ADD COLUMN "dispatch_intent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing"."credit_operation" ADD COLUMN "evidence_occurred_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing"."credit_operation" ADD COLUMN "execution_status" text;--> statement-breakpoint
ALTER TABLE "billing"."credit_operation" ADD COLUMN "metering_status" text;--> statement-breakpoint
ALTER TABLE "billing"."credit_operation" ADD COLUMN "reasoning_tokens" numeric(78, 0);--> statement-breakpoint
ALTER TABLE "billing"."credit_operation" ADD COLUMN "normalization_evidence" jsonb;--> statement-breakpoint
CREATE INDEX "credit_operation_usage_page" ON "billing"."credit_operation" USING btree ("account_id","category","usage_occurred_at" desc,"terminal_revision" desc,"id" desc) WHERE "billing"."credit_operation"."terminal_revision" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "credit_transaction_corrections" ON "billing"."credit_transaction" USING btree ("account_id","correction_of","revision","id") WHERE "billing"."credit_transaction"."kind" = 'compensation';--> statement-breakpoint
ALTER TABLE "billing"."credit_operation" ADD CONSTRAINT "credit_operation_history" CHECK (("billing"."credit_operation"."history_version" IS NULL OR ("billing"."credit_operation"."history_version" = 1 AND "billing"."credit_operation"."admitted_at" IS NOT NULL)) AND ("billing"."credit_operation"."execution_status" IS NULL OR "billing"."credit_operation"."execution_status" IN ('succeeded','cancelled','failed','rejected','unknown')) AND ("billing"."credit_operation"."metering_status" IS NULL OR "billing"."credit_operation"."metering_status" IN ('complete','partial','unavailable')) AND ("billing"."credit_operation"."reasoning_tokens" IS NULL OR "billing"."credit_operation"."reasoning_tokens" >= 0));