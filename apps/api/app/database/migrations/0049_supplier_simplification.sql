--> Supplier simplification, expand step. Drizzle-kit generated the schema statements below; the
--> trigger drops and the data statements are the deliberate exception to "generate migrations, never
--> hand-author them": drizzle-kit cannot express either. The billing protections script, which runs
--> after every migration, no longer creates the two triggers, so an upgraded database drops them here.
DROP TRIGGER IF EXISTS "require_operation_holds" ON "billing"."credit_operation";--> statement-breakpoint
DROP TRIGGER IF EXISTS "protect_budget_hold" ON "billing"."billing_budget_hold";--> statement-breakpoint
DROP FUNCTION IF EXISTS "billing"."require_operation_holds"();--> statement-breakpoint
DROP FUNCTION IF EXISTS "billing"."protect_budget_hold"();--> statement-breakpoint
ALTER TABLE "billing"."billing_route_pause" DROP CONSTRAINT "billing_route_pause_environment_sku_pk";--> statement-breakpoint
ALTER TABLE "billing"."billing_route_pause" ALTER COLUMN "operation_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "billing"."credit_operation" ALTER COLUMN "spend_budget_hold_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "billing"."credit_operation" ALTER COLUMN "risk_budget_hold_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "billing"."credit_operation" ALTER COLUMN "supplier_state" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "billing"."credit_operation" ALTER COLUMN "supplier_state" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "billing"."billing_route_pause" ADD COLUMN "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL;--> statement-breakpoint
ALTER TABLE "billing"."billing_route_pause" ADD COLUMN "actor" text;--> statement-breakpoint
UPDATE "billing"."billing_route_pause" SET "actor" = 'automatic' WHERE "actor" IS NULL;--> statement-breakpoint
ALTER TABLE "billing"."billing_route_pause" ALTER COLUMN "actor" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "billing"."billing_route_pause" ADD COLUMN "resumed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing"."billing_route_pause" ADD COLUMN "resumed_by" text;--> statement-breakpoint
ALTER TABLE "billing"."billing_route_pause" ADD COLUMN "resume_reason" text;--> statement-breakpoint
ALTER TABLE "billing"."credit_operation" ADD COLUMN "supplier_cost_pico_usd" bigint;--> statement-breakpoint
ALTER TABLE "billing"."credit_operation" ADD COLUMN "supplier_cost_unpriced_reason" text;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_route_pause_active" ON "billing"."billing_route_pause" USING btree ("environment","sku") WHERE "billing"."billing_route_pause"."resumed_at" IS NULL;--> statement-breakpoint
ALTER TABLE "billing"."credit_operation" ADD CONSTRAINT "credit_operation_supplier_cost" CHECK (("billing"."credit_operation"."supplier_cost_pico_usd" IS NULL OR ("billing"."credit_operation"."supplier_cost_pico_usd" >= 0 AND "billing"."credit_operation"."supplier_cost_unpriced_reason" IS NULL)) AND ("billing"."credit_operation"."supplier_cost_unpriced_reason" IS NULL OR "billing"."credit_operation"."supplier_cost_unpriced_reason" IN ('missing_rate','dimension_mismatch','absorbed')) AND ("billing"."credit_operation"."customer_state" <> 'pending' OR ("billing"."credit_operation"."supplier_cost_pico_usd" IS NULL AND "billing"."credit_operation"."supplier_cost_unpriced_reason" IS NULL)));--> statement-breakpoint
--> Every existing pause was written automatically; none stays in force after deploy. The rows stay for the
--> legacy export, resolved rather than deleted.
UPDATE "billing"."billing_route_pause" SET "resumed_at" = now(), "resumed_by" = 'migration-0049', "resume_reason" = 'superseded_by_charter' WHERE "resumed_at" IS NULL;--> statement-breakpoint
--> Per-operation supplier cases, absorbed-recovery cases and residual supplier-hold findings are no longer
--> opened or resolved by anything: close the ones still open.
UPDATE "billing"."billing_financial_case" SET "state" = 'resolved', "resolved_at" = now(), "resolution_evidence" = '{"disposition":"superseded_by_charter","migration":"0049"}'::jsonb WHERE "state" IN ('open', 'attention') AND "kind" IN ('supplier_evidence_missing', 'supplier_evidence_mismatched', 'supplier_charge_unmatched', 'supplier_state_unresolved', 'llm_recovery_absorbed', 'journal_budget_residual');