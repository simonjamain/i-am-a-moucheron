ALTER TABLE rooms ADD COLUMN purgatory TEXT NOT NULL DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE rooms ADD COLUMN purg_revision INTEGER NOT NULL DEFAULT 0;
