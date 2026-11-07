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
  adhesive: {
    name: 'Colle renforcée',
    description: 'Ce ruban immobilise les petits insectes une seconde de plus par niveau.',
    cost: 2,
    kind: 'sticky',
  },
  castorBunker: {
    name: 'Plan de bunker LEGO',
    description: 'Débloque les bunkers LEGO occupables construits par le Castor.',
    cost: 0, kind: 'unlock',
  },
  castorAntitank: {
    name: 'Plan de canon antichar',
    description: 'Débloque les canons lourds contre les boss terrestres du Castor.',
    cost: 0, kind: 'unlock',
  },
  castorAutoturret: {
    name: 'Plan de tourelle automatique',
    description: 'Débloque les tourelles autonomes à munitions limitées du Castor.',
    cost: 0, kind: 'unlock',
  },
});

export function supportsBlueprint(id, object) {
  const kind = BLUEPRINTS[id]?.kind;
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
