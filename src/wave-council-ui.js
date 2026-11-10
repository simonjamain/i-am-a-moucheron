import { ENEMY_TYPES } from './waves.js';
import { speciesSymbols, entranceLabel } from './wave-forecast-scene.js';

export function timelineColumns(groups) {
  const columns = new Map();
  for (const group of groups) {
    if (!columns.has(group.spawn)) columns.set(group.spawn, []);
    columns.get(group.spawn).push(group);
  }
  return [...columns].sort(([a], [b]) => a - b);
}

// Announcement of the next wave: its groups, entrances and timing, with an
// early launch open to every player (no vote, no team plans).
export class WaveCouncilUI {
  constructor({ document, command, releaseMouse }) {
    this.document = document;
    this.command = command;
    const el = (id) => document.getElementById(id);
    this.button = el('waveCouncilOpen');
    this.dialog = el('waveCouncil');
    this.clock = el('waveCouncilClock');
    this.timeline = el('waveTimeline');
    this.launch = el('waveCouncilLaunch');
    this.button.onclick = () => {
      releaseMouse();
      this.dialog.showModal();
      this.render();
    };
    this.launch.onclick = () => {
      if (this.snap?.preparation) this.command('start', { preparation: this.snap.preparation.id });
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
    this.button.hidden = !snap.preparation;
    if (this.button.hidden && this.dialog.open) this.dialog.close();
    if (this.dialog.open) this.render();
  }
  countdown(seconds) {
    const prep = this.snap?.preparation;
    const label = prep ? 'Vague ' + prep.wave + ' · ' + seconds + ' s' : 'Prochaine vague';
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
    this.launch.hidden = !prep;
  }
}
