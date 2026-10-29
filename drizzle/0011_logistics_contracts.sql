CREATE TABLE vehicle_supplies (sequence INTEGER PRIMARY KEY AUTOINCREMENT, vehicle TEXT NOT NULL UNIQUE, room TEXT NOT NULL, fuel REAL NOT NULL DEFAULT 300, ammo TEXT NOT NULL, updated REAL NOT NULL, revision INTEGER NOT NULL DEFAULT 0);
CREATE TABLE aircraft_shots (vehicle TEXT NOT NULL, shot TEXT NOT NULL, PRIMARY KEY(vehicle,shot));
CREATE TABLE access_dossiers (token TEXT PRIMARY KEY, room TEXT NOT NULL, pilot TEXT NOT NULL, target TEXT NOT NULL, seat TEXT NOT NULL, clause TEXT, position INTEGER NOT NULL DEFAULT 0, choice TEXT, active INTEGER NOT NULL DEFAULT 0);
CREATE INDEX dossier_pilot ON access_dossiers(pilot);
