ALTER TABLE "subscription" DROP CONSTRAINT "subscription_financial_state";--> statement-breakpoint
-- Hand-added to the drizzle-kit diff: rows the retired @better-auth/stripe plugin wrote carry no
-- financial account (the dropped check allowed `account_id IS NULL` only for them). Nothing reads
-- them and the ledger never owned their cash, so they go before the ledger columns become NOT NULL.
-- The payment-identity trigger refuses every delete; it exists only where the release has installed
-- the billing protections, so it is lifted around this one statement when present.
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_trigger WHERE tgname = 'protect_payment_identity' AND tgrelid = 'public.subscription'::regclass) THEN
    ALTER TABLE "subscription" DISABLE TRIGGER "protect_payment_identity";
  END IF;
END $$;--> statement-breakpoint
DELETE FROM "subscription" WHERE "account_id" IS NULL;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_trigger WHERE tgname = 'protect_payment_identity' AND tgrelid = 'public.subscription'::regclass) THEN
    ALTER TABLE "subscription" ENABLE TRIGGER "protect_payment_identity";
  END IF;
END $$;--> statement-breakpoint
DROP INDEX "subscription_reference_idx";--> statement-breakpoint
ALTER TABLE "subscription" ALTER COLUMN "account_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription" ALTER COLUMN "environment" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription" ALTER COLUMN "customer_binding_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription" ALTER COLUMN "request_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription" ALTER COLUMN "request_hash" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription" ALTER COLUMN "offer_snapshot" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription" ALTER COLUMN "slot_state" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription" DROP COLUMN "reference_id";--> statement-breakpoint
ALTER TABLE "subscription" DROP COLUMN "stripe_customer_id";--> statement-breakpoint
ALTER TABLE "subscription" DROP COLUMN "period_start";--> statement-breakpoint
ALTER TABLE "subscription" DROP COLUMN "period_end";--> statement-breakpoint
ALTER TABLE "subscription" DROP COLUMN "trial_start";--> statement-breakpoint
ALTER TABLE "subscription" DROP COLUMN "trial_end";--> statement-breakpoint
ALTER TABLE "subscription" DROP COLUMN "cancel_at";--> statement-breakpoint
ALTER TABLE "subscription" DROP COLUMN "seats";--> statement-breakpoint
ALTER TABLE "subscription" DROP COLUMN "billing_interval";--> statement-breakpoint
ALTER TABLE "subscription" DROP COLUMN "stripe_schedule_id";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "stripe_customer_id";--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_slot_state" CHECK ("subscription"."slot_state" IN ('pending','current','attention','ended'));