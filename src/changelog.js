// Quelques étapes marquantes, rédigées pour les joueurs. Pas un journal technique.
export const PLAYER_CHANGELOG = [
  {
    version: 168,
    changes: [
      'Les véhicules gardent leurs couleurs ; un petit rond coloré au-dessus de chacun permet de les reconnaître.',
    ],
  },
  {
    version: 167,
    changes: [
      'Le Stuka, le Spitfire, le tank et la DCA mobile adoptent de nouvelles silhouettes militaires et leur camouflage.',
    ],
  },
  {
    version: 166,
    changes: [
      'Le bombardier accueille un quatrième joueur dans sa tourelle ventrale.',
      'Son nouveau modèle conserve son camouflage et se repère grâce à un rond coloré au-dessus de lui.',
    ],
  },
  {
    version: 165,
    changes: [
      'Le H2 adopte le croquis inspiré du Mi-24, avec deux verrières, un train à roues et ses deux rotors animés.',
    ],
  },
  {
    version: 163,
    changes: [
      'Le chasseur M1 prend les formes du croquis : ailes hautes, cockpit vitré et livrée bicolore.',
    ],
  },
  {
    version: 161,
    changes: [
      'Les ennemis au sol avancent plus régulièrement, sans petits bonds entre leurs déplacements.',
    ],
  },
  {
    version: 159,
    changes: [
      'Visez avec la caméra pour poser tous vos objets.',
      'Tracez vos barricades entre deux points : le nombre de briques s’adapte à leur longueur.',
    ],
  },
  {
    version: 157,
    changes: [
      'Repérez les prochaines entrées et votez pour un plan commun. Équipez vos défenses avant de lancer une vague plus coriace.',
    ],
  },
  {
    version: 156,
    changes: [
      'Repérez les couloirs de vol grâce aux phéromones. Posez et orientez des ventilateurs pour dévier les insectes vers vos défenses.',
    ],
  },
  {
    version: 154,
    changes: [
      'Maintenez la molette et relâchez vers votre outil. Deux clics posent un mur ou un ruban, un seul suffit pour le sucre.',
    ],
  },
  {
    version: 153,
    changes: [
      'Maintenez le clic et marchez pour étirer vos barricades et rubans. Tournez le sachet de sucre pour orienter ses cristaux.',
    ],
  },
  {
    version: 152,
    changes: [
      'Posez vos défenses directement devant votre personnage en marchant, avec un aperçu et une rotation.',
    ],
  },
  {
    version: 144,
    changes: [
      'Une carte de défense permet de poser des barricades, du sucre et des bandes collantes.',
    ],
  },
  {
    version: 131,
    changes: [
      'Les mitrailleuses tirent plus régulièrement lorsque la connexion ou les images ralentissent.',
    ],
  },
  {
    version: 128,
    changes: [
      'Les éclairs de tir apparaissent au bout des canons des mitrailleuses.',
      'Les distances et altitudes affichées correspondent désormais à l’échelle réelle.',
    ],
  },
  {
    version: 126,
    changes: [
      'Les obus de la DCA mobile attendent de passer au plus près des objets détectés pour exploser.',
    ],
  },
  { version: 125, changes: ['Les rats géants se déplacent 70 % plus vite.'] },
  { version: 124, changes: ['Tous les ennemis se déplacent deux fois moins vite.'] },
  {
    version: 122,
    changes: ['Les roquettes et missiles laissent une traînée de fumée et une petite flamme.'],
  },
  {
    version: 119,
    changes: ['Un bouton « Nouveautés » permet de retrouver les changements du jeu.'],
  },
  {
    version: 117,
    changes: ['Les grandes nuées se synchronisent plus efficacement en multijoueur.'],
  },
  { version: 112, changes: ['Les insectes ont des vitesses adaptées à chaque espèce.'] },
  {
    version: 109,
    changes: ['Le rat, le moustique et l’araignée pondeuse rejoignent le bestiaire.'],
  },
  {
    version: 97,
    changes: ['Les nuées créées manuellement avancent à vitesse constante, même très nombreuses.'],
  },
  { version: 94, changes: ['Les nuées s’adaptent à leur taille et empruntent plusieurs entrées.'] },
  {
    version: 90,
    changes: ['Les réglages personnels de pilotage sont enregistrés sur votre appareil.'],
  },
  {
    version: 89,
    changes: ['L’équilibrage et la génération de nuées sont accessibles aux joueurs de la room.'],
  },
  { version: 86, changes: ['Le bourdonnement des nuées se déplace avec elles dans le son 3D.'] },
  {
    version: 81,
    changes: ['Le rendu des nuées est optimisé pour afficher beaucoup de moucherons.'],
  },
];

// Utiliser uniquement du texte, jamais du HTML provenant du changelog.
export function mountChangelog({ dialog, trigger, close, list, document, onOpen }) {
  const fragment = document.createDocumentFragment();
  for (const entry of PLAYER_CHANGELOG) {
    const section = document.createElement('section');
    const title = document.createElement('h3');
    title.textContent = 'Version ' + entry.version;
    const ul = document.createElement('ul');
    for (const change of entry.changes) {
      const li = document.createElement('li');
      li.textContent = change;
      ul.append(li);
    }
    section.append(title, ul);
    fragment.append(section);
  }
  list.replaceChildren(fragment);
  trigger.addEventListener('click', () => {
    if (dialog.open) return;
    onOpen();
    dialog.showModal();
  });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}
