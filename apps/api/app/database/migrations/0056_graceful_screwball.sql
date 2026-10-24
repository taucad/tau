CREATE TABLE "project_deletion" (
	"project_id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"storage_account_id" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"requested_by" text NOT NULL,
	"fenced_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"purge_after" timestamp with time zone,
	"purged_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"purged_objects" bigint,
	"purged_bytes" bigint,
	"retained_bytes" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "project_deletion_fenced_check" CHECK ("project_deletion"."deleted_at" IS NULL OR ("project_deletion"."fenced_at" IS NOT NULL AND "project_deletion"."purge_after" IS NOT NULL)),
	CONSTRAINT "project_deletion_purged_check" CHECK ("project_deletion"."purged_at" IS NULL OR "project_deletion"."deleted_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "project_deletion_manifest" (
	"project_id" text NOT NULL,
	"publication_id" text NOT NULL,
	"manifest_key" text NOT NULL,
	"released_at" timestamp with time zone,
	"last_error" text,
	CONSTRAINT "project_deletion_manifest_project_id_publication_id_manifest_key_pk" PRIMARY KEY("project_id","publication_id","manifest_key")
);
--> statement-breakpoint
CREATE INDEX "project_deletion_owner_idx" ON "project_deletion" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "project_deletion_pending_idx" ON "project_deletion" USING btree ("next_attempt_at") WHERE "project_deletion"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "project_deletion_purge_idx" ON "project_deletion" USING btree ("purge_after") WHERE "project_deletion"."purged_at" IS NULL;