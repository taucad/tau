DROP INDEX "project_git_lfs_object_unfinalized_idx";--> statement-breakpoint
ALTER TABLE "project_git_lfs_object" ADD COLUMN "last_requested_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "project_git_lfs_object_unfinalized_idx" ON "project_git_lfs_object" USING btree (coalesce("last_requested_at", "created_at")) WHERE "project_git_lfs_object"."finalized_at" is null;