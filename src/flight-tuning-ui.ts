import {
  DEFAULT_FLIGHT_TUNING,
  FLIGHT_TUNING_FIELDS,
  normalizeFlightTuning,
  saveFlightTuning,
} from './flight-tuning.ts';
import type { CheckboxField, FlightTuning, FlightTuningKey, RangeField } from './flight-tuning.ts';

export interface FlightTuningUIOptions {
  root: HTMLElement;
  document: Pick<Document, 'createElement'>;
  storage: Pick<Storage, 'getItem' | 'setItem'> | null | undefined;
  initial: unknown;
  onChange: (settings: FlightTuning) => void;
  onOpen: () => void;
  onClose: (resume: boolean) => void;
}
interface FlightField {
  input: HTMLInputElement;
  value: HTMLOutputElement;
  field: RangeField | CheckboxField;
}

export class FlightTuningUI {
  root!: HTMLElement;
  storage!: FlightTuningUIOptions['storage'];
  onChange!: FlightTuningUIOptions['onChange'];
  onOpen!: FlightTuningUIOptions['onOpen'];
  onClose!: FlightTuningUIOptions['onClose'];
  current: FlightTuning;
  opened: boolean;
  fields: Map<FlightTuningKey, FlightField>;
  status: HTMLElement;
  constructor({
    root,
    document,
    storage,
    initial,
    onChange,
    onOpen,
    onClose,
  }: FlightTuningUIOptions) {
    Object.assign(this, { root, storage, onChange, onOpen, onClose });
    this.current = normalizeFlightTuning(initial);
    this.opened = false;
    this.fields = new Map();
    this.status = root.querySelector<HTMLElement>('[data-flight-status]')!;
    const container = root.querySelector<HTMLElement>('[data-flight-fields]')!;
    for (const [key, field] of Object.entries(FLIGHT_TUNING_FIELDS) as [
      FlightTuningKey,
      RangeField | CheckboxField,
    ][]) {
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
        input.min = field.min as unknown as string;
        input.max = field.max as unknown as string;
        input.step = field.step as unknown as string;
        input.oninput = () => {
          value.textContent = Number(input.value).toFixed(1) + ' ×';
        };
      }
      const hint = document.createElement('small');
      hint.textContent = field.hint;
      label.append(title, input, value, hint);
      container.append(label);
      this.fields.set(key, { input, value, field });
    }
    root.querySelector<HTMLElement>('[data-flight-close]')!.onclick = () => this.close();
    root.querySelector<HTMLElement>('[data-flight-save]')!.onclick = () => this.save();
    root.querySelector<HTMLElement>('[data-flight-defaults]')!.onclick = () => {
      this.fill(DEFAULT_FLIGHT_TUNING);
      this.status.textContent = 'Valeurs par défaut préparées. Enregistrez pour les appliquer.';
    };
  }
  fill(settings: Readonly<FlightTuning>): void {
    for (const [key, { input, value, field }] of this.fields) {
      if (field.type === 'checkbox') input.checked = settings[key] as boolean;
      else {
        input.value = settings[key] as unknown as string;
        value.textContent = Number(input.value).toFixed(1) + ' ×';
      }
    }
  }
  open(): void {
    if (this.opened) return;
    this.opened = true;
    this.fill(this.current);
    this.status.textContent = 'Vos réglages restent sur cet appareil et ce navigateur.';
    this.root.classList.remove('hidden');
    this.onOpen();
    this.root.querySelector<HTMLElement>('[data-flight-close]')!.focus();
  }
  close(resume = true): void {
    if (!this.opened) return;
    this.opened = false;
    this.root.classList.add('hidden');
    this.onClose(resume);
  }
  save(): void {
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
