// Réglages locaux du joueur : sans modification de l'équilibrage de la room.
export const FLIGHT_TUNING_STORAGE_KEY = 'moucheron-flight-tuning:v1';

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
});

export const DEFAULT_FLIGHT_TUNING = Object.freeze(
  Object.fromEntries(
    Object.entries(FLIGHT_TUNING_FIELDS).map(([key, field]) => [key, field.value]),
  ),
);

export function normalizeFlightTuning(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const result = { ...DEFAULT_FLIGHT_TUNING };
  for (const [key, field] of Object.entries(FLIGHT_TUNING_FIELDS)) {
    const v = input[key];
    if (field.type === 'checkbox') {
      if (typeof v === 'boolean') result[key] = v;
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      result[key] = Math.min(field.max, Math.max(field.min, v));
    }
  }
  return result;
}

export function loadFlightTuning(storage) {
  try {
    return normalizeFlightTuning(JSON.parse(storage?.getItem(FLIGHT_TUNING_STORAGE_KEY) || 'null'));
  } catch {
    return { ...DEFAULT_FLIGHT_TUNING };
  }
}

export function saveFlightTuning(storage, value) {
  try {
    storage?.setItem(FLIGHT_TUNING_STORAGE_KEY, JSON.stringify(normalizeFlightTuning(value)));
    return !!storage;
  } catch {
    return false;
  }
}
