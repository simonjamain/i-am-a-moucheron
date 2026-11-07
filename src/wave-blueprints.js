export const BLUEPRINTS = Object.freeze({
  piercing: {
    name: 'Balles traversantes',
    description:
      'La mitrailleuse traverse un ennemi de plus par niveau. Les dégâts diminuent de moitié à chaque traversée.',
    cost: 3,
    kind: 'vehicle',
  },
  lure: {
    name: 'Sucre parfumé',
    description: 'Les insectes sentent ce sachet de 10 cm plus loin par niveau.',
    cost: 2,
    kind: 'sugar',
  },
  reinforced: {
    name: 'Renfort en bois',
    description: 'Ce segment gagne 100 points de vie par niveau.',
    cost: 2,
    kind: 'barricade',
  },
  bunker: {
    name: 'Bunker LEGO du Castor',
    description: 'Débloque un bunker LEGO occupable et protégé, avec mitrailleuse à munitions finies.',
    cost: 0,
    kind: 'unlock',
  },
  antitank: {
    name: 'Canon anti-matériel du Castor',
    description: 'Débloque un canon lourd occupable, efficace contre les boss terrestres.',
    cost: 0,
    kind: 'unlock',
  },
  sentry: {
    name: 'Tourelle automatique du Castor',
    description: 'Débloque la construction d’une tourelle qui défend le bureau avec des balles limitées.',
    cost: 0,
    kind: 'unlock',
  },
  adhesive: {
    name: 'Colle renforcée',
    description: 'Ce ruban immobilise les petits insectes une seconde de plus par niveau.',
    cost: 2,
    kind: 'sticky',
  },
});

export function supportsBlueprint(id, object) {
  const kind = BLUEPRINTS[id]?.kind;
  if (kind === 'unlock') return false;
  if (kind === 'vehicle')
    return (
      !!object?.state &&
      object.state.hp > 0 &&
      ['fighter', 'bomber', 'spitfire', 'interceptor', 'helicopter', 'tank'].includes(object.type)
    );
  return !!kind && object?.kind === kind && (kind !== 'barricade' || object.hp > 0);
}

export function equippedLevel(item, id) {
  return item?.blueprints?.filter((card) => card === id).length || 0;
}
