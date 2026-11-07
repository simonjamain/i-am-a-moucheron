import { BLUEPRINTS, supportsBlueprint } from './wave-blueprints.js';
import { ENEMY_TYPES } from './waves.js';
import { VEHICLES } from './fleet.js';
import { speciesSymbols, entranceLabel } from './wave-forecast-scene.js';

export function timelineColumns(groups) {
  const columns = new Map();
  for (const group of groups) {
    if (!columns.has(group.spawn)) columns.set(group.spawn, []);
    columns.get(group.spawn).push(group);
  }
  return [...columns].sort(([a], [b]) => a - b);
}

// Objects that a purchased plan currently improves (all players, issue #101).
export function compatibleCount(snap, card) {
  const objects =
    BLUEPRINTS[card].kind === 'vehicle'
      ? snap.vehicles || []
      : snap.groundDefense?.structures || [];
  return objects.filter((object) => supportsBlueprint(card, object)).length;
}

export class WaveCouncilUI {
  constructor({ document, command, releaseMouse }) {
    this.document = document;
    this.command = command;
    const el = (id) => document.getElementById(id);
    this.button = el('waveCouncilOpen');
    this.dialog = el('waveCouncil');
    this.clock = el('waveCouncilClock');
    this.timeline = el('waveTimeline');
    this.cards = el('waveCards');
    this.workshop = el('waveWorkshop');
    this.launch = el('waveCouncilLaunch');
    this.button.onclick = () => {
      releaseMouse();
      this.dialog.showModal();
      this.render();
    };
    this.launch.onclick = () => {
      if (this.snap?.preparation?.winner)
        this.command('start', { preparation: this.snap.preparation.id });
    };
    el('waveCouncilClose').onclick = () => this.dialog.close();
  }
  element(tag, text) {
    const el = this.document.createElement(tag);
    el.textContent = text;
    return el;
  }
  accept(snap, id) {
    if (this.snap?.preparation?.id !== snap.preparation?.id) {
      if (this.dialog.open) this.dialog.close();
      this.timelineKey = null;
    }
    this.snap = snap;
    this.playerId = id;
    this.button.hidden = !snap.preparation && !snap.blueprints?.length;
    if (this.button.hidden && this.dialog.open) this.dialog.close();
    if (this.dialog.open) this.render();
  }
  countdown(seconds) {
    const prep = this.snap?.preparation;
    const votes = Object.keys(prep?.votes || {}).length;
    const label = prep
      ? 'Vague ' +
        prep.wave +
        ' · ' +
        seconds +
        ' s · ' +
        (prep.winner ? 'Plan choisi' : votes + '/' + this.snap.pilots.length + ' votes')
      : 'Plans de l’équipe';
    if (this.button.textContent !== label) this.button.textContent = label;
    if (this.dialog.open && this.clock.textContent !== label) this.clock.textContent = label;
  }
  render() {
    const snap = this.snap;
    const prep = snap?.preparation;
    if (this.timelineKey !== (prep?.id || 'combat')) {
      this.timelineKey = prep?.id || 'combat';
      this.timeline.replaceChildren();
      for (const [time, groups] of timelineColumns(prep?.groups || [])) {
        const col = this.element('div', '');
        col.append(
          this.element('strong', '+' + Number(time.toFixed(2)).toLocaleString('fr-FR') + ' s'),
        );
        for (const g of groups) {
          col.append(
            this.element(
              'span',
              speciesSymbols[g.type] +
                ' ' +
                ENEMY_TYPES[g.type].name +
                ' ×' +
                g.count +
                ' · ' +
                entranceLabel(g),
            ),
          );
        }
        this.timeline.append(col);
      }
      this.timeline.hidden = !prep;
    }
    const voteKey = JSON.stringify([prep?.id, prep?.cards, prep?.votes, prep?.winner]);
    if (voteKey !== this.voteKey) {
      this.voteKey = voteKey;
      this.cards.replaceChildren();
      for (const card of prep?.cards || []) {
        const plan = BLUEPRINTS[card];
        const button = this.element('button', '');
        const voices = Object.values(prep.votes).filter((v) => v === card).length;
        const selected = prep.votes[this.playerId] === card;
        button.setAttribute('aria-pressed', String(selected));
        button.disabled = !!prep.winner;
        button.append(
          this.element('strong', plan.name),
          this.element('span', plan.description),
          this.element(
            'small',
            prep.winner === card
              ? 'Plan débloqué ✓'
              : voices + ' voix' + (selected ? ' · Votre choix' : ''),
          ),
        );
        button.onclick = () => this.command('wave-vote', { preparation: prep.id, card });
        this.cards.append(button);
      }
    }
    this.launch.hidden = !prep?.winner;
    const offers = (snap.blueprints || []).filter((card) => BLUEPRINTS[card].kind !== 'unlock');
    const active = snap.activeBlueprints || {};
    const key = JSON.stringify([
      snap.base.epoch,
      snap.blueprintLevels,
      active,
      offers.map((card) => [
        card,
        snap.lab?.enabled || snap.dollars >= BLUEPRINTS[card].cost,
        compatibleCount(snap, card),
      ]),
    ]);
    if (this.shopKey === key) return;
    this.shopKey = key;
    this.workshop.replaceChildren();
    if (!offers.length) return;
    this.workshop.append(this.element('h3', 'Améliorations de l’équipe'));
    for (const card of offers) {
      const plan = BLUEPRINTS[card];
      const owned = active[card] || 0,
        unlocked = snap.blueprintLevels?.[card] || 1;
      const row = this.element('div', '');
      row.append(
        this.element('strong', plan.name + ' · niv. ' + owned + ' / ' + unlocked),
        this.element(
          'span',
          compatibleCount(snap, card) + ' objet(s) déjà concernés · s’applique aussi aux prochains',
        ),
      );
      if (owned < unlocked) {
        const buy = this.element(
          'button',
          'Activer le niv. ' + (owned + 1) + ' · ' + plan.cost + ' $',
        );
        buy.disabled = !snap.lab?.enabled && snap.dollars < plan.cost;
        buy.onclick = () =>
          this.command('wave-buy', { blueprint: card, level: owned + 1, epoch: snap.base.epoch });
        row.append(buy);
      } else row.append(this.element('span', 'Actif pour toute l’équipe.'));
      this.workshop.append(row);
    }
  }
}
