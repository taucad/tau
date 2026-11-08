CREATE TABLE "blob_ref" (
	"sha256" text PRIMARY KEY NOT NULL,
	"size_bytes" bigint NOT NULL,
	"refcount" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"origin" text DEFAULT 'local-mirror' NOT NULL,
	"forked_from" text,
	"current_publication_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publication" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"parent_publication_id" text,
	"visibility" text NOT NULL,
	"manifest_key" text NOT NULL,
	"og_image_key" text,
	"thumbnail_key" text,
	"runtime_pin" text NOT NULL,
	"kernels" text[] NOT NULL,
	"entry_file" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"owner_snapshot" jsonb,
	"fork_count" integer DEFAULT 0 NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"unpublished_at" timestamp,
	CONSTRAINT "publication_visibility_check" CHECK ("publication"."visibility" IN ('private', 'public'))
);
--> statement-breakpoint
CREATE TABLE "publication_access" (
	"id" text PRIMARY KEY NOT NULL,
	"publication_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"recipient_email" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	CONSTRAINT "publication_access_status_check" CHECK ("publication_access"."status" IN ('active', 'revoked')),
	CONSTRAINT "publication_access_email_lower_check" CHECK ("publication_access"."recipient_email" = lower("publication_access"."recipient_email"))
);
--> statement-breakpoint
ALTER TABLE "build" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "build" CASCADE;--> statement-breakpoint
ALTER TABLE "apikey" RENAME COLUMN "user_id" TO "reference_id";--> statement-breakpoint
ALTER TABLE "apikey" DROP CONSTRAINT "apikey_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "apikey" ADD COLUMN "config_id" text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_forked_from_publication_id_fk" FOREIGN KEY ("forked_from") REFERENCES "public"."publication"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_current_publication_id_publication_id_fk" FOREIGN KEY ("current_publication_id") REFERENCES "public"."publication"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication" ADD CONSTRAINT "publication_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication" ADD CONSTRAINT "publication_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication" ADD CONSTRAINT "publication_parent_publication_id_publication_id_fk" FOREIGN KEY ("parent_publication_id") REFERENCES "public"."publication"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_access" ADD CONSTRAINT "publication_access_publication_id_publication_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publication"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_access" ADD CONSTRAINT "publication_access_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "publication_project_idx" ON "publication" USING btree ("project_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "publication_owner_idx" ON "publication" USING btree ("owner_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "publication_public_visibility_idx" ON "publication" USING btree ("visibility","created_at" desc) WHERE "publication"."visibility" = 'public' AND "publication"."unpublished_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "publication_access_publication_email_idx" ON "publication_access" USING btree ("publication_id","recipient_email");--> statement-breakpoint
CREATE INDEX "publication_access_recipient_idx" ON "publication_access" USING btree ("recipient_email","created_at" desc) WHERE "publication_access"."status" = 'active';--> statement-breakpoint
CREATE INDEX "publication_access_owner_idx" ON "publication_access" USING btree ("owner_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "apikey_configId_idx" ON "apikey" USING btree ("config_id");--> statement-breakpoint
CREATE INDEX "apikey_referenceId_idx" ON "apikey" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "apikey_key_idx" ON "apikey" USING btree ("key");