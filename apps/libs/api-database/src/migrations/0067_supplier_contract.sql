--> Supplier simplification, contract step (charter D7, W7b; go-live row BIL-23). Drizzle-kit generated the column,
--> constraint and table drops below from schema.ts; the guard and the NOT VALID exception CHECK are hand-written,
--> as 0049's trigger drops were, because drizzle-kit cannot express them. The billing protections script, which
--> runs after every migration, stops granting on and triggering the dropped objects in the same change.
--> Kept on purpose: billing_budget and billing_budget_funding (the promotion_issuance cap, charter IC3 and T-P2),
--> credit_attempt_void, the credit_operation_dispatch and credit_operation_supplier_cost CHECKs, and
--> credit_operation.supplier_cost_pico_usd / supplier_cost_unpriced_reason (terminal-receipt supplier cost).

--> Guard: refuse to drop supplier rows the legacy export has not removed. `billing-command export-supplier-legacy
--> --delete`, run from an API image that predates this migration, removes every spend/risk budget, its funding and
--> its holds in one transaction. Development databases carry the same rows from the retired development budgets;
--> run the export there too, or start from a fresh database.
DO $$ BEGIN
  IF EXISTS (SELECT FROM "billing"."billing_budget_hold") THEN
    RAISE EXCEPTION '0067 requires export-supplier-legacy --delete first: billing_budget_hold still has rows';
  END IF;
  IF EXISTS (SELECT FROM "billing"."billing_budget" WHERE "kind" IN ('spend', 'risk')) THEN
    RAISE EXCEPTION '0067 requires export-supplier-legacy --delete first: spend/risk budgets remain';
  END IF;
END $$;--> statement-breakpoint

--> Retired tables, dropped whole after their rows were exported (charter D7). Their indexes, CHECKs, foreign keys to
--> billing_budget and credit_operation, and supplier_cost_evidence's immutable_billing_fact trigger go with them.
--> No CASCADE: nothing else depends on either table, and an unexpected dependent should fail the migration.
DROP TABLE "billing"."billing_budget_hold";--> statement-breakpoint
DROP TABLE "billing"."supplier_cost_evidence";--> statement-breakpoint

--> credit_operation: the supplier finality state and the two supplier hold ids are no longer written or read
--> (0049 made them nullable). credit_operation_states also guards category, dispatch_state, customer_state and
--> generation, so it is dropped explicitly and re-added without the supplier clause. Every existing row satisfies
--> the narrower CHECK. Drizzle's migrator applies pending migrations in one transaction, so the ACCESS EXCLUSIVE
--> lock taken by DROP COLUMN is held to commit either way and the CHECK is added validated.
ALTER TABLE "billing"."credit_operation" DROP CONSTRAINT "credit_operation_states";--> statement-breakpoint
ALTER TABLE "billing"."credit_operation" DROP COLUMN "spend_budget_hold_id";--> statement-breakpoint
ALTER TABLE "billing"."credit_operation" DROP COLUMN "risk_budget_hold_id";--> statement-breakpoint
ALTER TABLE "billing"."credit_operation" DROP COLUMN "supplier_state";--> statement-breakpoint
ALTER TABLE "billing"."credit_operation" ADD CONSTRAINT "credit_operation_states" CHECK ("billing"."credit_operation"."category" IN ('llm','zoo_engine') AND "billing"."credit_operation"."dispatch_state" IN ('admitted','intent_recorded','accepted','recovery_required') AND "billing"."credit_operation"."customer_state" IN ('pending','settled','released','absorbed') AND "billing"."credit_operation"."generation" > 0);--> statement-breakpoint

--> billing_operation_exception is an immutable-fact table: historical supplier_bound rows cannot be edited or
--> deleted. The CHECK loses the supplier_bound branch for new rows only (NOT VALID), and is never validated.
ALTER TABLE "billing"."billing_operation_exception" DROP CONSTRAINT "billing_operation_exception_kind";--> statement-breakpoint
ALTER TABLE "billing"."billing_operation_exception" ADD CONSTRAINT "billing_operation_exception_kind" CHECK (("billing"."billing_operation_exception"."kind" = 'customer_bound' AND "billing"."billing_operation_exception"."quantum" = 'credit_atoms') OR ("billing"."billing_operation_exception"."kind" = 'input_bound' AND "billing"."billing_operation_exception"."quantum" = 'input_tokens')) NOT VALID;
