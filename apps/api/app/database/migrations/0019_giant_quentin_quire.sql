CREATE SCHEMA "billing";
--> statement-breakpoint
CREATE TABLE "billing"."billing_budget" (
	"id" text PRIMARY KEY NOT NULL,
	"environment" text NOT NULL,
	"funding_id" text NOT NULL,
	"kind" text NOT NULL,
	"scope" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"quantum" text NOT NULL,
	"approved_cap" numeric(78, 0) NOT NULL,
	"consumed" numeric(78, 0) DEFAULT 0 NOT NULL,
	"held" numeric(78, 0) DEFAULT 0 NOT NULL,
	"generation" bigint DEFAULT 1 NOT NULL,
	CONSTRAINT "billing_budget_environment_id" UNIQUE("environment","id"),
	CONSTRAINT "billing_budget_cap" CHECK ("billing"."billing_budget"."approved_cap" >= 0 AND "billing"."billing_budget"."consumed" >= 0 AND "billing"."billing_budget"."held" >= 0 AND "billing"."billing_budget"."consumed" + "billing"."billing_budget"."held" <= "billing"."billing_budget"."approved_cap"),
	CONSTRAINT "billing_budget_period_order" CHECK ("billing"."billing_budget"."period_end" > "billing"."billing_budget"."period_start" AND "billing"."billing_budget"."generation" > 0)
);
--> statement-breakpoint
CREATE TABLE "billing"."billing_budget_funding" (
	"id" text PRIMARY KEY NOT NULL,
	"environment" text NOT NULL,
	"kind" text NOT NULL,
	"scope" text NOT NULL,
	"funded_lifetime" numeric(78, 0) NOT NULL,
	"consumed" numeric(78, 0) DEFAULT 0 NOT NULL,
	"held" numeric(78, 0) DEFAULT 0 NOT NULL,
	CONSTRAINT "billing_funding_environment_id" UNIQUE("environment","id"),
	CONSTRAINT "billing_funding_scope_id" UNIQUE("environment","id","kind","scope"),
	CONSTRAINT "billing_funding_cap" CHECK ("billing"."billing_budget_funding"."funded_lifetime" >= 0 AND "billing"."billing_budget_funding"."consumed" >= 0 AND "billing"."billing_budget_funding"."held" >= 0 AND "billing"."billing_budget_funding"."consumed" + "billing"."billing_budget_funding"."held" <= "billing"."billing_budget_funding"."funded_lifetime")
);
--> statement-breakpoint
CREATE TABLE "billing"."billing_budget_hold" (
	"id" text PRIMARY KEY NOT NULL,
	"budget_id" text NOT NULL,
	"operation_id" text NOT NULL,
	"initial_bound" numeric(78, 0) NOT NULL,
	"remaining_held" numeric(78, 0) NOT NULL,
	"consumed" numeric(78, 0) DEFAULT 0 NOT NULL,
	"finality_state" text DEFAULT 'reserved' NOT NULL,
	CONSTRAINT "billing_hold_bound" CHECK ("billing"."billing_budget_hold"."initial_bound" >= 0 AND "billing"."billing_budget_hold"."remaining_held" >= 0 AND "billing"."billing_budget_hold"."consumed" >= 0 AND "billing"."billing_budget_hold"."remaining_held" + "billing"."billing_budget_hold"."consumed" <= "billing"."billing_budget_hold"."initial_bound")
);
--> statement-breakpoint
CREATE TABLE "billing"."billing_owner_binding" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"environment" text NOT NULL,
	"auth_user_id" text,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "billing"."billing_period" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"source_identity" text NOT NULL,
	"credit_atoms" bigint NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	CONSTRAINT "billing_period_source_identity_unique" UNIQUE("source_identity"),
	CONSTRAINT "billing_period_account_id" UNIQUE("account_id","id"),
	CONSTRAINT "billing_period_range" CHECK ("billing"."billing_period"."credit_atoms" > 0 AND "billing"."billing_period"."period_end" > "billing"."billing_period"."period_start")
);
--> statement-breakpoint
CREATE TABLE "billing"."billing_policy" (
	"id" text PRIMARY KEY NOT NULL,
	"environment" text NOT NULL,
	"policy_version" text NOT NULL,
	"schema_version" integer NOT NULL,
	"content_hash" text NOT NULL,
	"canonical_content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_policy_environment_id" UNIQUE("environment","id"),
	CONSTRAINT "billing_policy_schema" CHECK ("billing"."billing_policy"."schema_version" = 1)
);
--> statement-breakpoint
CREATE TABLE "billing"."billing_policy_activation" (
	"id" text PRIMARY KEY NOT NULL,
	"environment" text NOT NULL,
	"policy_id" text NOT NULL,
	"job_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"expected_predecessor_activation_id" text,
	"announced_at" timestamp with time zone NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_activation_environment_id" UNIQUE("environment","id"),
	CONSTRAINT "billing_activation_policy_id" UNIQUE("environment","id","policy_id"),
	CONSTRAINT "billing_activation_time" CHECK ("billing"."billing_policy_activation"."effective_at" >= "billing"."billing_policy_activation"."announced_at")
);
--> statement-breakpoint
CREATE TABLE "billing"."billing_policy_activation_cancellation" (
	"environment" text NOT NULL,
	"activation_id" text PRIMARY KEY NOT NULL,
	"job_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"cancelled_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing"."billing_policy_head" (
	"environment" text PRIMARY KEY NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	"current_activation_id" text,
	"pending_activation_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_head_revision" CHECK ("billing"."billing_policy_head"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "billing"."billing_promotion_issuance" (
	"id" text PRIMARY KEY NOT NULL,
	"environment" text NOT NULL,
	"account_id" text NOT NULL,
	"promotion_program_id" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"budget_id" text NOT NULL,
	"atoms" bigint NOT NULL,
	CONSTRAINT "billing_promotion_account_id" UNIQUE("account_id","id"),
	CONSTRAINT "billing_promotion_amount" CHECK ("billing"."billing_promotion_issuance"."atoms" > 0 AND "billing"."billing_promotion_issuance"."period_end" > "billing"."billing_promotion_issuance"."period_start")
);
--> statement-breakpoint
CREATE TABLE "billing"."billing_purchase" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"source_identity" text NOT NULL,
	"offer_snapshot" jsonb NOT NULL,
	"credit_atoms" bigint NOT NULL,
	"state" text NOT NULL,
	CONSTRAINT "billing_purchase_source_identity_unique" UNIQUE("source_identity"),
	CONSTRAINT "billing_purchase_account_id" UNIQUE("account_id","id"),
	CONSTRAINT "billing_purchase_atoms" CHECK ("billing"."billing_purchase"."credit_atoms" > 0)
);
--> statement-breakpoint
CREATE TABLE "billing"."billing_reversal_case" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"purchase_id" text,
	"period_id" text,
	"original_atoms" bigint NOT NULL,
	"source" text NOT NULL,
	"net_applied_atoms" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "billing_reversal_account_id" UNIQUE("account_id","id"),
	CONSTRAINT "billing_reversal_bounds" CHECK ("billing"."billing_reversal_case"."original_atoms" > 0 AND "billing"."billing_reversal_case"."net_applied_atoms" BETWEEN 0 AND "billing"."billing_reversal_case"."original_atoms" AND num_nonnulls("billing"."billing_reversal_case"."purchase_id", "billing"."billing_reversal_case"."period_id") = 1 AND "billing"."billing_reversal_case"."source" IN ('plan','purchased'))
);
--> statement-breakpoint
CREATE TABLE "billing"."billing_route_pause" (
	"environment" text NOT NULL,
	"sku" text NOT NULL,
	"operation_id" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_route_pause_environment_sku_pk" PRIMARY KEY("environment","sku")
);
--> statement-breakpoint
CREATE TABLE "billing"."credit_account" (
	"id" text PRIMARY KEY NOT NULL,
	"environment" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"promo_atoms" bigint DEFAULT 0 NOT NULL,
	"plan_atoms" bigint DEFAULT 0 NOT NULL,
	"purchased_atoms" bigint DEFAULT 0 NOT NULL,
	"debt_atoms" bigint DEFAULT 0 NOT NULL,
	"promo_held_atoms" bigint DEFAULT 0 NOT NULL,
	"plan_held_atoms" bigint DEFAULT 0 NOT NULL,
	"purchased_held_atoms" bigint DEFAULT 0 NOT NULL,
	"pending_issuance_atoms" bigint DEFAULT 0 NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "credit_account_environment_id" UNIQUE("environment","id"),
	CONSTRAINT "credit_account_environment" CHECK ("billing"."credit_account"."environment" IN ('development','staging','prod-us','prod-eu')),
	CONSTRAINT "credit_account_status" CHECK ("billing"."credit_account"."status" IN ('open','closing','closed','restricted')),
	CONSTRAINT "credit_account_sources" CHECK ("billing"."credit_account"."promo_atoms" >= 0 AND "billing"."credit_account"."plan_atoms" >= 0 AND "billing"."credit_account"."purchased_atoms" >= 0 AND "billing"."credit_account"."debt_atoms" >= 0 AND "billing"."credit_account"."pending_issuance_atoms" >= 0 AND "billing"."credit_account"."revision" >= 0),
	CONSTRAINT "credit_account_holds" CHECK ("billing"."credit_account"."promo_held_atoms" BETWEEN 0 AND "billing"."credit_account"."promo_atoms" AND "billing"."credit_account"."plan_held_atoms" BETWEEN 0 AND "billing"."credit_account"."plan_atoms" AND "billing"."credit_account"."purchased_held_atoms" BETWEEN 0 AND "billing"."credit_account"."purchased_atoms"),
	CONSTRAINT "credit_account_headroom" CHECK ("billing"."credit_account"."promo_atoms"::numeric + "billing"."credit_account"."plan_atoms" + "billing"."credit_account"."purchased_atoms" + "billing"."credit_account"."pending_issuance_atoms" <= 9223372036854775807)
);
--> statement-breakpoint
CREATE TABLE "billing"."credit_operation" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"environment" text NOT NULL,
	"surface" text NOT NULL,
	"attempt_key" text NOT NULL,
	"request_digest" text NOT NULL,
	"request_key_version" integer NOT NULL,
	"category" text NOT NULL,
	"model_id" text NOT NULL,
	"sku" text NOT NULL,
	"pinned_tariff" jsonb NOT NULL,
	"maximum_quantities" jsonb NOT NULL,
	"activity" text NOT NULL,
	"policy_id" text NOT NULL,
	"activation_id" text NOT NULL,
	"meter_contract_id" text NOT NULL,
	"authorized_atoms" bigint NOT NULL,
	"promo_held_atoms" bigint NOT NULL,
	"plan_held_atoms" bigint NOT NULL,
	"purchased_held_atoms" bigint NOT NULL,
	"spend_budget_hold_id" text NOT NULL,
	"risk_budget_hold_id" text NOT NULL,
	"dispatch_state" text DEFAULT 'admitted' NOT NULL,
	"customer_state" text DEFAULT 'pending' NOT NULL,
	"supplier_state" text DEFAULT 'reserved' NOT NULL,
	"generation" bigint DEFAULT 1 NOT NULL,
	"lease_until" timestamp with time zone,
	"due_at" timestamp with time zone NOT NULL,
	"usage_occurred_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"terminal_revision" bigint,
	"base_transaction_id" text,
	"charged_atoms" bigint,
	"actual_retail_atoms" numeric(78, 0),
	"meter_items" jsonb,
	"input_tokens" bigint,
	"output_tokens" bigint,
	CONSTRAINT "credit_operation_account_id" UNIQUE("account_id","id"),
	CONSTRAINT "credit_operation_environment_id" UNIQUE("environment","id"),
	CONSTRAINT "credit_operation_amounts" CHECK ("billing"."credit_operation"."authorized_atoms" >= 0 AND "billing"."credit_operation"."promo_held_atoms" >= 0 AND "billing"."credit_operation"."plan_held_atoms" >= 0 AND "billing"."credit_operation"."purchased_held_atoms" >= 0 AND "billing"."credit_operation"."promo_held_atoms"::numeric + "billing"."credit_operation"."plan_held_atoms" + "billing"."credit_operation"."purchased_held_atoms" = "billing"."credit_operation"."authorized_atoms"),
	CONSTRAINT "credit_operation_states" CHECK ("billing"."credit_operation"."category" IN ('llm','zoo_engine') AND "billing"."credit_operation"."dispatch_state" IN ('admitted','intent_recorded','accepted','recovery_required') AND "billing"."credit_operation"."customer_state" IN ('pending','settled','released','absorbed') AND "billing"."credit_operation"."supplier_state" IN ('reserved','preliminary','unresolved','final','funded_exception') AND "billing"."credit_operation"."generation" > 0),
	CONSTRAINT "credit_operation_terminal" CHECK (("billing"."credit_operation"."customer_state" = 'pending' AND "billing"."credit_operation"."base_transaction_id" IS NULL AND "billing"."credit_operation"."terminal_revision" IS NULL AND "billing"."credit_operation"."resolved_at" IS NULL AND "billing"."credit_operation"."charged_atoms" IS NULL) OR ("billing"."credit_operation"."customer_state" <> 'pending' AND "billing"."credit_operation"."base_transaction_id" IS NOT NULL AND "billing"."credit_operation"."terminal_revision" IS NOT NULL AND "billing"."credit_operation"."terminal_revision" > 0 AND "billing"."credit_operation"."resolved_at" IS NOT NULL AND "billing"."credit_operation"."charged_atoms" IS NOT NULL AND "billing"."credit_operation"."charged_atoms" BETWEEN 0 AND "billing"."credit_operation"."authorized_atoms"))
);
--> statement-breakpoint
CREATE TABLE "billing"."credit_transaction" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"revision" bigint NOT NULL,
	"kind" text NOT NULL,
	"operation_id" text,
	"purchase_id" text,
	"period_id" text,
	"reversal_case_id" text,
	"promotion_issuance_id" text,
	"correction_of" text,
	"promo_delta_atoms" bigint NOT NULL,
	"plan_delta_atoms" bigint NOT NULL,
	"purchased_delta_atoms" bigint NOT NULL,
	"debt_delta_atoms" bigint NOT NULL,
	"account_delta_atoms" bigint NOT NULL,
	"balance_after_atoms" bigint NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	CONSTRAINT "credit_transaction_operation_id" UNIQUE("account_id","operation_id","id"),
	CONSTRAINT "credit_transaction_account_id" UNIQUE("account_id","id"),
	CONSTRAINT "credit_transaction_sum" CHECK ("billing"."credit_transaction"."account_delta_atoms"::numeric = "billing"."credit_transaction"."promo_delta_atoms"::numeric + "billing"."credit_transaction"."plan_delta_atoms" + "billing"."credit_transaction"."purchased_delta_atoms" - "billing"."credit_transaction"."debt_delta_atoms" AND "billing"."credit_transaction"."revision" > 0),
	CONSTRAINT "credit_transaction_cause" CHECK (("billing"."credit_transaction"."kind" = 'operation_resolution' AND "billing"."credit_transaction"."operation_id" IS NOT NULL AND num_nonnulls("billing"."credit_transaction"."purchase_id","billing"."credit_transaction"."period_id","billing"."credit_transaction"."reversal_case_id","billing"."credit_transaction"."promotion_issuance_id","billing"."credit_transaction"."correction_of") = 0) OR ("billing"."credit_transaction"."kind" = 'purchase_grant' AND "billing"."credit_transaction"."purchase_id" IS NOT NULL AND num_nonnulls("billing"."credit_transaction"."operation_id","billing"."credit_transaction"."period_id","billing"."credit_transaction"."reversal_case_id","billing"."credit_transaction"."promotion_issuance_id","billing"."credit_transaction"."correction_of") = 0) OR ("billing"."credit_transaction"."kind" = 'period_grant' AND "billing"."credit_transaction"."period_id" IS NOT NULL AND num_nonnulls("billing"."credit_transaction"."operation_id","billing"."credit_transaction"."purchase_id","billing"."credit_transaction"."reversal_case_id","billing"."credit_transaction"."promotion_issuance_id","billing"."credit_transaction"."correction_of") = 0) OR ("billing"."credit_transaction"."kind" = 'promotion_grant' AND "billing"."credit_transaction"."promotion_issuance_id" IS NOT NULL AND num_nonnulls("billing"."credit_transaction"."operation_id","billing"."credit_transaction"."purchase_id","billing"."credit_transaction"."period_id","billing"."credit_transaction"."reversal_case_id","billing"."credit_transaction"."correction_of") = 0) OR ("billing"."credit_transaction"."kind" = 'reversal' AND "billing"."credit_transaction"."reversal_case_id" IS NOT NULL AND num_nonnulls("billing"."credit_transaction"."operation_id","billing"."credit_transaction"."purchase_id","billing"."credit_transaction"."period_id","billing"."credit_transaction"."promotion_issuance_id","billing"."credit_transaction"."correction_of") = 0) OR ("billing"."credit_transaction"."kind" = 'compensation' AND "billing"."credit_transaction"."correction_of" IS NOT NULL AND num_nonnulls("billing"."credit_transaction"."purchase_id","billing"."credit_transaction"."period_id","billing"."credit_transaction"."reversal_case_id","billing"."credit_transaction"."promotion_issuance_id") = 0))
);
--> statement-breakpoint
CREATE TABLE "billing"."supplier_cost_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"operation_id" text,
	"environment" text NOT NULL,
	"provider" text NOT NULL,
	"credential_account" text NOT NULL,
	"source_object_id" text NOT NULL,
	"source_revision" text NOT NULL,
	"payload_digest" text NOT NULL,
	"numerator" numeric(78, 0) NOT NULL,
	"denominator" numeric(78, 0) NOT NULL,
	"currency" text NOT NULL,
	"completeness" text NOT NULL,
	"finality" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	CONSTRAINT "supplier_evidence_values" CHECK ("billing"."supplier_cost_evidence"."numerator" >= 0 AND "billing"."supplier_cost_evidence"."denominator" > 0 AND "billing"."supplier_cost_evidence"."completeness" IN ('partial','complete') AND "billing"."supplier_cost_evidence"."finality" IN ('preliminary','final'))
);
--> statement-breakpoint
ALTER TABLE "billing"."billing_budget" ADD CONSTRAINT "billing_budget_environment_funding_id_kind_scope_billing_budget_funding_environment_id_kind_scope_fk" FOREIGN KEY ("environment","funding_id","kind","scope") REFERENCES "billing"."billing_budget_funding"("environment","id","kind","scope") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_budget_hold" ADD CONSTRAINT "billing_budget_hold_budget_id_billing_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "billing"."billing_budget"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_budget_hold" ADD CONSTRAINT "billing_budget_hold_operation_id_credit_operation_id_fk" FOREIGN KEY ("operation_id") REFERENCES "billing"."credit_operation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_owner_binding" ADD CONSTRAINT "billing_owner_binding_auth_user_id_user_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_owner_binding" ADD CONSTRAINT "billing_owner_binding_environment_account_id_credit_account_environment_id_fk" FOREIGN KEY ("environment","account_id") REFERENCES "billing"."credit_account"("environment","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_period" ADD CONSTRAINT "billing_period_account_id_credit_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "billing"."credit_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_policy_activation" ADD CONSTRAINT "billing_policy_activation_environment_policy_id_billing_policy_environment_id_fk" FOREIGN KEY ("environment","policy_id") REFERENCES "billing"."billing_policy"("environment","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_policy_activation_cancellation" ADD CONSTRAINT "billing_policy_activation_cancellation_environment_activation_id_billing_policy_activation_environment_id_fk" FOREIGN KEY ("environment","activation_id") REFERENCES "billing"."billing_policy_activation"("environment","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_policy_head" ADD CONSTRAINT "billing_policy_head_environment_current_activation_id_billing_policy_activation_environment_id_fk" FOREIGN KEY ("environment","current_activation_id") REFERENCES "billing"."billing_policy_activation"("environment","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_policy_head" ADD CONSTRAINT "billing_policy_head_environment_pending_activation_id_billing_policy_activation_environment_id_fk" FOREIGN KEY ("environment","pending_activation_id") REFERENCES "billing"."billing_policy_activation"("environment","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_promotion_issuance" ADD CONSTRAINT "billing_promotion_issuance_account_id_credit_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "billing"."credit_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_promotion_issuance" ADD CONSTRAINT "billing_promotion_issuance_budget_id_billing_budget_id_fk" FOREIGN KEY ("budget_id") REFERENCES "billing"."billing_budget"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_promotion_issuance" ADD CONSTRAINT "billing_promotion_issuance_environment_account_id_credit_account_environment_id_fk" FOREIGN KEY ("environment","account_id") REFERENCES "billing"."credit_account"("environment","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_promotion_issuance" ADD CONSTRAINT "billing_promotion_issuance_environment_budget_id_billing_budget_environment_id_fk" FOREIGN KEY ("environment","budget_id") REFERENCES "billing"."billing_budget"("environment","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_purchase" ADD CONSTRAINT "billing_purchase_account_id_credit_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "billing"."credit_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_reversal_case" ADD CONSTRAINT "billing_reversal_case_account_id_credit_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "billing"."credit_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_reversal_case" ADD CONSTRAINT "billing_reversal_case_account_id_purchase_id_billing_purchase_account_id_id_fk" FOREIGN KEY ("account_id","purchase_id") REFERENCES "billing"."billing_purchase"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_reversal_case" ADD CONSTRAINT "billing_reversal_case_account_id_period_id_billing_period_account_id_id_fk" FOREIGN KEY ("account_id","period_id") REFERENCES "billing"."billing_period"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_route_pause" ADD CONSTRAINT "billing_route_pause_operation_id_credit_operation_id_fk" FOREIGN KEY ("operation_id") REFERENCES "billing"."credit_operation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_route_pause" ADD CONSTRAINT "billing_route_pause_environment_operation_id_credit_operation_environment_id_fk" FOREIGN KEY ("environment","operation_id") REFERENCES "billing"."credit_operation"("environment","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."credit_operation" ADD CONSTRAINT "credit_operation_policy_id_billing_policy_id_fk" FOREIGN KEY ("policy_id") REFERENCES "billing"."billing_policy"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."credit_operation" ADD CONSTRAINT "credit_operation_activation_id_billing_policy_activation_id_fk" FOREIGN KEY ("activation_id") REFERENCES "billing"."billing_policy_activation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."credit_operation" ADD CONSTRAINT "credit_operation_environment_account_id_credit_account_environment_id_fk" FOREIGN KEY ("environment","account_id") REFERENCES "billing"."credit_account"("environment","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."credit_operation" ADD CONSTRAINT "credit_operation_environment_activation_id_policy_id_billing_policy_activation_environment_id_policy_id_fk" FOREIGN KEY ("environment","activation_id","policy_id") REFERENCES "billing"."billing_policy_activation"("environment","id","policy_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."credit_operation" ADD CONSTRAINT "credit_operation_account_id_id_base_transaction_id_credit_transaction_account_id_operation_id_id_fk" FOREIGN KEY ("account_id","id","base_transaction_id") REFERENCES "billing"."credit_transaction"("account_id","operation_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."credit_transaction" ADD CONSTRAINT "credit_transaction_account_id_credit_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "billing"."credit_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."credit_transaction" ADD CONSTRAINT "credit_transaction_account_id_correction_of_credit_transaction_account_id_id_fk" FOREIGN KEY ("account_id","correction_of") REFERENCES "billing"."credit_transaction"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."credit_transaction" ADD CONSTRAINT "credit_transaction_account_id_operation_id_credit_operation_account_id_id_fk" FOREIGN KEY ("account_id","operation_id") REFERENCES "billing"."credit_operation"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."credit_transaction" ADD CONSTRAINT "credit_transaction_account_id_purchase_id_billing_purchase_account_id_id_fk" FOREIGN KEY ("account_id","purchase_id") REFERENCES "billing"."billing_purchase"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."credit_transaction" ADD CONSTRAINT "credit_transaction_account_id_period_id_billing_period_account_id_id_fk" FOREIGN KEY ("account_id","period_id") REFERENCES "billing"."billing_period"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."credit_transaction" ADD CONSTRAINT "credit_transaction_account_id_reversal_case_id_billing_reversal_case_account_id_id_fk" FOREIGN KEY ("account_id","reversal_case_id") REFERENCES "billing"."billing_reversal_case"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."credit_transaction" ADD CONSTRAINT "credit_transaction_account_id_promotion_issuance_id_billing_promotion_issuance_account_id_id_fk" FOREIGN KEY ("account_id","promotion_issuance_id") REFERENCES "billing"."billing_promotion_issuance"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."supplier_cost_evidence" ADD CONSTRAINT "supplier_cost_evidence_operation_id_credit_operation_id_fk" FOREIGN KEY ("operation_id") REFERENCES "billing"."credit_operation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_budget_period" ON "billing"."billing_budget" USING btree ("environment","kind","scope","period_start","period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_funding_scope" ON "billing"."billing_budget_funding" USING btree ("environment","kind","scope");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_hold_cause" ON "billing"."billing_budget_hold" USING btree ("budget_id","operation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_owner_active_user" ON "billing"."billing_owner_binding" USING btree ("environment","auth_user_id") WHERE "billing"."billing_owner_binding"."revoked_at" IS NULL AND "billing"."billing_owner_binding"."auth_user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_owner_active_account" ON "billing"."billing_owner_binding" USING btree ("account_id") WHERE "billing"."billing_owner_binding"."revoked_at" IS NULL AND "billing"."billing_owner_binding"."auth_user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_policy_version" ON "billing"."billing_policy" USING btree ("environment","policy_version");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_policy_content" ON "billing"."billing_policy" USING btree ("environment","content_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_activation_job" ON "billing"."billing_policy_activation" USING btree ("environment","job_key");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_cancellation_job" ON "billing"."billing_policy_activation_cancellation" USING btree ("environment","job_key");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_promotion_entitlement" ON "billing"."billing_promotion_issuance" USING btree ("account_id","promotion_program_id","period_start","period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_reversal_purchase" ON "billing"."billing_reversal_case" USING btree ("purchase_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_reversal_period" ON "billing"."billing_reversal_case" USING btree ("period_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_operation_attempt" ON "billing"."credit_operation" USING btree ("account_id","surface","attempt_key");--> statement-breakpoint
CREATE INDEX "credit_operation_due" ON "billing"."credit_operation" USING btree ("due_at","id") WHERE "billing"."credit_operation"."customer_state" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "credit_transaction_revision" ON "billing"."credit_transaction" USING btree ("account_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_transaction_resolution" ON "billing"."credit_transaction" USING btree ("operation_id") WHERE "billing"."credit_transaction"."kind" = 'operation_resolution';--> statement-breakpoint
CREATE UNIQUE INDEX "credit_transaction_purchase" ON "billing"."credit_transaction" USING btree ("purchase_id") WHERE "billing"."credit_transaction"."kind" = 'purchase_grant';--> statement-breakpoint
CREATE UNIQUE INDEX "credit_transaction_period" ON "billing"."credit_transaction" USING btree ("period_id") WHERE "billing"."credit_transaction"."kind" = 'period_grant';--> statement-breakpoint
CREATE UNIQUE INDEX "credit_transaction_promotion" ON "billing"."credit_transaction" USING btree ("promotion_issuance_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_evidence_source" ON "billing"."supplier_cost_evidence" USING btree ("environment","provider","credential_account","source_object_id","source_revision");