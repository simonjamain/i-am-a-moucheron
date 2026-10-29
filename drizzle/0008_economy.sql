ALTER TABLE rooms ADD COLUMN dollars INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rooms ADD COLUMN upgrades TEXT NOT NULL DEFAULT '{}';
CREATE TABLE soul_rewards (room TEXT NOT NULL,soul INTEGER NOT NULL,PRIMARY KEY(room,soul));
CREATE TABLE purchase_orders (room TEXT NOT NULL,request TEXT NOT NULL,item TEXT NOT NULL,cost INTEGER NOT NULL,done INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(room,request));
CREATE TABLE equipment (room TEXT NOT NULL,slot INTEGER NOT NULL,state TEXT NOT NULL,request TEXT NOT NULL,PRIMARY KEY(room,slot),UNIQUE(room,request));
-- Static free DCA posts from older clients have no purchased installation.
UPDATE pilots SET mode='foot',state=json_remove(state,'$.turret','$.equipmentBoarding') WHERE mode='turret';
DELETE FROM turret_seats;
UPDATE pilots SET state=json_remove(state,'$.equipmentBoarding');
