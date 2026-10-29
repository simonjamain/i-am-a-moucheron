export const CLAUSES = Object.freeze({
  inverse: {
    title: 'Essai de commandes à contre-sens',
    text: 'Le signataire accepte que toutes les commandes de pilotage, gaz compris, fonctionnent à l’envers pendant son occupation du cockpit.',
  },
  aim: {
    title: 'Tourelle contrariée',
    text: 'Le signataire accepte l’inversion des deux axes de visée pendant son occupation du poste.',
  },
  damage: {
    title: 'Économie expérimentale de poudre',
    text: 'Le signataire accepte que les dégâts de l’arme de son poste soient divisés par deux pendant son occupation.',
  },
  cadence: {
    title: 'Protocole de tir contemplatif',
    text: 'Le signataire accepte que la cadence de l’arme de son poste soit divisée par deux pendant son occupation.',
  },
});
export function drawClause(seat, armed = true, random = Math.random) {
  if (random() >= 0.05) return null;
  const compatible = [
    seat === 'pilot' ? 'inverse' : 'aim',
    ...(armed ? ['damage', 'cadence'] : []),
  ];
  return compatible[Math.min(compatible.length - 1, Math.floor(random() * compatible.length))];
}
export function maliciousDocument(dossier) {
  const clause = CLAUSES[dossier.clause];
  const introductions = [
    'Après consultation du trombone souverain,',
    'Au nom du ministère du papier froissé,',
    'En présence du sous-chef des agrafes,',
    'À la demande du bureau des idées discutables,',
    'Conformément au décret des ailes chiffonnées,',
    'Sous le regard désapprobateur de la corbeille,',
    'Après trois cafés administratifs,',
    'Sur avis du comité des tampons fatigués,',
    'Pour satisfaire le contrôleur des contrôleurs,',
    'Par délégation du grand classeur,',
  ];
  const variant = [...dossier.token].reduce((n, c) => n + c.charCodeAt(0), 0) % 10;
  return {
    title: clause.title,
    code: 'ANNEXE-' + (variant + 1),
    text:
      introductions[variant] +
      ' ' +
      clause.text +
      ' La direction décline toute responsabilité en cas de lecture trop rapide. Le présent feuillet vaut jusqu’à votre sortie ou changement de poste.',
  };
}
export function clauseFactors(clause) {
  return {
    controls: clause === 'inverse' ? -1 : 1,
    aim: clause === 'aim' ? -1 : 1,
    damage: clause === 'damage' ? 0.5 : 1,
    interval: clause === 'cadence' ? 2 : 1,
  };
}
