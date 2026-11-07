import { BLUEPRINTS } from './wave-blueprints.js';

// Actions are authoritative on the server; this interface only submits a request.
export class LabUI {
  constructor({ root, document, snapshot, command, accept, onOpen, onClose, confirm }) {
    Object.assign(this, { root, document, snapshot, command, accept, onOpen, onClose, confirm });
    this.opened = false;
    this.busy = false;
    this.status = root.querySelector('[data-lab-status]');
    this.state = root.querySelector('[data-lab-state]');
    this.enable = root.querySelector('[data-lab-enable]');
    this.exit = root.querySelector('[data-lab-exit]');
    this.unlock = root.querySelector('[data-lab-unlock]');
    this.card = root.querySelector('[data-lab-card]');
    this.wave = root.querySelector('[data-lab-wave]');
    this.start = root.querySelector('[data-lab-start]');
    this.finish = root.querySelector('[data-lab-finish]');
    this.scenario = root.querySelector('[data-lab-scenarios]');
    this.name = root.querySelector('[data-lab-name]');
    this.save = root.querySelector('[data-lab-save]');
    this.load = root.querySelector('[data-lab-load]');
    this.remove = root.querySelector('[data-lab-delete]');
    for (const [key, profile] of Object.entries(BLUEPRINTS)) {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = profile.name;
      this.card.append(option);
    }
    root.querySelector('[data-lab-close]').onclick = () => this.close();
    this.enable.onclick = () => {
      if (this.confirm('Activer le laboratoire pour tous les joueurs de cette room ?'))
        this.send('enable');
    };
    this.exit.onclick = () => {
      if (this.confirm('Quitter le laboratoire ? La partie et ses scénarios seront effacés pour toute la room.'))
        this.send('exit');
    };
    this.unlock.onclick = () => this.send('unlock');
    root.querySelector('[data-lab-card-add]').onclick = () =>
      this.send('card', { card: this.card.value });
    root.querySelector('[data-lab-wave-go]').onclick = () => {
      const value = Number(this.wave.value);
      if (!Number.isSafeInteger(value) || value < 1 || value > 100) {
        this.status.textContent = 'Saisissez une vague entière entre 1 et 100.';
        return;
      }
      this.send('wave', { wave: value });
    };
    this.start.onclick = () => this.send('start');
    this.finish.onclick = () => this.send('finish');
    this.save.onclick = () => this.send('save', { name: this.name.value });
    this.load.onclick = () => {
      if (
        this.scenario.value &&
        this.confirm('Recharger ce scénario et replacer tous les joueurs au départ ?')
      )
        this.send('load', { scenario: this.scenario.value });
    };
    this.remove.onclick = () => {
      if (this.scenario.value) this.send('delete', { scenario: this.scenario.value });
    };
  }
  open() {
    if (!this.snapshot()) return;
    this.opened = true;
    this.root.classList.remove('hidden');
    this.onOpen();
    this.render();
    this.root.querySelector('[data-lab-close]').focus();
  }
  close() {
    if (!this.opened) return;
    this.opened = false;
    this.root.classList.add('hidden');
    this.onClose();
  }
  render() {
    if (!this.opened) return;
    const snap = this.snapshot();
    const enabled = !!snap?.lab?.enabled;
    const scenarios = snap?.lab?.scenarios || [];
    this.state.textContent = enabled
      ? 'Laboratoire actif pour toute la room · achats libres et plans disponibles.'
      : 'Partie normale · activer le laboratoire modifie toute la room.';
    this.enable.hidden = enabled;
    this.exit.hidden = !enabled;
    this.enable.disabled = this.busy;
    this.exit.disabled = this.busy;
    for (const control of [
      this.unlock,
      this.card,
      this.wave,
      this.start,
      this.finish,
      this.name,
      this.save,
      this.load,
      this.remove,
      this.scenario,
      this.root.querySelector('[data-lab-card-add]'),
      this.root.querySelector('[data-lab-wave-go]'),
    ])
      control.disabled = this.busy || !enabled;
    if (snap?.phase !== 'prep') this.start.disabled = true;
    if (snap?.phase !== 'combat') this.finish.disabled = true;
    const key = JSON.stringify(scenarios);
    if (this.scenario.dataset.key !== key) {
      this.scenario.dataset.key = key;
      const selected = this.scenario.value;
      this.scenario.replaceChildren();
      for (const item of scenarios) {
        const option = this.document.createElement('option');
        option.value = item.id;
        option.textContent = item.name + ' · vague ' + item.wave + ' (' + item.phase + ')';
        this.scenario.append(option);
      }
      if (scenarios.some((item) => item.id === selected)) this.scenario.value = selected;
    }
    if (!scenarios.length) {
      this.load.disabled = true;
      this.remove.disabled = true;
    }
    if (this.document.activeElement !== this.wave)
      this.wave.value = String(Math.min(100, (snap?.wave || 0) + 1));
  }
  async send(action, payload = {}) {
    if (this.busy) return;
    const snap = this.snapshot();
    if (!snap?.base?.epoch) return;
    this.busy = true;
    this.render();
    try {
      const result = await this.command({ epoch: snap.base.epoch, action, ...payload });
      this.accept(result);
      const names = {
        enable: 'laboratoire activé',
        exit: 'retour à une partie normale',
        unlock: 'tous les plans débloqués',
        card: 'plan ajouté',
        wave: 'vague préparée',
        start: 'vague lancée',
        finish: 'vague terminée',
        save: 'scénario enregistré',
        load: 'scénario rechargé',
        delete: 'scénario supprimé',
      };
      this.status.textContent = 'Action appliquée : ' + names[action] + '.';
    } catch (error) {
      this.status.textContent = error.message;
    } finally {
      this.busy = false;
      this.render();
    }
  }
}
