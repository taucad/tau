CREATE TABLE "mirror_drill_run" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"environment" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"outcome" text,
	"failed_checks" text[] DEFAULT '{}'::text[] NOT NULL,
	"durations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"restored_bytes" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "mirror_drill_run_outcome_known" CHECK ("mirror_drill_run"."outcome" is null or "mirror_drill_run"."outcome" in ('pass', 'fail'))
);
--> statement-breakpoint
ALTER TABLE "project_git" ADD COLUMN "copy_pending_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_git" ADD COLUMN "copy_locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_git" ADD COLUMN "copied_manifest_sha256" text;--> statement-breakpoint
ALTER TABLE "project_git_lfs_object" ADD COLUMN "copied_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "storage_tombstone" ADD COLUMN "copy_marked_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "mirror_drill_run_environment_started_idx" ON "mirror_drill_run" USING btree ("environment","started_at");--> statement-breakpoint
CREATE INDEX "project_git_copy_pending_idx" ON "project_git" USING btree ("copy_pending_since") WHERE "project_git"."copy_pending_since" is not null;--> statement-breakpoint
CREATE INDEX "project_git_copy_behind_idx" ON "project_git" USING btree ("project_id") WHERE "project_git"."generation" > "project_git"."copied_generation";--> statement-breakpoint
CREATE INDEX "project_git_copy_locked_until_idx" ON "project_git" USING btree ("copy_locked_until") WHERE "project_git"."copy_locked_until" is not null;--> statement-breakpoint
CREATE INDEX "project_git_lfs_object_copy_pending_idx" ON "project_git_lfs_object" USING btree ("project_id","finalized_at") WHERE "project_git_lfs_object"."copied_at" is null and "project_git_lfs_object"."finalized_at" is not null;