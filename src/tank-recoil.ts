// Visual recoil of the tank's main gun: the barrel (the `cannonGun` node, which pitches) slides
// back along its axis in a few hundredths of a second and returns to battery more slowly.
// The physical counterpart is `TankRig.kick`.
export const GUN_RECOIL = Object.freeze({
  travel: 0.32, // model units, the length the barrel slides back
  back: 0.05, // s to the full recoil
  ret: 0.55, // s back to battery
});

/** Share (0..1) of the full recoil `age` seconds after the shot. */
export function recoilAmount(age: number, recoil = GUN_RECOIL): number {
  if (!(age >= 0)) return 0;
  if (age < recoil.back) return age / recoil.back;
  const u = Math.min(1, (age - recoil.back) / recoil.ret);
  return (1 - u) * (1 - u); // quick at first, then easing in
}

interface Pitched {
  position: { x: number; y: number; z: number; set(x: number, y: number, z: number): unknown };
  rotation: { x: number };
  userData: Record<string, unknown>;
}

/** Slide the gun node back by `amount` of its travel (model units), along its own axis. */
export function applyGunRecoil(gun: Pitched, amount: number, recoil = GUN_RECOIL): void {
  const rest = (gun.userData.restPosition ??= [gun.position.x, gun.position.y, gun.position.z]) as [
    number,
    number,
    number,
  ];
  const back = amount * recoil.travel,
    pitch = gun.rotation.x;
  // The barrel points to -z, turned up by `pitch` about x: backwards is (0, -sin, cos).
  gun.position.set(rest[0], rest[1] - Math.sin(pitch) * back, rest[2] + Math.cos(pitch) * back);
}
