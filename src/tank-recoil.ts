// Visual recoil of the tank's main gun: the barrel tube (the `cannonBarrel` node, a child of the
// pitching `cannonGun` that carries the mantlet) slides back along its axis in a few hundredths of
// a second and returns to battery more slowly; the mantlet and the pivot stay where they are.
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

interface Slider {
  position: { z: number };
  userData: Record<string, unknown>;
}

/** Slide the barrel node back by `amount` of its travel (model units) along its own axis (+z). */
export function applyGunRecoil(barrel: Slider, amount: number, recoil = GUN_RECOIL): void {
  const rest = (barrel.userData.restZ ??= barrel.position.z) as number;
  barrel.position.z = rest + amount * recoil.travel;
}
