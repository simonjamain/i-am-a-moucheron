import { availableShell } from './armament.js';
import { rangeReadout } from './equipment-controls.js';

const count = (value) => Math.max(0, Math.floor(value || 0));
function equipmentModel({
  vehicle,
  seat,
  turret = false,
  dead = false,
  hp = 100,
  speed = 0,
  altitude = 0,
  gas = 0,
  fuel = 0,
  ammo = 0,
  shell = 'he',
  range = 300,
  ready = true,
  stall = false,
}) {
  if (dead || (!vehicle && !turret)) return null;
  const health = `${Math.round(hp)} PV`;
  if (turret) {
    const readout = rangeReadout(range);
    return {
      scope: 'dca',
      left: ['FUSÉE', `${readout.metres.toFixed(3)} m`, 'Shift + / Ctrl −', health],
      right: [
        'ARMEMENT',
        ready ? 'PRÊT' : 'RECHARGE',
        'Obus DCA illimités',
        'Impact direct : 200 dégâts',
      ],
      readout,
    };
  }
  const tank = vehicle.type === 'tank',
    supplies = vehicle.supplies?.ammo || {},
    service = vehicle.supplies?.servicing ? 'Ravitaillement en cours' : health,
    flight = [
      tank ? 'CONDUITE' : 'VOL',
      `${Math.round(speed)} km/h`,
      `Altitude ${altitude.toFixed(2)} m · Gaz ${Math.round(gas * 100)} %`,
      `Carburant ${Math.ceil(fuel)} s · ${stall && !tank ? 'DÉCROCHAGE' : service}`,
    ],
    active = availableShell(supplies, shell),
    heavy = count(supplies[active]);
  if (tank && seat === 'cannon')
    return {
      scope: vehicle.id + ':' + seat,
      left: [
        'CANON',
        active ? active.toUpperCase() : 'VIDE',
        `HE ${count(supplies.he)} / AP ${count(supplies.ap)}`,
        `Shift HE / Ctrl AP · Clic : tirer · ${ready ? 'prêt' : 'recharge'}`,
      ],
      right: [
        'COAXIALE',
        `${count(ammo)}`,
        `Canon ${heavy} obus · ${health}`,
        'Espace : coaxiale · C maintenu : observer · Clic droit : zoom',
      ],
    };
  if (seat !== 'pilot')
    return {
      scope: vehicle.id + ':' + seat,
      left: ['VISÉE', tank ? '360°' : seat === 'tail' ? 'QUEUE' : 'DORSALE', health, service],
      right: [
        'MITRAILLEUSE',
        `${count(ammo)}`,
        tank ? 'Supérieure · 75 dégâts' : 'Réserve du poste',
        'Clic / Espace : tir · Clic droit : zoom',
      ],
    };
  return {
    scope: vehicle.id + ':' + seat,
    left: flight,
    right: [
      'ARMEMENT',
      supplies.bomb === undefined ? `${count(ammo)}` : `${count(supplies.bomb)} bombes`,
      supplies.bomb === undefined
        ? `Mitrailleuse · ${count(ammo)} balles`
        : `Espace : largage · ${ready ? 'prêt' : 'recharge'}`,
      supplies.pilot === undefined ? 'Espace maintenu : bombes' : `MG ${count(ammo)} · Clic`,
    ],
  };
}

export function equipmentHUD(options) {
  const model = equipmentModel(options);
  if (model)
    model.alert = [
      Math.floor((options.hp ?? 100) / 10),
      options.fuel < 30,
      !!options.stall,
      options.ammo < 1,
      !!options.vehicle?.supplies?.servicing,
    ].join(':');
  return model;
}

// Details open for a short time on meaningful changes; per-frame speed updates
// must not keep them expanded indefinitely.
export class ContextHUD {
  constructor(root, clock = () => performance.now()) {
    this.root = root;
    this.clock = clock;
    this.signature = '';
    this.until = 0;
  }
  update(model) {
    this.root.classList.toggle('hidden', !model);
    if (!model) {
      this.signature = '';
      return;
    }
    const signature = JSON.stringify([
      model.scope,
      model.left[0],
      model.right[0],
      model.scope.endsWith(':cannon') ? model.left[1] : null,
      model.readout?.metres,
      model.alert,
    ]);
    if (signature !== this.signature) {
      this.signature = signature;
      this.until = this.clock() + 2500;
    }
    this.root.classList.toggle('expanded', this.clock() < this.until);
    for (const side of ['left', 'right'])
      model[side].forEach((value, i) => {
        const el = this.root.querySelector(`[data-hud="${side}-${i}"]`);
        if (el.textContent !== value) el.textContent = value;
      });
  }
  reveal() {
    this.until = this.clock() + 2500;
  }
}
