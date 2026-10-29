CREATE TABLE turret_seats (room TEXT NOT NULL, station INTEGER NOT NULL, owner TEXT NOT NULL, PRIMARY KEY(room,station));
CREATE TABLE combat_damage (id INTEGER PRIMARY KEY AUTOINCREMENT, room TEXT NOT NULL, target TEXT NOT NULL, shooter TEXT NOT NULL, shot TEXT NOT NULL, amount INTEGER NOT NULL, created REAL NOT NULL, UNIQUE(room,shooter,shot));
CREATE INDEX combat_damage_recipient ON combat_damage(room,target,id);
