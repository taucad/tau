CREATE TABLE "credit_account" (
	"user_id" text PRIMARY KEY NOT NULL,
	"grant_balance_micro" bigint DEFAULT 0 NOT NULL,
	"topup_balance_micro" bigint DEFAULT 0 NOT NULL,
	"reserved_micro" bigint DEFAULT 0 NOT NULL,
	"monthly_grant_micro" bigint DEFAULT 0 NOT NULL,
	"rollover_ceiling_micro" bigint DEFAULT 0 NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"last_granted_at" timestamp,
	"notified_80_at" timestamp,
	"notified_95_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_reservation" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"reserved_micro" bigint NOT NULL,
	"input_floor_micro" bigint DEFAULT 0 NOT NULL,
	"chat_id" text,
	"turn_id" text NOT NULL,
	"model_id" text NOT NULL,
	"category" text DEFAULT 'llm' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_transaction" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"delta_micro" bigint NOT NULL,
	"balance_after_micro" bigint NOT NULL,
	"reason" text NOT NULL,
	"category" text,
	"stripe_event_id" text,
	"chat_id" text,
	"model_id" text,
	"tool_call_id" text,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "credit_tx_reason_check" CHECK ("credit_transaction"."reason" IN ('monthly_grant', 'topup', 'commit', 'sweep_floor', 'adjustment')),
	CONSTRAINT "credit_tx_category_check" CHECK ("credit_transaction"."category" IS NULL OR "credit_transaction"."category" IN ('llm', 'zoo_engine', 'geospec_hosted', 'solver_orchestration'))
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"plan" text NOT NULL,
	"reference_id" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"status" text DEFAULT 'incomplete' NOT NULL,
	"period_start" timestamp,
	"period_end" timestamp,
	"trial_start" timestamp,
	"trial_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false,
	"cancel_at" timestamp,
	"canceled_at" timestamp,
	"ended_at" timestamp,
	"seats" integer,
	"billing_interval" text,
	"stripe_schedule_id" text
);
--> statement-breakpoint
CREATE TABLE "subscription_extension" (
	"subscription_id" text PRIMARY KEY NOT NULL,
	"overrides" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "credit_account" ADD CONSTRAINT "credit_account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_reservation" ADD CONSTRAINT "credit_reservation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transaction" ADD CONSTRAINT "credit_transaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_extension" ADD CONSTRAINT "subscription_extension_subscription_id_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscription"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_res_user_idx" ON "credit_reservation" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE INDEX "credit_tx_user_idx" ON "credit_transaction" USING btree ("user_id","created_at" desc);--> statement-breakpoint
CREATE UNIQUE INDEX "credit_tx_stripe_event_idx" ON "credit_transaction" USING btree ("stripe_event_id") WHERE "credit_transaction"."stripe_event_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "subscription_reference_idx" ON "subscription" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "subscription_stripe_idx" ON "subscription" USING btree ("stripe_subscription_id");