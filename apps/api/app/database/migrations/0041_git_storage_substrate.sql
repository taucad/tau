CREATE TABLE "project_collaborator" (
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"invited_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_collaborator_project_id_user_id_pk" PRIMARY KEY("project_id","user_id"),
	CONSTRAINT "project_collaborator_role_check" CHECK ("project_collaborator"."role" IN ('read', 'write'))
);
--> statement-breakpoint
CREATE TABLE "project_invitation" (
	"project_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" text,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_invitation_project_id_email_pk" PRIMARY KEY("project_id","email"),
	CONSTRAINT "project_invitation_role_check" CHECK ("project_invitation"."role" IN ('read', 'write')),
	CONSTRAINT "project_invitation_email_lower_check" CHECK ("project_invitation"."email" = lower("project_invitation"."email"))
);
--> statement-breakpoint
CREATE TABLE "storage_account" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"provider" text NOT NULL,
	"endpoint" text NOT NULL,
	"region" text,
	"bucket" text NOT NULL,
	"prefix" text DEFAULT '' NOT NULL,
	"credentials_ref" text,
	"capabilities" jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "storage_account_status_check" CHECK ("storage_account"."status" IN ('active', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE "storage_tombstone" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"purge_after" timestamp with time zone NOT NULL,
	"erasure" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "storage_account_id" text;--> statement-breakpoint
ALTER TABLE "project_git" ADD COLUMN "generation" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "project_git" ADD COLUMN "derived_generation" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "project_git" ADD COLUMN "copied_generation" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "project_collaborator" ADD CONSTRAINT "project_collaborator_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_collaborator" ADD CONSTRAINT "project_collaborator_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_collaborator" ADD CONSTRAINT "project_collaborator_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_invitation" ADD CONSTRAINT "project_invitation_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_invitation" ADD CONSTRAINT "project_invitation_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_invitation" ADD CONSTRAINT "project_invitation_accepted_by_user_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_account" ADD CONSTRAINT "storage_account_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_collaborator_user_idx" ON "project_collaborator" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_invitation_token_hash_idx" ON "project_invitation" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "storage_account_owner_idx" ON "storage_account" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "storage_tombstone_purge_after_idx" ON "storage_tombstone" USING btree ("purge_after");--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_storage_account_id_storage_account_id_fk" FOREIGN KEY ("storage_account_id") REFERENCES "public"."storage_account"("id") ON DELETE no action ON UPDATE no action;