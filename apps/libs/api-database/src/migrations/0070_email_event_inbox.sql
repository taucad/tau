CREATE TABLE "email_address_state" (
	"address" text PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"origin_kind" text,
	"origin_event" text NOT NULL,
	"since" timestamp with time zone NOT NULL,
	"cleared_at" timestamp with time zone,
	"cleared_by" text,
	CONSTRAINT "email_address_state_state_check" CHECK ("email_address_state"."state" IN ('bounced', 'complained', 'suppressed')),
	CONSTRAINT "email_address_state_address_lower_check" CHECK ("email_address_state"."address" = lower("email_address_state"."address"))
);
--> statement-breakpoint
CREATE TABLE "email_event" (
	"svix_id" text PRIMARY KEY NOT NULL,
	"environment" text NOT NULL,
	"type" text NOT NULL,
	"resend_email_id" text,
	"kind" text,
	"recipient" text,
	"bounce_type" text,
	"bounce_sub_type" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "email_event_received_idx" ON "email_event" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "email_event_email_idx" ON "email_event" USING btree ("resend_email_id");--> statement-breakpoint
CREATE INDEX "email_event_recipient_idx" ON "email_event" USING btree ("recipient");