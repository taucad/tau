--> Cutover: publications move onto the synced graph (D11, EQ5, A31, I15).
--> Upload-era publications carry no named version and no revision, so they
--> cannot be converted — only dropped. Owners re-publish from a revision.
--> This is the deliberate exception to "generate migrations, never hand-author
--> them": drizzle-kit cannot express a data cutover, and adding the two NOT NULL
--> columns below to a non-empty table would fail without it.
UPDATE "project" SET "current_publication_id" = NULL, "forked_from" = NULL;--> statement-breakpoint
DELETE FROM "publication_access";--> statement-breakpoint
DELETE FROM "publication";--> statement-breakpoint
DELETE FROM "blob_ref";--> statement-breakpoint
ALTER TABLE "publication" ADD COLUMN "tag" text NOT NULL;--> statement-breakpoint
ALTER TABLE "publication" ADD COLUMN "revision_id" text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "publication_project_tag_idx" ON "publication" USING btree ("project_id","tag");
