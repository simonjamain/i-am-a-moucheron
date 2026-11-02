import { BALANCE_FIELDS, DEFAULT_BALANCE, validateBalance } from './balance.js';

export class BalanceUI {
  constructor({ root, document, snapshot, player, command, accept, onOpen, onClose }) {
    Object.assign(this, { root, snapshot, player, command, accept, onOpen, onClose });
    this.opened = false;
    this.busy = false;
    this.fields = new Map();
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
    root.querySelector('[data-balance-close]').onclick = () => this.close();
    this.reload.onclick = () => this.load();
    this.defaults.onclick = () => {
      if (this.busy || !this.owner()) return;
      for (const [key, input] of this.fields) input.value = DEFAULT_BALANCE[key];
      this.status.textContent =
        'Valeurs par défaut préparées. Cliquez sur Appliquer pour les partager.';
    };
    this.save.onclick = () => this.submit();
  }
  owner() {
    return this.snapshot()?.balanceOwner?.includes(this.player());
  }
  load() {
    const s = this.snapshot();
    this.epoch = s.base.epoch;
    this.revision = s.balanceRevision;
    for (const [key, input] of this.fields) input.value = s.balance[key];
    this.status.textContent = this.owner()
      ? 'Les multiplicateurs valent 1 × par défaut. Les autres joueurs voient les réglages.'
      : 'Consultation : seul le créateur de la room peut modifier les réglages.';
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
    const disabled = this.busy || stale || !this.owner();
    this.save.disabled = disabled;
    this.defaults.disabled = disabled;
    this.reload.disabled = this.busy;
    for (const input of this.fields.values()) input.disabled = disabled;
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
