CREATE TABLE "github_gist_preference" (
	"user_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_repository_write" (
	"connection_id" text NOT NULL,
	"repository_id" bigint NOT NULL,
	"owner_id" bigint NOT NULL,
	"authorization_version" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_repository_write_connection_id_repository_id_pk" PRIMARY KEY("connection_id","repository_id")
);
--> statement-breakpoint
ALTER TABLE "github_connection" ADD COLUMN "authorization_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "github_gist_preference" ADD CONSTRAINT "github_gist_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_repository_write" ADD CONSTRAINT "github_repository_write_connection_id_github_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."github_connection"("id") ON DELETE cascade ON UPDATE no action;