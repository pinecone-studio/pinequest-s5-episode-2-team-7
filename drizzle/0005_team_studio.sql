ALTER TABLE "challenges" ADD COLUMN "time_limit_sec" integer;--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "max_attempts" integer;--> statement-breakpoint
ALTER TABLE "challenges" ADD COLUMN "assignees" jsonb;
