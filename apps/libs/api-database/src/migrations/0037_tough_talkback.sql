CREATE TABLE "project_git_lfs_object" (
	"project_id" text NOT NULL,
	"oid" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_git_lfs_object_project_id_oid_pk" PRIMARY KEY("project_id","oid"),
	CONSTRAINT "project_git_lfs_object_size_nonnegative" CHECK ("project_git_lfs_object"."size_bytes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "project_git_lfs_object" ADD CONSTRAINT "project_git_lfs_object_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_git_lfs_object_pending_idx" ON "project_git_lfs_object" USING btree ("project_id","finalized_at");