import {
  DEFAULT_FLIGHT_TUNING,
  FLIGHT_TUNING_FIELDS,
  normalizeFlightTuning,
  saveFlightTuning,
} from './flight-tuning.js';

export class FlightTuningUI {
  constructor({ root, document, storage, initial, onChange, onOpen, onClose }) {
    Object.assign(this, { root, storage, onChange, onOpen, onClose });
    this.current = normalizeFlightTuning(initial);
    this.opened = false;
    this.fields = new Map();
    this.status = root.querySelector('[data-flight-status]');
    const container = root.querySelector('[data-flight-fields]');
    for (const [key, field] of Object.entries(FLIGHT_TUNING_FIELDS)) {
      const label = document.createElement('label');
      const title = document.createElement('strong');
      title.textContent = field.label;
      const input = document.createElement('input');
      input.dataset.flightKey = key;
      const value = document.createElement('output');
      if (field.type === 'checkbox') {
        input.type = 'checkbox';
      } else {
        input.type = 'range';
        input.min = field.min;
        input.max = field.max;
        input.step = field.step;
        input.oninput = () => {
          value.textContent = this.format(field, input.value);
        };
      }
      const hint = document.createElement('small');
      hint.textContent = field.hint;
      label.append(title, input, value, hint);
      container.append(label);
      this.fields.set(key, { input, value, field });
    }
    root.querySelector('[data-flight-close]').onclick = () => this.close();
    root.querySelector('[data-flight-save]').onclick = () => this.save();
    root.querySelector('[data-flight-defaults]').onclick = () => {
      this.fill(DEFAULT_FLIGHT_TUNING);
      this.status.textContent = 'Valeurs par défaut préparées. Enregistrez pour les appliquer.';
    };
  }
  format(field, raw) {
    return Number(raw).toFixed(field.decimals ?? 1) + (field.unit ?? ' ×');
  }
  fill(settings) {
    for (const [key, { input, value, field }] of this.fields) {
      if (field.type === 'checkbox') input.checked = settings[key];
      else {
        input.value = settings[key];
        value.textContent = this.format(field, input.value);
      }
    }
  }
  open() {
    if (this.opened) return;
    this.opened = true;
    this.fill(this.current);
    this.status.textContent = 'Vos réglages restent sur cet appareil et ce navigateur.';
    this.root.classList.remove('hidden');
    this.onOpen();
    this.root.querySelector('[data-flight-close]').focus();
  }
  close(resume = true) {
    if (!this.opened) return;
    this.opened = false;
    this.root.classList.add('hidden');
    this.onClose(resume);
  }
  save() {
    const candidate = Object.fromEntries(
      [...this.fields].map(([key, { input, field }]) => [
        key,
        field.type === 'checkbox' ? input.checked : Number(input.value),
      ]),
    );
    this.current = normalizeFlightTuning(candidate);
    this.onChange(this.current);
    const persisted = saveFlightTuning(this.storage, this.current);
    this.status.textContent = persisted
      ? 'Réglages appliqués et enregistrés dans ce navigateur.'
      : 'Réglages appliqués pour cette session ; stockage local indisponible.';
  }
}
