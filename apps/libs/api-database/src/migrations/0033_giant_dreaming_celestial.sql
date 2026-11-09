CREATE TABLE "billing"."billing_journal_checkpoint" (
	"id" text PRIMARY KEY NOT NULL,
	"environment" text NOT NULL,
	"stripe_account_id" text NOT NULL,
	"livemode" boolean NOT NULL,
	"incremental_occurred_at" timestamp with time zone,
	"incremental_transaction_id" text,
	"sweep_account_id" text,
	"sweep_cycles" bigint DEFAULT 0 NOT NULL,
	"generation" bigint DEFAULT 0 NOT NULL,
	"lease_until" timestamp with time zone,
	"last_completed_at" timestamp with time zone,
	CONSTRAINT "billing_journal_checkpoint_scope" UNIQUE("environment","stripe_account_id","livemode"),
	CONSTRAINT "billing_journal_checkpoint_bounds" CHECK ("billing"."billing_journal_checkpoint"."generation" >= 0 AND "billing"."billing_journal_checkpoint"."sweep_cycles" >= 0 AND num_nonnulls("billing"."billing_journal_checkpoint"."incremental_occurred_at", "billing"."billing_journal_checkpoint"."incremental_transaction_id") <> 1)
);
