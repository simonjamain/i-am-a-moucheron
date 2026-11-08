// Issue #106: uniform white pictograms on the ground entry circles, one per role,
// instead of letters. Drawn on a 2D canvas context, white only.
const GROUND = new Set(['tank', 'flaktruck', 'castor']);

export function seatRole(type, seat) {
  if (seat === 'pilot') return GROUND.has(type) ? 'driver' : 'pilot';
  if (seat === 'copilot') return 'copilot';
  if (seat === 'cannon') return type === 'tank' ? 'cannon' : 'gunner';
  return 'gunner';
}

export const SEAT_ROLE_NAMES = Object.freeze({
  driver: 'Conducteur',
  pilot: 'Pilote',
  copilot: 'Copilote',
  gunner: 'Mitrailleur',
  cannon: 'Canon',
});

// Draw the role pictogram centred in a size × size square.
export function drawSeatIcon(ctx, role, size = 128) {
  const c = size / 2,
    r = size * 0.34;
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = size * 0.07;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const line = (x1, y1, x2, y2) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  const circle = (x, y, radius, fill = false) => {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    if (fill) ctx.fill();
    else ctx.stroke();
  };
  if (role === 'driver') {
    // Steering wheel: rim, hub and three spokes.
    circle(c, c, r);
    circle(c, c, r * 0.22, true);
    for (const a of [Math.PI / 2, Math.PI * (7 / 6), Math.PI * (11 / 6)])
      line(c, c, c + Math.cos(a) * r, c + Math.sin(a) * r);
  } else if (role === 'pilot' || role === 'copilot') {
    // Aircraft seen from above: fuselage, wings, tail. Co-pilot adds a second seat dot.
    line(c, c - r, c, c + r);
    line(c - r, c - r * 0.1, c + r, c - r * 0.1);
    line(c - r * 0.45, c + r * 0.8, c + r * 0.45, c + r * 0.8);
    if (role === 'copilot') {
      circle(c + r * 0.62, c - r * 0.62, size * 0.07, true);
      circle(c - r * 0.62, c - r * 0.62, size * 0.07, true);
    }
  } else if (role === 'cannon') {
    // Turret with a long barrel.
    circle(c - r * 0.3, c + r * 0.2, r * 0.55);
    line(c - r * 0.3, c + r * 0.2, c + r, c - r * 0.7);
  } else {
    // Gunner: crosshair.
    circle(c, c, r * 0.75);
    line(c - r, c, c - r * 0.35, c);
    line(c + r * 0.35, c, c + r, c);
    line(c, c - r, c, c - r * 0.35);
    line(c, c + r * 0.35, c, c + r);
    circle(c, c, size * 0.04, true);
  }
  ctx.restore();
}
