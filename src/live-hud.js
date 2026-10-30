export function controlHints({
  vehicle,
  seat,
  dead = false,
  turret = false,
  airborne = false,
  placing = false,
  observing = false,
} = {}) {
  if (observing) return 'Observation · Accéder au purgatoire avec le bouton';
  if (placing)
    return 'ZQSD / flèches : marcher · Souris : orienter · E : poser · Échap : conserver';
  const common = ' · N : banque · H : aide · Échap : curseur';
  if (turret)
    return (
      'Souris : viser · Clic / Espace : obus · Maj/Ctrl : fusée · Molette : distance · F : sortir · Clic droit : zoom' +
      common
    );
  if (!vehicle)
    return (
      (dead || !airborne
        ? 'ZQSD / flèches : marcher · Clic : pistolet · Espace : jet · E : interagir'
        : 'ZQSD / flèches : diriger · Espace : parachute · Clic : pistolet') + common
    );
  const posts =
    vehicle.type === 'tank' || vehicle.type === 'bomber' ? ' · 1/2/3 : postes (contrats)' : '';
  if (vehicle.type === 'tank')
    return (
      (seat === 'pilot'
        ? 'Z/S : avancer/reculer · Q/D : tourner · Clic : MG'
        : seat === 'cannon'
          ? 'Souris : tourelle · Clic : canon · Espace : coaxiale · Maj HE / Ctrl AP · C : observer'
          : 'Souris : tourelle · Clic / Espace : MG') +
      ' · F : sortir · Clic droit : zoom' +
      posts +
      common
    );
  return (
    (seat === 'pilot'
      ? 'Souris : cap · Z/S : tangage · Q/D : roulis · A/E : gouverne · Maj/Ctrl : gaz · C : regard libre · M : manuel' +
        (vehicle.type === 'bomber' ? '' : ' · Clic : MG') +
        (vehicle.supplies?.ammo.bomb !== undefined ? ' · Espace : bombes' : '')
      : 'Souris : tourelle · Clic / Espace : MG') +
    ' · F : sortir · Clic droit : zoom' +
    posts +
    common
  );
}
export function cursorStats({ vehicle, seat, hp, speed, ammo }) {
  if (!vehicle) return null;
  const bombs = seat === 'pilot' ? vehicle.supplies?.ammo.bomb : undefined;
  return {
    speed: Math.round(speed),
    hp: Math.max(0, Math.min(100, hp)),
    ammo: Math.max(0, Math.floor(ammo || 0)),
    bombs: bombs === undefined ? null : Math.floor(bombs),
  };
}
