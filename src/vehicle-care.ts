export function collisionDamage(enemyHP: number, dealt: number = 0): number {
  return Math.max(0, enemyHP - dealt) * 0.05;
}
