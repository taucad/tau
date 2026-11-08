ALTER TABLE "storage_tombstone" ADD COLUMN "purged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "storage_tombstone" ADD COLUMN "purged_objects" bigint;--> statement-breakpoint
ALTER TABLE "storage_tombstone" ADD COLUMN "purged_bytes" bigint;