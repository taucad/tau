CREATE TABLE "billing"."billing_account_closure" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"binding_id" text NOT NULL,
	"environment" text NOT NULL,
	"request_id" text NOT NULL,
	"request_hash" text NOT NULL,
	"state" text DEFAULT 'closing' NOT NULL,
	"generation" bigint DEFAULT 0 NOT NULL,
	"lease_until" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"binding_revoked_at" timestamp with time zone NOT NULL,
	"obligations_frozen_at" timestamp with time zone NOT NULL,
	"auth_deleted_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"attention_code" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_account_closure_account_id_unique" UNIQUE("account_id"),
	CONSTRAINT "billing_account_closure_owner" UNIQUE("account_id","id"),
	CONSTRAINT "billing_account_closure_generation" CHECK ("billing"."billing_account_closure"."generation" >= 0 AND "billing"."billing_account_closure"."attempt_count" >= 0),
	CONSTRAINT "billing_account_closure_state" CHECK ("billing"."billing_account_closure"."state" IN ('closing','cancellation_pending','ready_for_auth_deletion','closed','attention') AND ("billing"."billing_account_closure"."state" <> 'closed' OR "billing"."billing_account_closure"."closed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "billing"."billing_cash_fact" (
	"id" text PRIMARY KEY NOT NULL,
	"scan_id" text,
	"environment" text NOT NULL,
	"stripe_account_id" text NOT NULL,
	"livemode" boolean NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"source_created_at" timestamp with time zone NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"currency" text,
	"amount_minor" bigint,
	"fee_minor" bigint,
	"net_minor" bigint,
	"customer_id" text,
	"payment_intent_id" text,
	"charge_id" text,
	"refund_id" text,
	"dispute_id" text,
	"balance_transaction_id" text,
	"object_digest" text NOT NULL,
	"evidence" jsonb NOT NULL,
	CONSTRAINT "billing_cash_fact_identity" UNIQUE("environment","stripe_account_id","livemode","source_type","source_id","object_digest")
);
--> statement-breakpoint
CREATE TABLE "billing"."billing_cash_scan" (
	"id" text PRIMARY KEY NOT NULL,
	"environment" text NOT NULL,
	"stripe_account_id" text NOT NULL,
	"livemode" boolean NOT NULL,
	"currency" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"lookback_start" timestamp with time zone NOT NULL,
	"frozen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"balance_cursor" text,
	"payment_intent_cursor" text,
	"charge_cursor" text,
	"refund_cursor" text,
	"balance_done" boolean DEFAULT false NOT NULL,
	"payment_intent_done" boolean DEFAULT false NOT NULL,
	"charge_done" boolean DEFAULT false NOT NULL,
	"refund_done" boolean DEFAULT false NOT NULL,
	"journal_cursor" text,
	"fact_cursor" text,
	"journal_done" boolean DEFAULT false NOT NULL,
	"fact_done" boolean DEFAULT false NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"generation" bigint DEFAULT 0 NOT NULL,
	"lease_until" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error_code" text,
	"completed_at" timestamp with time zone,
	CONSTRAINT "billing_cash_scan_window" UNIQUE("environment","stripe_account_id","livemode","currency","window_start","window_end"),
	CONSTRAINT "billing_cash_scan_bounds" CHECK ("billing"."billing_cash_scan"."lookback_start" <= "billing"."billing_cash_scan"."window_start" AND "billing"."billing_cash_scan"."window_start" < "billing"."billing_cash_scan"."window_end" AND "billing"."billing_cash_scan"."generation" >= 0 AND "billing"."billing_cash_scan"."attempts" >= 0),
	CONSTRAINT "billing_cash_scan_state" CHECK ("billing"."billing_cash_scan"."state" IN ('pending','running','incomplete','complete','attention') AND ("billing"."billing_cash_scan"."state" <> 'complete' OR ("billing"."billing_cash_scan"."balance_done" AND "billing"."billing_cash_scan"."payment_intent_done" AND "billing"."billing_cash_scan"."charge_done" AND "billing"."billing_cash_scan"."refund_done" AND "billing"."billing_cash_scan"."journal_done" AND "billing"."billing_cash_scan"."completed_at" IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "billing"."billing_cash_scan_fact" (
	"scan_id" text NOT NULL,
	"fact_id" text NOT NULL,
	CONSTRAINT "billing_cash_scan_fact_scan_id_fact_id_pk" PRIMARY KEY("scan_id","fact_id")
);
--> statement-breakpoint
CREATE TABLE "billing"."billing_financial_case" (
	"id" text PRIMARY KEY NOT NULL,
	"environment" text NOT NULL,
	"stripe_account_id" text NOT NULL,
	"livemode" boolean NOT NULL,
	"kind" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"account_id" text,
	"source_type" text,
	"source_id" text,
	"currency" text,
	"known_amount_minor" bigint,
	"evidence" jsonb NOT NULL,
	"owner" text NOT NULL,
	"next_step" text NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"first_effective_at" timestamp with time zone NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deadline_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"resolution_evidence" jsonb,
	CONSTRAINT "billing_financial_case_identity" UNIQUE("environment","stripe_account_id","livemode","kind","dedupe_key"),
	CONSTRAINT "billing_financial_case_state" CHECK ("billing"."billing_financial_case"."state" IN ('open','attention','resolved') AND ("billing"."billing_financial_case"."state" <> 'resolved' OR ("billing"."billing_financial_case"."resolved_at" IS NOT NULL AND "billing"."billing_financial_case"."resolution_evidence" IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "billing"."billing_recovery_notice" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"environment" text NOT NULL,
	"kind" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"subscription_id" text,
	"purchase_id" text,
	"invoice_id" text,
	"consent_id" text,
	"payload" jsonb NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"generation" bigint DEFAULT 0 NOT NULL,
	"lease_until" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"delivered_at" timestamp with time zone,
	"delivery_receipt" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_recovery_notice_identity" UNIQUE("environment","dedupe_key"),
	CONSTRAINT "billing_recovery_notice_state" CHECK ("billing"."billing_recovery_notice"."kind" IN ('renewal_failed','authentication_required','consent_disabled') AND "billing"."billing_recovery_notice"."state" IN ('pending','processing','delivered') AND "billing"."billing_recovery_notice"."generation" >= 0 AND "billing"."billing_recovery_notice"."attempt_count" >= 0 AND ("billing"."billing_recovery_notice"."state" <> 'delivered' OR ("billing"."billing_recovery_notice"."delivered_at" IS NOT NULL AND "billing"."billing_recovery_notice"."delivery_receipt" IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "billing"."billing_refund_intent" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"environment" text NOT NULL,
	"reversal_case_id" text NOT NULL,
	"request_id" text NOT NULL,
	"request_hash" text NOT NULL,
	"requested_principal_minor" bigint NOT NULL,
	"requested_tax_minor" bigint NOT NULL,
	"requested_gross_minor" bigint NOT NULL,
	"approved_maximum_gross_minor" bigint NOT NULL,
	"target_reversed_atoms" bigint NOT NULL,
	"hold_atoms" bigint NOT NULL,
	"hold_state" text DEFAULT 'held' NOT NULL,
	"review_actor_id" text NOT NULL,
	"reviewed_at" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"state" text DEFAULT 'prepared' NOT NULL,
	"source_digest" text NOT NULL,
	"confirmed_at" timestamp with time zone,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_refund_intent_owner" UNIQUE("account_id","id"),
	CONSTRAINT "billing_refund_intent_request" UNIQUE("reversal_case_id","request_id"),
	CONSTRAINT "billing_refund_intent_amount" CHECK ("billing"."billing_refund_intent"."requested_principal_minor" >= 0 AND "billing"."billing_refund_intent"."requested_tax_minor" >= 0 AND "billing"."billing_refund_intent"."requested_gross_minor" > 0 AND "billing"."billing_refund_intent"."requested_principal_minor"::numeric + "billing"."billing_refund_intent"."requested_tax_minor" = "billing"."billing_refund_intent"."requested_gross_minor" AND "billing"."billing_refund_intent"."requested_gross_minor" <= "billing"."billing_refund_intent"."approved_maximum_gross_minor" AND "billing"."billing_refund_intent"."target_reversed_atoms" >= 0 AND "billing"."billing_refund_intent"."hold_atoms" BETWEEN 0 AND "billing"."billing_refund_intent"."target_reversed_atoms"),
	CONSTRAINT "billing_refund_intent_state" CHECK ("billing"."billing_refund_intent"."state" IN ('prepared','pending','attention','succeeded','failed','canceled') AND "billing"."billing_refund_intent"."hold_state" IN ('held','released','applied') AND ("billing"."billing_refund_intent"."state" NOT IN ('succeeded','failed','canceled') OR ("billing"."billing_refund_intent"."hold_state" <> 'held' AND "billing"."billing_refund_intent"."confirmed_at" IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "billing"."billing_reload_consent" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"environment" text NOT NULL,
	"version" integer NOT NULL,
	"request_id" text NOT NULL,
	"request_hash" text NOT NULL,
	"return_path" text NOT NULL,
	"customer_binding_id" text NOT NULL,
	"policy_id" text NOT NULL,
	"terms_digest" text NOT NULL,
	"offer_snapshot" jsonb NOT NULL,
	"tax_evidence" jsonb NOT NULL,
	"currency" text NOT NULL,
	"principal_minor" bigint NOT NULL,
	"quoted_tax_minor" bigint NOT NULL,
	"gross_ceiling_minor" bigint NOT NULL,
	"threshold_atoms" bigint NOT NULL,
	"monthly_gross_cap_minor" bigint NOT NULL,
	"minimum_cadence_seconds" integer NOT NULL,
	"terminal_failure_limit" integer NOT NULL,
	"checkout_session_id" text,
	"setup_intent_id" text,
	"payment_method_id" text,
	"payment_method" jsonb,
	"consented_at" timestamp with time zone,
	"state" text DEFAULT 'pending_setup' NOT NULL,
	"consecutive_terminal_failures" integer DEFAULT 0 NOT NULL,
	"last_automatic_started_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_reload_consent_owner" UNIQUE("account_id","id"),
	CONSTRAINT "billing_reload_consent_version" UNIQUE("account_id","version"),
	CONSTRAINT "billing_reload_consent_request" UNIQUE("account_id","request_id"),
	CONSTRAINT "billing_reload_consent_limits" CHECK ("billing"."billing_reload_consent"."version" > 0 AND "billing"."billing_reload_consent"."principal_minor" > 0 AND "billing"."billing_reload_consent"."quoted_tax_minor" >= 0 AND "billing"."billing_reload_consent"."gross_ceiling_minor"::numeric >= "billing"."billing_reload_consent"."principal_minor"::numeric + "billing"."billing_reload_consent"."quoted_tax_minor" AND "billing"."billing_reload_consent"."monthly_gross_cap_minor" >= "billing"."billing_reload_consent"."gross_ceiling_minor" AND "billing"."billing_reload_consent"."threshold_atoms" > 0 AND "billing"."billing_reload_consent"."minimum_cadence_seconds" >= 3600 AND "billing"."billing_reload_consent"."terminal_failure_limit" BETWEEN 1 AND 2 AND "billing"."billing_reload_consent"."consecutive_terminal_failures" >= 0 AND "billing"."billing_reload_consent"."currency" = 'usd'),
	CONSTRAINT "billing_reload_consent_state" CHECK ("billing"."billing_reload_consent"."state" IN ('pending_setup','enabled','paused_terms','disabled_failures','revoked') AND ("billing"."billing_reload_consent"."state" <> 'enabled' OR ("billing"."billing_reload_consent"."checkout_session_id" IS NOT NULL AND "billing"."billing_reload_consent"."setup_intent_id" IS NOT NULL AND "billing"."billing_reload_consent"."payment_method_id" IS NOT NULL AND "billing"."billing_reload_consent"."payment_method" IS NOT NULL AND "billing"."billing_reload_consent"."consented_at" IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "billing"."billing_reload_work" (
	"account_id" text PRIMARY KEY NOT NULL,
	"environment" text NOT NULL,
	"reason_kind" text NOT NULL,
	"reason_operation_id" text,
	"reason_attempt_key" text,
	"reason_request_digest" text,
	"observed_account_revision" bigint NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"generation" bigint DEFAULT 0 NOT NULL,
	"lease_until" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_reload_work_state" CHECK ("billing"."billing_reload_work"."state" IN ('pending','processing','done') AND "billing"."billing_reload_work"."generation" >= 0 AND "billing"."billing_reload_work"."observed_account_revision" >= 0 AND "billing"."billing_reload_work"."reason_kind" IN ('admission','settlement','insufficient_funds'))
);
--> statement-breakpoint
CREATE TABLE "billing"."billing_subscription_offer" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"environment" text NOT NULL,
	"subscription_id" text NOT NULL,
	"effective_period_start" timestamp with time zone NOT NULL,
	"disclosed_at" timestamp with time zone NOT NULL,
	"policy_id" text NOT NULL,
	"offer_snapshot" jsonb NOT NULL,
	"terms_digest" text NOT NULL,
	"stripe_price_id" text NOT NULL,
	"stripe_product_id" text NOT NULL,
	"stripe_subscription_item_id" text NOT NULL,
	"stripe_schedule_id" text,
	"source_evidence" jsonb NOT NULL,
	"schedule_evidence" jsonb,
	"state" text DEFAULT 'prepared' NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_subscription_offer_owner" UNIQUE("account_id","id"),
	CONSTRAINT "billing_subscription_offer_period" UNIQUE("subscription_id","effective_period_start"),
	CONSTRAINT "billing_subscription_offer_state" CHECK ("billing"."billing_subscription_offer"."state" IN ('prepared','dispatched','confirmed','attention') AND "billing"."billing_subscription_offer"."disclosed_at" <= "billing"."billing_subscription_offer"."effective_period_start" AND ("billing"."billing_subscription_offer"."state" <> 'confirmed' OR ("billing"."billing_subscription_offer"."stripe_schedule_id" IS NOT NULL AND "billing"."billing_subscription_offer"."schedule_evidence" IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "billing"."billing_tax_fact" (
	"id" text PRIMARY KEY NOT NULL,
	"environment" text NOT NULL,
	"stripe_account_id" text NOT NULL,
	"livemode" boolean NOT NULL,
	"account_id" text,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"source_claim_id" text NOT NULL,
	"source_generation" bigint NOT NULL,
	"source_digest" text NOT NULL,
	"supersedes_fact_id" text,
	"effective_at" timestamp with time zone NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"classification" text NOT NULL,
	"reporting_revenue_minor" bigint,
	"evidence" jsonb NOT NULL,
	CONSTRAINT "billing_tax_fact_source" UNIQUE("environment","stripe_account_id","livemode","source_type","source_id","source_digest"),
	CONSTRAINT "billing_tax_fact_successor" UNIQUE("supersedes_fact_id"),
	CONSTRAINT "billing_tax_fact_classification" CHECK ("billing"."billing_tax_fact"."classification" IN ('eu_b2c','uk_b2c','enterprise_vat_invoice','outside_monitor','unknown') AND "billing"."billing_tax_fact"."source_generation" > 0 AND ("billing"."billing_tax_fact"."reporting_revenue_minor" IS NULL OR "billing"."billing_tax_fact"."reporting_revenue_minor" >= 0) AND ("billing"."billing_tax_fact"."classification" <> 'unknown' OR "billing"."billing_tax_fact"."reporting_revenue_minor" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "billing"."billing_provider_leg" DROP CONSTRAINT "billing_provider_object";--> statement-breakpoint
ALTER TABLE "billing"."billing_provider_leg" DROP CONSTRAINT "billing_provider_leg_kind";--> statement-breakpoint
ALTER TABLE "billing"."billing_provider_leg" DROP CONSTRAINT "billing_provider_no_charge";--> statement-breakpoint
ALTER TABLE "billing"."billing_provider_leg" DROP CONSTRAINT "billing_provider_dispatch";--> statement-breakpoint
ALTER TABLE "billing"."billing_provider_leg" DROP CONSTRAINT "billing_provider_leg_state";--> statement-breakpoint
ALTER TABLE "billing"."billing_reversal_case" DROP CONSTRAINT "billing_reversal_bounds";--> statement-breakpoint
ALTER TABLE "billing"."credit_transaction" DROP CONSTRAINT "credit_transaction_cause";--> statement-breakpoint
DROP INDEX "billing"."billing_provider_active_purchase";--> statement-breakpoint
ALTER TABLE "billing"."billing_provider_leg" ADD COLUMN "reload_consent_id" text;--> statement-breakpoint
ALTER TABLE "billing"."billing_provider_leg" ADD COLUMN "subscription_offer_id" text;--> statement-breakpoint
ALTER TABLE "billing"."billing_provider_leg" ADD COLUMN "refund_intent_id" text;--> statement-breakpoint
ALTER TABLE "billing"."billing_provider_leg" ADD COLUMN "closure_id" text;--> statement-breakpoint
ALTER TABLE "billing"."billing_provider_leg" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing"."billing_provider_leg" ADD COLUMN "expiration_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing"."billing_provider_leg" ADD COLUMN "terminal_evidence" jsonb;--> statement-breakpoint
ALTER TABLE "billing"."billing_provider_leg" ADD COLUMN "generation" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "billing"."billing_provider_leg" ADD COLUMN "lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing"."billing_purchase" ADD COLUMN "reload_consent_id" text;--> statement-breakpoint
ALTER TABLE "billing"."billing_purchase" ADD COLUMN "reload_consent_version" integer;--> statement-breakpoint
ALTER TABLE "billing"."billing_purchase" ADD COLUMN "automatic_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing"."billing_purchase" ADD COLUMN "automatic_gross_ceiling_minor" bigint;--> statement-breakpoint
ALTER TABLE "billing"."billing_purchase" ADD COLUMN "automatic_source_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing"."billing_purchase" ADD COLUMN "automatic_terminal_outcome" text;--> statement-breakpoint
ALTER TABLE "billing"."billing_purchase" ADD COLUMN "automatic_terminal_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing"."billing_purchase" ADD COLUMN "tax_evidence" jsonb;--> statement-breakpoint
ALTER TABLE "billing"."billing_reversal_case" ADD COLUMN "environment" text;--> statement-breakpoint
ALTER TABLE "billing"."billing_reversal_case" ADD COLUMN "stripe_account_id" text;--> statement-breakpoint
ALTER TABLE "billing"."billing_reversal_case" ADD COLUMN "livemode" boolean;--> statement-breakpoint
ALTER TABLE "billing"."billing_reversal_case" ADD COLUMN "currency" text;--> statement-breakpoint
ALTER TABLE "billing"."billing_reversal_case" ADD COLUMN "customer_binding_id" text;--> statement-breakpoint
ALTER TABLE "billing"."billing_reversal_case" ADD COLUMN "payment_intent_id" text;--> statement-breakpoint
ALTER TABLE "billing"."billing_reversal_case" ADD COLUMN "charge_id" text;--> statement-breakpoint
ALTER TABLE "billing"."billing_reversal_case" ADD COLUMN "canonical_receipt_id" text;--> statement-breakpoint
ALTER TABLE "billing"."billing_reversal_case" ADD COLUMN "original_principal_minor" bigint;--> statement-breakpoint
ALTER TABLE "billing"."billing_reversal_case" ADD COLUMN "original_tax_minor" bigint;--> statement-breakpoint
ALTER TABLE "billing"."billing_reversal_case" ADD COLUMN "original_gross_minor" bigint;--> statement-breakpoint
ALTER TABLE "billing"."billing_reversal_case" ADD COLUMN "initial_issued_atoms" bigint;--> statement-breakpoint
ALTER TABLE "billing"."billing_reversal_case" ADD COLUMN "withheld_atoms" bigint;--> statement-breakpoint
ALTER TABLE "billing"."billing_reversal_case" ADD COLUMN "deferred_issued_atoms" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "billing"."billing_reversal_case" ADD COLUMN "cumulative_principal_loss_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "billing"."billing_reversal_case" ADD COLUMN "cumulative_tax_loss_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "billing"."billing_reversal_case" ADD COLUMN "cumulative_gross_loss_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "billing"."billing_reversal_case" ADD COLUMN "projection_digest" text;--> statement-breakpoint
ALTER TABLE "billing"."billing_reversal_case" ADD COLUMN "projection_source_id" text;--> statement-breakpoint
ALTER TABLE "billing"."billing_reversal_case" ADD COLUMN "projection_source_generation" bigint;--> statement-breakpoint
ALTER TABLE "billing"."billing_reversal_case" ADD COLUMN "projection_observed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing"."billing_reversal_case" ADD COLUMN "projection_evidence" jsonb;--> statement-breakpoint
ALTER TABLE "billing"."billing_reversal_case" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "billing"."credit_transaction" ADD COLUMN "cash_evidence" jsonb;--> statement-breakpoint
ALTER TABLE "billing"."billing_account_closure" ADD CONSTRAINT "billing_account_closure_binding_id_billing_owner_binding_id_fk" FOREIGN KEY ("binding_id") REFERENCES "billing"."billing_owner_binding"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_account_closure" ADD CONSTRAINT "billing_account_closure_environment_account_id_credit_account_environment_id_fk" FOREIGN KEY ("environment","account_id") REFERENCES "billing"."credit_account"("environment","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_cash_fact" ADD CONSTRAINT "billing_cash_fact_scan_id_billing_cash_scan_id_fk" FOREIGN KEY ("scan_id") REFERENCES "billing"."billing_cash_scan"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_cash_scan_fact" ADD CONSTRAINT "billing_cash_scan_fact_scan_id_billing_cash_scan_id_fk" FOREIGN KEY ("scan_id") REFERENCES "billing"."billing_cash_scan"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_cash_scan_fact" ADD CONSTRAINT "billing_cash_scan_fact_fact_id_billing_cash_fact_id_fk" FOREIGN KEY ("fact_id") REFERENCES "billing"."billing_cash_fact"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_financial_case" ADD CONSTRAINT "billing_financial_case_account_id_credit_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "billing"."credit_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_recovery_notice" ADD CONSTRAINT "billing_recovery_notice_account_id_credit_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "billing"."credit_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_refund_intent" ADD CONSTRAINT "billing_refund_intent_account_id_reversal_case_id_billing_reversal_case_account_id_id_fk" FOREIGN KEY ("account_id","reversal_case_id") REFERENCES "billing"."billing_reversal_case"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_refund_intent" ADD CONSTRAINT "billing_refund_intent_environment_account_id_credit_account_environment_id_fk" FOREIGN KEY ("environment","account_id") REFERENCES "billing"."credit_account"("environment","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_reload_consent" ADD CONSTRAINT "billing_reload_consent_account_id_credit_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "billing"."credit_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_reload_consent" ADD CONSTRAINT "billing_reload_consent_account_id_customer_binding_id_billing_stripe_customer_account_id_id_fk" FOREIGN KEY ("account_id","customer_binding_id") REFERENCES "billing"."billing_stripe_customer"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_reload_consent" ADD CONSTRAINT "billing_reload_consent_environment_account_id_credit_account_environment_id_fk" FOREIGN KEY ("environment","account_id") REFERENCES "billing"."credit_account"("environment","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_reload_work" ADD CONSTRAINT "billing_reload_work_account_id_credit_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "billing"."credit_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_reload_work" ADD CONSTRAINT "billing_reload_work_environment_account_id_credit_account_environment_id_fk" FOREIGN KEY ("environment","account_id") REFERENCES "billing"."credit_account"("environment","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_subscription_offer" ADD CONSTRAINT "billing_subscription_offer_account_id_subscription_id_subscription_account_id_id_fk" FOREIGN KEY ("account_id","subscription_id") REFERENCES "public"."subscription"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_subscription_offer" ADD CONSTRAINT "billing_subscription_offer_environment_account_id_credit_account_environment_id_fk" FOREIGN KEY ("environment","account_id") REFERENCES "billing"."credit_account"("environment","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_tax_fact" ADD CONSTRAINT "billing_tax_fact_account_id_credit_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "billing"."credit_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_tax_fact" ADD CONSTRAINT "billing_tax_fact_source_claim_id_billing_stripe_source_id_fk" FOREIGN KEY ("source_claim_id") REFERENCES "billing"."billing_stripe_source"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_tax_fact" ADD CONSTRAINT "billing_tax_fact_supersedes_fact_id_billing_tax_fact_id_fk" FOREIGN KEY ("supersedes_fact_id") REFERENCES "billing"."billing_tax_fact"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_account_closure_due" ON "billing"."billing_account_closure" USING btree ("next_attempt_at","id") WHERE "billing"."billing_account_closure"."state" IN ('closing','cancellation_pending','attention');--> statement-breakpoint
CREATE INDEX "billing_cash_fact_source" ON "billing"."billing_cash_fact" USING btree ("stripe_account_id","livemode","source_type","source_id");--> statement-breakpoint
CREATE INDEX "billing_cash_scan_due" ON "billing"."billing_cash_scan" USING btree ("next_attempt_at","id") WHERE "billing"."billing_cash_scan"."state" <> 'complete';--> statement-breakpoint
CREATE INDEX "billing_recovery_notice_due" ON "billing"."billing_recovery_notice" USING btree ("next_attempt_at","id") WHERE "billing"."billing_recovery_notice"."state" <> 'delivered';--> statement-breakpoint
CREATE UNIQUE INDEX "billing_reload_consent_active" ON "billing"."billing_reload_consent" USING btree ("account_id") WHERE "billing"."billing_reload_consent"."state" IN ('pending_setup','enabled');--> statement-breakpoint
CREATE INDEX "billing_reload_work_due" ON "billing"."billing_reload_work" USING btree ("next_attempt_at","account_id") WHERE "billing"."billing_reload_work"."state" <> 'done';--> statement-breakpoint
CREATE INDEX "billing_tax_fact_monitor" ON "billing"."billing_tax_fact" USING btree ("environment","stripe_account_id","livemode","effective_at");--> statement-breakpoint
ALTER TABLE "billing"."billing_provider_leg" ADD CONSTRAINT "billing_provider_leg_account_id_reload_consent_id_billing_reload_consent_account_id_id_fk" FOREIGN KEY ("account_id","reload_consent_id") REFERENCES "billing"."billing_reload_consent"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_provider_leg" ADD CONSTRAINT "billing_provider_leg_account_id_subscription_offer_id_billing_subscription_offer_account_id_id_fk" FOREIGN KEY ("account_id","subscription_offer_id") REFERENCES "billing"."billing_subscription_offer"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_provider_leg" ADD CONSTRAINT "billing_provider_leg_account_id_refund_intent_id_billing_refund_intent_account_id_id_fk" FOREIGN KEY ("account_id","refund_intent_id") REFERENCES "billing"."billing_refund_intent"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_provider_leg" ADD CONSTRAINT "billing_provider_leg_account_id_closure_id_billing_account_closure_account_id_id_fk" FOREIGN KEY ("account_id","closure_id") REFERENCES "billing"."billing_account_closure"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_purchase" ADD CONSTRAINT "billing_purchase_account_id_reload_consent_id_billing_reload_consent_account_id_id_fk" FOREIGN KEY ("account_id","reload_consent_id") REFERENCES "billing"."billing_reload_consent"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_provider_object" ON "billing"."billing_provider_leg" USING btree ("customer_binding_id","kind","provider_object_id") WHERE "billing"."billing_provider_leg"."kind" NOT IN ('subscription_update','subscription_cancel');--> statement-breakpoint
CREATE UNIQUE INDEX "billing_purchase_automatic_pending" ON "billing"."billing_purchase" USING btree ("account_id") WHERE "billing"."billing_purchase"."purpose" = 'automatic' AND "billing"."billing_purchase"."automatic_terminal_outcome" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_provider_active_purchase" ON "billing"."billing_provider_leg" USING btree ("purchase_id") WHERE "billing"."billing_provider_leg"."state" <> 'no_charge' AND "billing"."billing_provider_leg"."kind" IN ('payment_intent','checkout_payment');--> statement-breakpoint
ALTER TABLE "billing"."billing_reversal_case" ADD CONSTRAINT "billing_reversal_charge" UNIQUE("stripe_account_id","livemode","charge_id");--> statement-breakpoint
ALTER TABLE "billing"."billing_reversal_case" ADD CONSTRAINT "billing_reversal_payment" UNIQUE("stripe_account_id","livemode","payment_intent_id");--> statement-breakpoint
ALTER TABLE "billing"."billing_provider_leg" ADD CONSTRAINT "billing_provider_expired" CHECK ("billing"."billing_provider_leg"."state" <> 'expired' OR ("billing"."billing_provider_leg"."kind" IN ('checkout_setup','checkout_subscription') AND "billing"."billing_provider_leg"."terminal_evidence" IS NOT NULL AND "billing"."billing_provider_leg"."expiration_requested_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "billing"."billing_provider_leg" ADD CONSTRAINT "billing_provider_leg_kind" CHECK (("billing"."billing_provider_leg"."kind" IN ('customer','portal','tax_calculation') AND "billing"."billing_provider_leg"."purchase_id" IS NULL AND "billing"."billing_provider_leg"."subscription_id" IS NULL) OR ("billing"."billing_provider_leg"."kind" IN ('checkout_payment','payment_intent') AND "billing"."billing_provider_leg"."purchase_id" IS NOT NULL AND "billing"."billing_provider_leg"."subscription_id" IS NULL) OR ("billing"."billing_provider_leg"."kind" = 'checkout_subscription' AND "billing"."billing_provider_leg"."purchase_id" IS NULL AND "billing"."billing_provider_leg"."subscription_id" IS NOT NULL) OR ("billing"."billing_provider_leg"."kind" = 'checkout_setup' AND "billing"."billing_provider_leg"."reload_consent_id" IS NOT NULL AND "billing"."billing_provider_leg"."purchase_id" IS NULL AND "billing"."billing_provider_leg"."subscription_id" IS NULL) OR ("billing"."billing_provider_leg"."kind" IN ('subscription_update','subscription_schedule') AND "billing"."billing_provider_leg"."subscription_offer_id" IS NOT NULL AND "billing"."billing_provider_leg"."subscription_id" IS NOT NULL AND "billing"."billing_provider_leg"."purchase_id" IS NULL) OR ("billing"."billing_provider_leg"."kind" = 'subscription_cancel' AND "billing"."billing_provider_leg"."closure_id" IS NOT NULL AND "billing"."billing_provider_leg"."subscription_id" IS NOT NULL AND "billing"."billing_provider_leg"."purchase_id" IS NULL) OR ("billing"."billing_provider_leg"."kind" = 'refund' AND "billing"."billing_provider_leg"."refund_intent_id" IS NOT NULL AND "billing"."billing_provider_leg"."purchase_id" IS NULL AND "billing"."billing_provider_leg"."subscription_id" IS NULL));--> statement-breakpoint
ALTER TABLE "billing"."billing_provider_leg" ADD CONSTRAINT "billing_provider_no_charge" CHECK ("billing"."billing_provider_leg"."state" <> 'no_charge' OR "billing"."billing_provider_leg"."dispatch_started_at" IS NULL OR (("billing"."billing_provider_leg"."kind" = 'payment_intent' AND "billing"."billing_provider_leg"."no_charge_evidence" IS NOT NULL OR "billing"."billing_provider_leg"."kind" = 'subscription_cancel' AND "billing"."billing_provider_leg"."terminal_evidence" IS NOT NULL) AND "billing"."billing_provider_leg"."cancellation_confirmed_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "billing"."billing_provider_leg" ADD CONSTRAINT "billing_provider_dispatch" CHECK (("billing"."billing_provider_leg"."state" = 'prepared' AND "billing"."billing_provider_leg"."dispatch_started_at" IS NULL) OR "billing"."billing_provider_leg"."state" = 'no_charge' OR ("billing"."billing_provider_leg"."state" IN ('dispatched','known','attention','expired') AND "billing"."billing_provider_leg"."dispatch_started_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "billing"."billing_provider_leg" ADD CONSTRAINT "billing_provider_leg_state" CHECK ("billing"."billing_provider_leg"."state" IN ('prepared','dispatched','known','attention','no_charge','expired') AND ("billing"."billing_provider_leg"."cancellation_confirmed_at" IS NULL OR "billing"."billing_provider_leg"."cancellation_requested_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "billing"."billing_purchase" ADD CONSTRAINT "billing_purchase_automatic" CHECK ("billing"."billing_purchase"."purpose" IS DISTINCT FROM 'automatic' OR ("billing"."billing_purchase"."reload_consent_id" IS NOT NULL AND "billing"."billing_purchase"."reload_consent_version" > 0 AND "billing"."billing_purchase"."automatic_started_at" IS NOT NULL AND "billing"."billing_purchase"."automatic_gross_ceiling_minor" > 0 AND ("billing"."billing_purchase"."automatic_terminal_outcome" IS NULL OR ("billing"."billing_purchase"."automatic_terminal_outcome" IN ('paid','no_charge_failure') AND "billing"."billing_purchase"."automatic_terminal_at" IS NOT NULL)) AND ("billing"."billing_purchase"."automatic_terminal_outcome" IS DISTINCT FROM 'paid' OR "billing"."billing_purchase"."automatic_source_accepted_at" IS NOT NULL)));--> statement-breakpoint
ALTER TABLE "billing"."billing_reversal_case" ADD CONSTRAINT "billing_reversal_issuance" CHECK ("billing"."billing_reversal_case"."deferred_issued_atoms" >= 0 AND ("billing"."billing_reversal_case"."initial_issued_atoms" IS NULL OR ("billing"."billing_reversal_case"."initial_issued_atoms" >= 0 AND "billing"."billing_reversal_case"."withheld_atoms" >= 0 AND "billing"."billing_reversal_case"."initial_issued_atoms" + "billing"."billing_reversal_case"."withheld_atoms" = "billing"."billing_reversal_case"."original_atoms" AND "billing"."billing_reversal_case"."deferred_issued_atoms" <= "billing"."billing_reversal_case"."withheld_atoms")));--> statement-breakpoint
ALTER TABLE "billing"."billing_reversal_case" ADD CONSTRAINT "billing_reversal_cash" CHECK ("billing"."billing_reversal_case"."original_principal_minor" IS NULL OR ("billing"."billing_reversal_case"."original_principal_minor" > 0 AND "billing"."billing_reversal_case"."original_tax_minor" >= 0 AND "billing"."billing_reversal_case"."original_gross_minor"::numeric = "billing"."billing_reversal_case"."original_principal_minor"::numeric + "billing"."billing_reversal_case"."original_tax_minor" AND "billing"."billing_reversal_case"."cumulative_principal_loss_minor" BETWEEN 0 AND "billing"."billing_reversal_case"."original_principal_minor" AND "billing"."billing_reversal_case"."cumulative_tax_loss_minor" BETWEEN 0 AND "billing"."billing_reversal_case"."original_tax_minor" AND "billing"."billing_reversal_case"."cumulative_gross_loss_minor" BETWEEN 0 AND "billing"."billing_reversal_case"."original_gross_minor" AND "billing"."billing_reversal_case"."initial_issued_atoms" IS NOT NULL AND "billing"."billing_reversal_case"."withheld_atoms" IS NOT NULL AND "billing"."billing_reversal_case"."currency" IS NOT NULL AND "billing"."billing_reversal_case"."stripe_account_id" IS NOT NULL AND "billing"."billing_reversal_case"."livemode" IS NOT NULL AND "billing"."billing_reversal_case"."charge_id" IS NOT NULL AND "billing"."billing_reversal_case"."payment_intent_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "billing"."billing_reversal_case" ADD CONSTRAINT "billing_reversal_bounds" CHECK ("billing"."billing_reversal_case"."original_atoms" >= 0 AND "billing"."billing_reversal_case"."net_applied_atoms" BETWEEN 0 AND coalesce("billing"."billing_reversal_case"."initial_issued_atoms","billing"."billing_reversal_case"."original_atoms") + "billing"."billing_reversal_case"."deferred_issued_atoms" AND num_nonnulls("billing"."billing_reversal_case"."purchase_id", "billing"."billing_reversal_case"."period_id") = 1 AND "billing"."billing_reversal_case"."source" IN ('plan','purchased'));--> statement-breakpoint
ALTER TABLE "billing"."credit_transaction" ADD CONSTRAINT "credit_transaction_cause" CHECK (("billing"."credit_transaction"."kind" = 'operation_resolution' AND "billing"."credit_transaction"."operation_id" IS NOT NULL AND num_nonnulls("billing"."credit_transaction"."purchase_id","billing"."credit_transaction"."period_id","billing"."credit_transaction"."reversal_case_id","billing"."credit_transaction"."promotion_issuance_id","billing"."credit_transaction"."correction_of") = 0) OR ("billing"."credit_transaction"."kind" = 'purchase_grant' AND "billing"."credit_transaction"."purchase_id" IS NOT NULL AND num_nonnulls("billing"."credit_transaction"."operation_id","billing"."credit_transaction"."period_id","billing"."credit_transaction"."reversal_case_id","billing"."credit_transaction"."promotion_issuance_id","billing"."credit_transaction"."correction_of") = 0) OR ("billing"."credit_transaction"."kind" = 'period_grant' AND "billing"."credit_transaction"."period_id" IS NOT NULL AND num_nonnulls("billing"."credit_transaction"."operation_id","billing"."credit_transaction"."purchase_id","billing"."credit_transaction"."reversal_case_id","billing"."credit_transaction"."promotion_issuance_id","billing"."credit_transaction"."correction_of") = 0) OR ("billing"."credit_transaction"."kind" = 'promotion_grant' AND "billing"."credit_transaction"."promotion_issuance_id" IS NOT NULL AND num_nonnulls("billing"."credit_transaction"."operation_id","billing"."credit_transaction"."purchase_id","billing"."credit_transaction"."period_id","billing"."credit_transaction"."reversal_case_id","billing"."credit_transaction"."correction_of") = 0) OR ("billing"."credit_transaction"."kind" = 'reversal' AND "billing"."credit_transaction"."reversal_case_id" IS NOT NULL AND num_nonnulls("billing"."credit_transaction"."operation_id","billing"."credit_transaction"."purchase_id","billing"."credit_transaction"."period_id","billing"."credit_transaction"."promotion_issuance_id","billing"."credit_transaction"."correction_of") = 0) OR ("billing"."credit_transaction"."kind" = 'deferred_grant' AND "billing"."credit_transaction"."reversal_case_id" IS NOT NULL AND "billing"."credit_transaction"."correction_of" IS NOT NULL AND "billing"."credit_transaction"."cash_evidence" IS NOT NULL AND num_nonnulls("billing"."credit_transaction"."operation_id","billing"."credit_transaction"."purchase_id","billing"."credit_transaction"."period_id","billing"."credit_transaction"."promotion_issuance_id") = 0) OR ("billing"."credit_transaction"."kind" = 'compensation' AND "billing"."credit_transaction"."correction_of" IS NOT NULL AND num_nonnulls("billing"."credit_transaction"."purchase_id","billing"."credit_transaction"."period_id","billing"."credit_transaction"."reversal_case_id","billing"."credit_transaction"."promotion_issuance_id") = 0));