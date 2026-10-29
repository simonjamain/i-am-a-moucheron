CREATE TABLE enemy_damage (room TEXT NOT NULL, wave INTEGER NOT NULL, enemy INTEGER NOT NULL, shooter TEXT NOT NULL, shot TEXT NOT NULL, amount INTEGER NOT NULL, PRIMARY KEY(room,wave,enemy,shooter,shot));
CREATE INDEX enemy_damage_wave ON enemy_damage(room,wave,enemy);
