import { ENEMY_TYPES } from './waves.ts';
import { speciesSymbols, entranceLabel } from './wave-forecast-scene.ts';
import type { ForecastGroup } from './wave-forecast-scene.ts';

/** One announced group of the next wave (`server/wave-preparation.js`). */
export interface CouncilGroup extends ForecastGroup {
  spawn: number;
  count: number;
}
/** The announced wave, as the room snapshot carries it. */
export interface CouncilPreparation {
  id: string;
  wave: number;
  power: number;
  groups?: readonly CouncilGroup[];
}
export interface CouncilSnapshot {
  preparation?: CouncilPreparation | null;
}
/** The DOM nodes the council reads; tests pass a small fake document. */
interface CouncilElement {
  textContent: string | null;
  hidden: boolean;
  onclick: ((this: unknown, event?: unknown) => unknown) | null;
  append(...nodes: CouncilElement[]): void;
  replaceChildren(...nodes: CouncilElement[]): void;
}
interface CouncilDialog extends CouncilElement {
  open: boolean;
  showModal(): void;
  close(): void;
}
interface CouncilDocument {
  getElementById(id: string): unknown;
  createElement(tag: string): unknown;
}

const powerLabel = (power: number): string => String(Math.round(power * 10) / 10).replace('.', ',');

export function timelineColumns<G extends { spawn: number }>(
  groups: readonly G[],
): [number, G[]][] {
  const columns = new Map<number, G[]>();
  for (const group of groups) {
    if (!columns.has(group.spawn)) columns.set(group.spawn, []);
    columns.get(group.spawn)!.push(group);
  }
  return [...columns].sort(([a], [b]) => a - b);
}

// Announcement of the next wave: its groups, entrances and timing, with an
// early launch open to every player (no vote, no team plans).
export class WaveCouncilUI {
  document: CouncilDocument;
  command: (type: string, payload: { preparation: string }) => void;
  button: CouncilElement;
  dialog: CouncilDialog;
  clock: CouncilElement;
  timeline: CouncilElement;
  launch: CouncilElement;
  snap?: CouncilSnapshot;
  playerId?: string;
  timelineKey?: string | null;
  constructor({
    document,
    command,
    releaseMouse,
  }: {
    document: CouncilDocument;
    command: WaveCouncilUI['command'];
    releaseMouse: () => void;
  }) {
    this.document = document;
    this.command = command;
    const el = <E = CouncilElement>(id: string) => document.getElementById(id) as E;
    this.button = el('waveCouncilOpen');
    this.dialog = el<CouncilDialog>('waveCouncil');
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
  element(tag: string, text: string): CouncilElement {
    const el = this.document.createElement(tag) as CouncilElement;
    el.textContent = text;
    return el;
  }
  accept(snap: CouncilSnapshot, id: string): void {
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
  countdown(seconds: number): void {
    const prep = this.snap?.preparation;
    const label = prep
      ? 'Vague ' + prep.wave + ' · puissance ' + powerLabel(prep.power) + ' · ' + seconds + ' s'
      : 'Prochaine vague';
    if (this.button.textContent !== label) this.button.textContent = label;
    if (this.dialog.open && this.clock.textContent !== label) this.clock.textContent = label;
  }
  render(): void {
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
