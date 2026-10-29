CREATE TABLE signals (id INTEGER PRIMARY KEY AUTOINCREMENT, room TEXT NOT NULL, sender TEXT NOT NULL, recipient TEXT NOT NULL, payload TEXT NOT NULL, created REAL NOT NULL);
--> statement-breakpoint
CREATE INDEX signals_recipient ON signals(room,recipient,id);
--> statement-breakpoint
CREATE INDEX signals_expiry ON signals(created);
