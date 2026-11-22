export function collisionDamage(enemyHP, dealt = 0) {
  return Math.max(0, enemyHP - dealt) * 0.05;
}
