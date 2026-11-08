ALTER TABLE "project" DROP CONSTRAINT "project_forked_from_publication_id_fk";
--> statement-breakpoint
ALTER TABLE "publication" DROP CONSTRAINT "publication_parent_publication_id_publication_id_fk";
--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_forked_from_publication_id_fk" FOREIGN KEY ("forked_from") REFERENCES "public"."publication"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication" ADD CONSTRAINT "publication_parent_publication_id_publication_id_fk" FOREIGN KEY ("parent_publication_id") REFERENCES "public"."publication"("id") ON DELETE set null ON UPDATE no action;