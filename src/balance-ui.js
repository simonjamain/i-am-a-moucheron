import { BALANCE_FIELDS, DEFAULT_BALANCE, validateBalance } from './balance.js';
import { ENEMY_TYPES, validateDebugSpawn, MAX_DEBUG_SPAWN_BATCH } from './waves.js';

export class BalanceUI {
  constructor({ root, document, snapshot, command, spawnCommand, accept, onOpen, onClose }) {
    Object.assign(this, { root, snapshot, command, spawnCommand, accept, onOpen, onClose });
    this.opened = false;
    this.busy = false;
    this.spawnBusy = false;
    this.fields = new Map();
    this.spawnFields = new Map();
    this.status = root.querySelector('[data-balance-status]');
    this.save = root.querySelector('[data-balance-save]');
    this.defaults = root.querySelector('[data-balance-defaults]');
    this.reload = root.querySelector('[data-balance-reload]');
    const container = root.querySelector('[data-balance-fields]');
    for (const [key, field] of Object.entries(BALANCE_FIELDS)) {
      const label = document.createElement('label');
      const title = document.createElement('span');
      title.textContent = field.label;
      const input = document.createElement('input');
      input.type = 'number';
      input.min = field.min;
      input.step = field.step;
      input.required = true;
      input.dataset.balanceKey = key;
      const hint = document.createElement('small');
      hint.textContent = `${field.when} · défaut : ${field.value}${field.value === 1 ? ' ×' : ''}`;
      label.append(title, input, hint);
      container.append(label);
      this.fields.set(key, input);
    }
    const spawnContainer = root.querySelector('[data-spawn-fields]');
    this.spawnSend = root.querySelector('[data-spawn-send]');
    this.spawnStatus = root.querySelector('[data-spawn-status]');
    for (const [key, profile] of Object.entries(ENEMY_TYPES)) {
      if (profile.offspringOnly) continue;
      const label = document.createElement('label');
      const title = document.createElement('span');
      title.textContent = profile.name;
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.step = '1';
      input.inputMode = 'numeric';
      input.value = '0';
      input.dataset.spawnKey = key;
      label.append(title, input);
      spawnContainer.append(label);
      this.spawnFields.set(key, input);
    }
    this.spawnStatus.textContent =
      'Chaque envoi est limité à ' + MAX_DEBUG_SPAWN_BATCH + ' insectes pour préserver le réseau.';
    this.spawnSend.onclick = () => this.submitSpawn();
    root.querySelector('[data-balance-close]').onclick = () => this.close();
    this.reload.onclick = () => this.load();
    this.defaults.onclick = () => {
      if (this.busy) return;
      for (const [key, input] of this.fields) input.value = DEFAULT_BALANCE[key];
      this.status.textContent =
        'Valeurs par défaut préparées. Cliquez sur Appliquer pour les partager.';
    };
    this.save.onclick = () => this.submit();
  }
  load() {
    const s = this.snapshot();
    this.epoch = s.base.epoch;
    this.revision = s.balanceRevision;
    for (const [key, input] of this.fields) input.value = s.balance[key];
    this.status.textContent =
      'Tous les joueurs peuvent modifier ces réglages. Les multiplicateurs valent 1 × par défaut.';
    this.render();
  }
  open() {
    if (!this.snapshot()?.balance) return;
    this.opened = true;
    this.root.classList.remove('hidden');
    this.onOpen();
    this.load();
    this.root.querySelector('[data-balance-close]').focus();
  }
  close() {
    if (!this.opened) return;
    this.opened = false;
    this.root.classList.add('hidden');
    this.onClose();
  }
  render() {
    if (!this.opened) return;
    const s = this.snapshot();
    const stale = s.balanceRevision !== this.revision || s.base.epoch !== this.epoch;
    if (stale)
      this.status.textContent =
        'Les réglages ou la partie ont changé. Rechargez les valeurs avant de modifier.';
    const disabled = this.busy || stale;
    this.save.disabled = disabled;
    this.defaults.disabled = disabled;
    this.reload.disabled = this.busy;
    for (const input of this.fields.values()) input.disabled = disabled;
    this.spawnSend.disabled = this.spawnBusy || !s || s.phase === 'lost';
    for (const input of this.spawnFields.values()) input.disabled = this.spawnBusy;
  }
  async submitSpawn() {
    if (this.spawnBusy || this.spawnSend.disabled) return;
    try {
      const counts = Object.fromEntries(
        [...this.spawnFields].map(([key, input]) => [key, Number(input.value)]),
      );
      const total = validateDebugSpawn(counts);
      this.spawnBusy = true;
      this.render();
      const result = await this.spawnCommand({ epoch: this.snapshot().base.epoch, counts });
      this.accept(result);
      for (const input of this.spawnFields.values()) input.value = '0';
      this.spawnStatus.textContent = total + ' insecte(s) lancés dans la room.';
    } catch (error) {
      this.spawnStatus.textContent = error.message;
    } finally {
      this.spawnBusy = false;
      this.render();
    }
  }
  async submit() {
    if (this.busy || this.save.disabled) return;
    const values = Object.fromEntries(
      [...this.fields].map(([key, input]) => [key, Number(input.value)]),
    );
    try {
      for (const input of this.fields.values())
        if (String(input.value).trim() === '') throw Error('Renseignez chaque réglage.');
      validateBalance(values);
      this.busy = true;
      this.render();
      const result = await this.command({ epoch: this.epoch, revision: this.revision, values });
      this.accept(result);
      this.load();
      this.status.textContent = 'Réglages appliqués à cette room et partagés avec les joueurs.';
    } catch (error) {
      this.status.textContent = error.message;
    } finally {
      this.busy = false;
      this.render();
    }
  }
}
