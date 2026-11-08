CREATE TABLE "agent_device" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"label" text NOT NULL,
	"credential_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp,
	"revoked_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "agent_device" ADD CONSTRAINT "agent_device_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_device_credential_hash_idx" ON "agent_device" USING btree ("credential_hash");--> statement-breakpoint
CREATE INDEX "agent_device_owner_idx" ON "agent_device" USING btree ("owner_id","created_at" desc);