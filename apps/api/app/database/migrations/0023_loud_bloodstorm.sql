CREATE TABLE "billing"."billing_operation_exception" (
	"id" text PRIMARY KEY NOT NULL,
	"operation_id" text NOT NULL,
	"kind" text NOT NULL,
	"source_identity" text NOT NULL,
	"quantum" text NOT NULL,
	"observed_numerator" text NOT NULL,
	"observed_denominator" numeric(78, 0) NOT NULL,
	"maximum" numeric(78, 0) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_operation_exception_cause" UNIQUE("operation_id","kind","source_identity"),
	CONSTRAINT "billing_operation_exception_amounts" CHECK ("billing"."billing_operation_exception"."observed_numerator" ~ '^(0|[1-9][0-9]{0,255})$' AND "billing"."billing_operation_exception"."observed_denominator" > 0 AND "billing"."billing_operation_exception"."maximum" >= 0),
	CONSTRAINT "billing_operation_exception_kind" CHECK (("billing"."billing_operation_exception"."kind" = 'customer_bound' AND "billing"."billing_operation_exception"."quantum" = 'credit_atoms') OR ("billing"."billing_operation_exception"."kind" = 'supplier_bound' AND "billing"."billing_operation_exception"."quantum" = 'pico_usd'))
);
--> statement-breakpoint
ALTER TABLE "billing"."billing_operation_exception" ADD CONSTRAINT "billing_operation_exception_operation_id_credit_operation_id_fk" FOREIGN KEY ("operation_id") REFERENCES "billing"."credit_operation"("id") ON DELETE restrict ON UPDATE no action;