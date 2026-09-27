CREATE TABLE "billing"."credit_attempt_void" (
	"account_id" text NOT NULL,
	"environment" text NOT NULL,
	"surface" text NOT NULL,
	"attempt_key" text NOT NULL,
	"voided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_attempt_void_account_id_surface_attempt_key_pk" PRIMARY KEY("account_id","surface","attempt_key")
);
--> statement-breakpoint
ALTER TABLE "billing"."credit_attempt_void" ADD CONSTRAINT "credit_attempt_void_environment_account_id_credit_account_environment_id_fk" FOREIGN KEY ("environment","account_id") REFERENCES "billing"."credit_account"("environment","id") ON DELETE restrict ON UPDATE no action;