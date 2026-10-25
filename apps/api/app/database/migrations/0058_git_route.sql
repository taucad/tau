CREATE TABLE "git_route_freeze" (
	"scope" text PRIMARY KEY NOT NULL,
	"frozen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"frozen_until" timestamp with time zone NOT NULL,
	"migration_id" text NOT NULL,
	CONSTRAINT "git_route_freeze_scope_check" CHECK ("git_route_freeze"."scope" IN ('global'))
);
--> statement-breakpoint
CREATE TABLE "project_git_route" (
	"project_id" text PRIMARY KEY NOT NULL,
	"store" text DEFAULT 'r2' NOT NULL,
	"frozen_at" timestamp with time zone,
	"frozen_until" timestamp with time zone,
	"migration_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_git_route_store_check" CHECK ("project_git_route"."store" IN ('r2')),
	CONSTRAINT "project_git_route_freeze_check" CHECK ("project_git_route"."frozen_until" IS NULL OR ("project_git_route"."frozen_at" IS NOT NULL AND "project_git_route"."migration_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "project_git_route" ADD CONSTRAINT "project_git_route_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_git_route_frozen_until_idx" ON "project_git_route" USING btree ("frozen_until");