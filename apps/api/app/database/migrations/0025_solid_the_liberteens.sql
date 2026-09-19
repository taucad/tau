CREATE TABLE "billing"."billing_provider_leg" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"environment" text NOT NULL,
	"customer_binding_id" text NOT NULL,
	"purchase_id" text,
	"subscription_id" text,
	"kind" text NOT NULL,
	"request_id" text NOT NULL,
	"request_hash" text NOT NULL,
	"request" jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatch_started_at" timestamp with time zone,
	"provider_object_id" text,
	"redirect_url" text,
	"state" text DEFAULT 'prepared' NOT NULL,
	"cancellation_requested_at" timestamp with time zone,
	"cancellation_confirmed_at" timestamp with time zone,
	"no_charge_evidence" jsonb,
	"error_code" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_provider_leg_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "billing_provider_request" UNIQUE("account_id","kind","request_id"),
	CONSTRAINT "billing_provider_object" UNIQUE("customer_binding_id","kind","provider_object_id"),
	CONSTRAINT "billing_provider_redirect_bound" CHECK ("billing"."billing_provider_leg"."redirect_url" IS NULL OR length("billing"."billing_provider_leg"."redirect_url") <= 4096),
	CONSTRAINT "billing_provider_leg_kind" CHECK (("billing"."billing_provider_leg"."kind" IN ('customer','portal') AND "billing"."billing_provider_leg"."purchase_id" IS NULL AND "billing"."billing_provider_leg"."subscription_id" IS NULL) OR ("billing"."billing_provider_leg"."kind" IN ('checkout_payment','payment_intent') AND "billing"."billing_provider_leg"."purchase_id" IS NOT NULL AND "billing"."billing_provider_leg"."subscription_id" IS NULL) OR ("billing"."billing_provider_leg"."kind" = 'checkout_subscription' AND "billing"."billing_provider_leg"."purchase_id" IS NULL AND "billing"."billing_provider_leg"."subscription_id" IS NOT NULL)),
	CONSTRAINT "billing_provider_no_charge" CHECK ("billing"."billing_provider_leg"."state" <> 'no_charge' OR "billing"."billing_provider_leg"."dispatch_started_at" IS NULL OR ("billing"."billing_provider_leg"."kind" = 'payment_intent' AND "billing"."billing_provider_leg"."no_charge_evidence" IS NOT NULL AND "billing"."billing_provider_leg"."cancellation_confirmed_at" IS NOT NULL)),
	CONSTRAINT "billing_provider_known" CHECK ("billing"."billing_provider_leg"."state" <> 'known' OR "billing"."billing_provider_leg"."provider_object_id" IS NOT NULL),
	CONSTRAINT "billing_provider_dispatch" CHECK (("billing"."billing_provider_leg"."state" = 'prepared' AND "billing"."billing_provider_leg"."dispatch_started_at" IS NULL) OR "billing"."billing_provider_leg"."state" = 'no_charge' OR ("billing"."billing_provider_leg"."state" IN ('dispatched','known','attention') AND "billing"."billing_provider_leg"."dispatch_started_at" IS NOT NULL)),
	CONSTRAINT "billing_provider_leg_state" CHECK ("billing"."billing_provider_leg"."state" IN ('prepared','dispatched','known','attention','no_charge') AND ("billing"."billing_provider_leg"."cancellation_confirmed_at" IS NULL OR "billing"."billing_provider_leg"."cancellation_requested_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "billing"."billing_stripe_customer" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"environment" text NOT NULL,
	"stripe_account_id" text NOT NULL,
	"livemode" boolean NOT NULL,
	"stripe_customer_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_stripe_customer_owner_id" UNIQUE("account_id","id"),
	CONSTRAINT "billing_stripe_customer_slot" UNIQUE("account_id","environment","stripe_account_id","livemode"),
	CONSTRAINT "billing_stripe_customer_remote" UNIQUE("stripe_account_id","livemode","stripe_customer_id")
);
--> statement-breakpoint
CREATE TABLE "billing"."billing_stripe_source" (
	"id" text PRIMARY KEY NOT NULL,
	"environment" text NOT NULL,
	"stripe_account_id" text NOT NULL,
	"livemode" boolean NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"generation" bigint DEFAULT 0 NOT NULL,
	"lease_until" timestamp with time zone,
	"state" text DEFAULT 'pending' NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error_code" text,
	CONSTRAINT "billing_stripe_source_identity" UNIQUE("environment","stripe_account_id","livemode","source_type","source_id"),
	CONSTRAINT "billing_stripe_source_state" CHECK ("billing"."billing_stripe_source"."state" IN ('pending','processing','done') AND "billing"."billing_stripe_source"."generation" >= 0)
);
--> statement-breakpoint
CREATE TABLE "billing"."stripe_event_inbox" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"environment" text NOT NULL,
	"stripe_account_id" text NOT NULL,
	"livemode" boolean NOT NULL,
	"api_version" text NOT NULL,
	"event_type" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"event_created_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload_digest" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error_code" text,
	"claim_generation" bigint DEFAULT 0 NOT NULL,
	"lease_until" timestamp with time zone,
	CONSTRAINT "stripe_event_delivery" UNIQUE("environment","stripe_account_id","livemode","event_id"),
	CONSTRAINT "stripe_event_state" CHECK ("billing"."stripe_event_inbox"."state" IN ('pending','processing','done') AND "billing"."stripe_event_inbox"."attempts" >= 0 AND "billing"."stripe_event_inbox"."claim_generation" >= 0)
);
--> statement-breakpoint
ALTER TABLE "billing"."billing_period" ADD COLUMN "subscription_id" text;--> statement-breakpoint
ALTER TABLE "billing"."billing_period" ADD COLUMN "invoice_id" text;--> statement-breakpoint
ALTER TABLE "billing"."billing_period" ADD COLUMN "offer_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "billing"."billing_period" ADD COLUMN "paid_evidence" jsonb;--> statement-breakpoint
ALTER TABLE "billing"."billing_period" ADD COLUMN "state" text DEFAULT 'verified' NOT NULL;--> statement-breakpoint
ALTER TABLE "billing"."billing_period" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing"."billing_period" ADD COLUMN "receipt_id" text;--> statement-breakpoint
ALTER TABLE "billing"."billing_period" ADD COLUMN "granted_atoms" bigint;--> statement-breakpoint
ALTER TABLE "billing"."billing_period" ADD COLUMN "fulfilled_revision" bigint;--> statement-breakpoint
ALTER TABLE "billing"."billing_purchase" ADD COLUMN "customer_binding_id" text;--> statement-breakpoint
ALTER TABLE "billing"."billing_purchase" ADD COLUMN "request_id" text;--> statement-breakpoint
ALTER TABLE "billing"."billing_purchase" ADD COLUMN "request_hash" text;--> statement-breakpoint
ALTER TABLE "billing"."billing_purchase" ADD COLUMN "return_path" text;--> statement-breakpoint
ALTER TABLE "billing"."billing_purchase" ADD COLUMN "purpose" text;--> statement-breakpoint
ALTER TABLE "billing"."billing_purchase" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "billing"."billing_purchase" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "billing"."billing_purchase" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing"."billing_purchase" ADD COLUMN "paid_evidence" jsonb;--> statement-breakpoint
ALTER TABLE "billing"."billing_purchase" ADD COLUMN "payment_intent_id" text;--> statement-breakpoint
ALTER TABLE "billing"."billing_purchase" ADD COLUMN "charge_id" text;--> statement-breakpoint
ALTER TABLE "billing"."billing_purchase" ADD COLUMN "stripe_account_id" text;--> statement-breakpoint
ALTER TABLE "billing"."billing_purchase" ADD COLUMN "livemode" boolean;--> statement-breakpoint
ALTER TABLE "billing"."billing_purchase" ADD COLUMN "fulfilled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing"."billing_purchase" ADD COLUMN "receipt_id" text;--> statement-breakpoint
ALTER TABLE "billing"."billing_purchase" ADD COLUMN "granted_atoms" bigint;--> statement-breakpoint
ALTER TABLE "billing"."billing_purchase" ADD COLUMN "fulfilled_revision" bigint;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "account_id" text;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "environment" text;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "customer_binding_id" text;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "request_id" text;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "request_hash" text;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "offer_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "slot_state" text;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "paid_through" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "failed_renewal_invoice_id" text;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "dunning_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "grace_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "billing"."billing_provider_leg" ADD CONSTRAINT "billing_provider_leg_environment_account_id_credit_account_environment_id_fk" FOREIGN KEY ("environment","account_id") REFERENCES "billing"."credit_account"("environment","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_provider_leg" ADD CONSTRAINT "billing_provider_leg_account_id_customer_binding_id_billing_stripe_customer_account_id_id_fk" FOREIGN KEY ("account_id","customer_binding_id") REFERENCES "billing"."billing_stripe_customer"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_provider_leg" ADD CONSTRAINT "billing_provider_leg_account_id_purchase_id_billing_purchase_account_id_id_fk" FOREIGN KEY ("account_id","purchase_id") REFERENCES "billing"."billing_purchase"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing"."billing_stripe_customer" ADD CONSTRAINT "billing_stripe_customer_environment_account_id_credit_account_environment_id_fk" FOREIGN KEY ("environment","account_id") REFERENCES "billing"."credit_account"("environment","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_provider_active_purchase" ON "billing"."billing_provider_leg" USING btree ("purchase_id") WHERE "billing"."billing_provider_leg"."state" <> 'no_charge';--> statement-breakpoint
CREATE INDEX "billing_stripe_source_due" ON "billing"."billing_stripe_source" USING btree ("next_attempt_at","id") WHERE "billing"."billing_stripe_source"."state" <> 'done';--> statement-breakpoint
CREATE INDEX "stripe_event_due" ON "billing"."stripe_event_inbox" USING btree ("next_attempt_at","id") WHERE "billing"."stripe_event_inbox"."state" <> 'done';--> statement-breakpoint
ALTER TABLE "billing"."billing_purchase" ADD CONSTRAINT "billing_purchase_account_id_customer_binding_id_billing_stripe_customer_account_id_id_fk" FOREIGN KEY ("account_id","customer_binding_id") REFERENCES "billing"."billing_stripe_customer"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_account_id_credit_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "billing"."credit_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_customer_binding_id_billing_stripe_customer_id_fk" FOREIGN KEY ("customer_binding_id") REFERENCES "billing"."billing_stripe_customer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_purchase_manual_pending" ON "billing"."billing_purchase" USING btree ("account_id") WHERE "billing"."billing_purchase"."purpose" IN ('manual_checkout','manual_saved_card') AND "billing"."billing_purchase"."state" IN ('prepared','creating','pending','attention','paid_unfulfilled');--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_active_slot" ON "subscription" USING btree ("account_id") WHERE "subscription"."slot_state" IN ('pending','current','attention');--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_owned_source" ON "subscription" USING btree ("customer_binding_id","stripe_subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_owned_request" ON "subscription" USING btree ("account_id","request_id");--> statement-breakpoint
ALTER TABLE "billing"."billing_period" ADD CONSTRAINT "billing_period_invoice_id_unique" UNIQUE("invoice_id");--> statement-breakpoint
ALTER TABLE "billing"."billing_period" ADD CONSTRAINT "billing_period_entitlement" UNIQUE("subscription_id","period_start","period_end");--> statement-breakpoint
ALTER TABLE "billing"."billing_purchase" ADD CONSTRAINT "billing_purchase_request" UNIQUE("account_id","purpose","request_id");--> statement-breakpoint
ALTER TABLE "billing"."billing_purchase" ADD CONSTRAINT "billing_purchase_payment" UNIQUE("stripe_account_id","livemode","payment_intent_id");--> statement-breakpoint
ALTER TABLE "billing"."billing_purchase" ADD CONSTRAINT "billing_purchase_charge" UNIQUE("stripe_account_id","livemode","charge_id");--> statement-breakpoint
ALTER TABLE "billing"."credit_transaction" ADD CONSTRAINT "credit_transaction_purchase_receipt" UNIQUE("account_id","purchase_id","id");--> statement-breakpoint
ALTER TABLE "billing"."credit_transaction" ADD CONSTRAINT "credit_transaction_period_receipt" UNIQUE("account_id","period_id","id");--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_account_id" UNIQUE("account_id","id");--> statement-breakpoint
ALTER TABLE "billing"."billing_period" ADD CONSTRAINT "billing_period_verified" CHECK ("billing"."billing_period"."subscription_id" IS NULL OR ("billing"."billing_period"."offer_snapshot" IS NOT NULL AND "billing"."billing_period"."paid_evidence" IS NOT NULL AND "billing"."billing_period"."paid_at" IS NOT NULL AND "billing"."billing_period"."invoice_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "billing"."billing_period" ADD CONSTRAINT "billing_period_receipt" CHECK (("billing"."billing_period"."state" = 'verified' AND "billing"."billing_period"."receipt_id" IS NULL AND "billing"."billing_period"."granted_atoms" IS NULL AND "billing"."billing_period"."fulfilled_revision" IS NULL) OR ("billing"."billing_period"."state" = 'fulfilled' AND "billing"."billing_period"."receipt_id" IS NOT NULL AND "billing"."billing_period"."granted_atoms" IS NOT NULL AND "billing"."billing_period"."granted_atoms" BETWEEN 0 AND "billing"."billing_period"."credit_atoms" AND "billing"."billing_period"."fulfilled_revision" IS NOT NULL AND "billing"."billing_period"."fulfilled_revision" > 0));--> statement-breakpoint
ALTER TABLE "billing"."billing_purchase" ADD CONSTRAINT "billing_purchase_lifecycle" CHECK ("billing"."billing_purchase"."state" IN ('prepared','creating','pending','attention','paid','paid_unfulfilled','fulfilled','failed','canceled'));--> statement-breakpoint
ALTER TABLE "billing"."billing_purchase" ADD CONSTRAINT "billing_purchase_verified" CHECK ("billing"."billing_purchase"."state" NOT IN ('paid_unfulfilled','fulfilled') OR ("billing"."billing_purchase"."paid_evidence" IS NOT NULL AND "billing"."billing_purchase"."paid_at" IS NOT NULL AND "billing"."billing_purchase"."payment_intent_id" IS NOT NULL AND "billing"."billing_purchase"."charge_id" IS NOT NULL AND "billing"."billing_purchase"."customer_binding_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "billing"."billing_purchase" ADD CONSTRAINT "billing_purchase_owned" CHECK ("billing"."billing_purchase"."purpose" IS NULL OR ("billing"."billing_purchase"."purpose" IN ('manual_checkout','manual_saved_card','automatic') AND "billing"."billing_purchase"."customer_binding_id" IS NOT NULL AND "billing"."billing_purchase"."request_id" IS NOT NULL AND "billing"."billing_purchase"."request_hash" IS NOT NULL AND "billing"."billing_purchase"."stripe_account_id" IS NOT NULL AND "billing"."billing_purchase"."livemode" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "billing"."billing_purchase" ADD CONSTRAINT "billing_purchase_receipt" CHECK (("billing"."billing_purchase"."state" <> 'fulfilled' AND "billing"."billing_purchase"."receipt_id" IS NULL AND "billing"."billing_purchase"."granted_atoms" IS NULL AND "billing"."billing_purchase"."fulfilled_revision" IS NULL AND "billing"."billing_purchase"."fulfilled_at" IS NULL) OR ("billing"."billing_purchase"."state" = 'fulfilled' AND "billing"."billing_purchase"."receipt_id" IS NOT NULL AND "billing"."billing_purchase"."granted_atoms" IS NOT NULL AND "billing"."billing_purchase"."granted_atoms" BETWEEN 0 AND "billing"."billing_purchase"."credit_atoms" AND "billing"."billing_purchase"."fulfilled_revision" IS NOT NULL AND "billing"."billing_purchase"."fulfilled_revision" > 0 AND "billing"."billing_purchase"."fulfilled_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_financial_state" CHECK ("subscription"."account_id" IS NULL OR ("subscription"."environment" IS NOT NULL AND "subscription"."customer_binding_id" IS NOT NULL AND "subscription"."offer_snapshot" IS NOT NULL AND "subscription"."request_id" IS NOT NULL AND "subscription"."request_hash" IS NOT NULL AND "subscription"."slot_state" IN ('pending','current','attention','ended')));--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_grace" CHECK (("subscription"."failed_renewal_invoice_id" IS NULL AND "subscription"."dunning_started_at" IS NULL AND "subscription"."grace_ends_at" IS NULL) OR ("subscription"."failed_renewal_invoice_id" IS NOT NULL AND "subscription"."dunning_started_at" IS NOT NULL AND "subscription"."grace_ends_at" = "subscription"."dunning_started_at" + interval '7 days'));