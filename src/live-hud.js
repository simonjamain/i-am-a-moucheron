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
      'Souris : viser · Clic / Espace : obus · Maj/Ctrl : fusée · Molette : distance · F : sauter / sortir · Espace en chute : parachute · Clic droit : zoom' +
      common
    );
  if (!vehicle)
    return (
      (dead || !airborne
        ? 'ZQSD / flèches : marcher · Clic : pistolet · Espace : jet · E : interagir'
        : 'ZQSD / flèches : diriger · Espace : parachute · Clic : pistolet') + common
    );
  if (vehicle.type === 'helicopter')
    return (
      (seat === 'pilot'
        ? 'Souris : incliner · Q/D/Gauche/Droite : roulis · Z/O/Haut : monter · S/Bas : descendre · Relâcher : stationnaire · C : vue libre · Clic : roquettes'
        : 'Souris : viser · Maj : MG · Ctrl : missile · Clic : tir / détonation') +
      ' · 1/2 : postes (contrats) · F : sauter / sortir · Espace en chute : parachute' +
      common
    );
  if (vehicle.type === 'flaktruck')
    return (
      (seat === 'pilot'
        ? 'Z/S : avancer/reculer · Q/D : tourner'
        : 'Souris : canon · Clic : obus · Molette : proximité 0,5–20 m') +
      ' · 1/2 : postes (contrats) · F : sauter / sortir · Espace en chute : parachute' +
      common
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
      ' · F : sauter / sortir · Espace en chute : parachute · Clic droit : zoom' +
      posts +
      common
    );
  return (
    (seat === 'pilot'
      ? 'Souris : cap · Maj/Ctrl : gaz · C : regard libre' +
        (vehicle.type === 'bomber' ? '' : ' · Clic : MG') +
        (vehicle.supplies?.ammo.bomb !== undefined ? ' · Espace : bombes' : '')
      : 'Souris : tourelle · Clic / Espace : MG') +
    ' · F : sauter / sortir · Espace en chute : parachute · Clic droit : zoom' +
    posts +
    common
  );
}
export function cursorStats({ vehicle, seat, hp, speed, ammo }) {
  if (!vehicle) return null;
  const bombs = seat === 'pilot' ? vehicle.supplies?.ammo.bomb : undefined;
  return {
    speed: Math.round(speed),
    hp: Math.max(0, Math.min(vehicle.type === 'helicopter' ? 200 : 100, hp)),
    ammo: Math.max(0, Math.floor(ammo || 0)),
    bombs: bombs === undefined ? null : Math.floor(bombs),
  };
}

export function cursorAmmoText({ vehicle, seat, ammo, proximity = 5, guiding = false }) {
  const count = (value) => Math.max(0, Math.floor(value || 0));
  const stock = vehicle.supplies?.ammo || {};
  const fuel = ''; // Dedicated percentage gauge beside the crosshair.
  if (vehicle.type === 'helicopter')
    return (
      (seat === 'pilot'
        ? count(stock.rocket) + ' roquettes'
        : count(stock.copilot) +
          ' balles · ' +
          count(stock.missile) +
          ' missiles' +
          (guiding ? ' · GUIDAGE' : '')) + fuel
    );
  if (vehicle.type === 'flaktruck')
    return (
      (seat === 'cannon'
        ? count(stock.proximity) + ' obus · ' + proximity.toFixed(1) + ' m'
        : 'Conducteur') + fuel
    );
  return (
    count(ammo) +
    ' balles' +
    (seat === 'pilot' && stock.bomb !== undefined ? ' · ' + count(stock.bomb) + ' bombes' : '')
  );
}
