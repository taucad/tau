CREATE TABLE "project_git" (
	"project_id" text PRIMARY KEY NOT NULL,
	"storage_bytes" bigint DEFAULT 0 NOT NULL,
	"lfs_bytes" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_git" ADD CONSTRAINT "project_git_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;