ALTER TABLE pilots ADD vehicle_id TEXT;
ALTER TABLE pilots ADD seat TEXT;
ALTER TABLE rooms ADD mission_started INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rooms ADD next_wave_at REAL NOT NULL DEFAULT 0;
CREATE TABLE vehicles (id TEXT PRIMARY KEY, room TEXT NOT NULL, type TEXT NOT NULL, state TEXT NOT NULL, ready INTEGER NOT NULL DEFAULT 1, created REAL NOT NULL);
CREATE UNIQUE INDEX one_ready_vehicle ON vehicles(room,type) WHERE ready=1;
CREATE TABLE vehicle_seats(room TEXT NOT NULL, vehicle TEXT NOT NULL, seat TEXT NOT NULL, pilot TEXT NOT NULL, PRIMARY KEY(vehicle,seat), UNIQUE(room,pilot));
CREATE TABLE world_effects(id INTEGER PRIMARY KEY AUTOINCREMENT,room TEXT NOT NULL,shot TEXT NOT NULL,payload TEXT NOT NULL,created REAL NOT NULL,UNIQUE(room,shot));
-- Existing arena coordinates belonged to the former arbitrary world units.
-- Start fresh sessions rather than interpreting old positions as SI metres.
UPDATE rooms SET phase='prep',wave=0,started=0,infestation=0,base_state='{}',base_revision=base_revision+1,purgatory='{}',purg_revision=purg_revision+1,mission_started=0,next_wave_at=0;
DELETE FROM souls;
DELETE FROM kills;
DELETE FROM turret_seats;
UPDATE pilots SET mode='foot',life='alive',board_paper=0,state='{"p":[-1.8,0.91,2.1],"q":[0,1,0,0],"v":[0,0,0],"hp":100,"wing":1,"engine":1,"fire":false}';
