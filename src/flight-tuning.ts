// Réglages locaux du joueur : sans modification de l'équilibrage de la room.
export const FLIGHT_TUNING_STORAGE_KEY = 'moucheron-flight-tuning:v1';

export interface RangeField {
  label: string;
  hint: string;
  type?: undefined;
  min: number;
  max: number;
  step: number;
  value: number;
}
export interface CheckboxField {
  label: string;
  hint: string;
  type: 'checkbox';
  value: boolean;
}
export const FLIGHT_TUNING_FIELDS = Object.freeze({
  mouseSensitivity: {
    label: 'Sensibilité de la souris',
    hint: 'Déplacement du point de visée pour un même geste.',
    min: 0.4,
    max: 3,
    step: 0.1,
    value: 1,
  },
  pitchResponse: {
    label: 'Réactivité en tangage',
    hint: 'Correction lorsque le nez est trop haut ou trop bas.',
    min: 0.4,
    max: 2.5,
    step: 0.1,
    value: 1,
  },
  rollResponse: {
    label: 'Réactivité en roulis',
    hint: 'Mise en inclinaison et retour à plat.',
    min: 0.4,
    max: 2.5,
    step: 0.1,
    value: 1,
  },
  yawResponse: {
    label: 'Réactivité en lacet',
    hint: 'Correction horizontale au palonnier.',
    min: 0.4,
    max: 2.5,
    step: 0.1,
    value: 1,
  },
  bankStrength: {
    label: 'Inclinaison automatique en virage',
    hint: '0 : ailes horizontales ; plus haut : virages davantage inclinés.',
    min: 0,
    max: 2,
    step: 0.1,
    value: 1,
  },
  damping: {
    label: 'Freinage de rotation',
    hint: 'Limite le dépassement du point de visée et les oscillations.',
    min: 0.4,
    max: 2.5,
    step: 0.1,
    value: 1,
  },
  nearTargetBoost: {
    label: 'Rattrapage final du viseur',
    hint: 'Accélère la convergence lorsque le nez est proche du curseur.',
    min: 1,
    max: 3,
    step: 0.1,
    value: 1.4,
  },
  invertY: {
    label: 'Inverser la souris verticalement',
    hint: 'Inverse uniquement la visée à la souris dans les avions.',
    type: 'checkbox',
    value: false,
  },
} satisfies Record<string, RangeField | CheckboxField>);
export type FlightTuningKey = keyof typeof FLIGHT_TUNING_FIELDS;
/** Every field's current value: numbers for sliders, booleans for checkboxes. */
export type FlightTuning = {
  [K in FlightTuningKey]: (typeof FLIGHT_TUNING_FIELDS)[K]['value'] extends boolean
    ? boolean
    : number;
};
const FIELD_ENTRIES = Object.entries(FLIGHT_TUNING_FIELDS) as [
  FlightTuningKey,
  RangeField | CheckboxField,
][];

export const DEFAULT_FLIGHT_TUNING: Readonly<FlightTuning> = Object.freeze(
  Object.fromEntries(FIELD_ENTRIES.map(([key, field]) => [key, field.value])) as FlightTuning,
);

export function normalizeFlightTuning(value: unknown): FlightTuning {
  const input: Record<string, unknown> =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const result: Record<FlightTuningKey, number | boolean> = { ...DEFAULT_FLIGHT_TUNING };
  for (const [key, field] of FIELD_ENTRIES) {
    const v = input[key];
    if (field.type === 'checkbox') {
      if (typeof v === 'boolean') result[key] = v;
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      result[key] = Math.min(field.max, Math.max(field.min, v));
    }
  }
  return result as FlightTuning;
}

type TuningStorage = Pick<Storage, 'getItem' | 'setItem'>;
export function loadFlightTuning(
  storage: Pick<Storage, 'getItem'> | null | undefined,
): FlightTuning {
  try {
    return normalizeFlightTuning(JSON.parse(storage?.getItem(FLIGHT_TUNING_STORAGE_KEY) || 'null'));
  } catch {
    return { ...DEFAULT_FLIGHT_TUNING };
  }
}

export function saveFlightTuning(
  storage: TuningStorage | null | undefined,
  value: unknown,
): boolean {
  try {
    storage?.setItem(FLIGHT_TUNING_STORAGE_KEY, JSON.stringify(normalizeFlightTuning(value)));
    return !!storage;
  } catch {
    return false;
  }
}
