CREATE TABLE "project_share" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"visibility" text NOT NULL,
	"disabled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_share_visibility_check" CHECK ("project_share"."visibility" IN ('private', 'public'))
);
--> statement-breakpoint
CREATE TABLE "project_share_access" (
	"id" text PRIMARY KEY NOT NULL,
	"share_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"recipient_email" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "project_share_access_status_check" CHECK ("project_share_access"."status" IN ('active', 'revoked')),
	CONSTRAINT "project_share_access_email_lower_check" CHECK ("project_share_access"."recipient_email" = lower("project_share_access"."recipient_email"))
);
--> statement-breakpoint
DROP TABLE "publication_access" CASCADE;--> statement-breakpoint
ALTER TABLE "project_share" ADD CONSTRAINT "project_share_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_share" ADD CONSTRAINT "project_share_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_share_access" ADD CONSTRAINT "project_share_access_share_id_project_share_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."project_share"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_share_access" ADD CONSTRAINT "project_share_access_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_share_project_idx" ON "project_share" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_share_owner_idx" ON "project_share" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_share_access_share_email_idx" ON "project_share_access" USING btree ("share_id","recipient_email");--> statement-breakpoint
CREATE INDEX "project_share_access_recipient_idx" ON "project_share_access" USING btree ("recipient_email","created_at" desc) WHERE "project_share_access"."status" = 'active';--> statement-breakpoint
CREATE INDEX "project_share_access_owner_idx" ON "project_share_access" USING btree ("owner_id","created_at" desc);