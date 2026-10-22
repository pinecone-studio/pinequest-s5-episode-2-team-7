ALTER TABLE "news_articles" ADD COLUMN "origin" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "news_articles" ADD COLUMN "original_title" text;--> statement-breakpoint
CREATE UNIQUE INDEX "news_source_url_idx" ON "news_articles" USING btree ("source_url");