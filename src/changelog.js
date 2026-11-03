// Quelques étapes marquantes, rédigées pour les joueurs. Pas un journal technique.
export const PLAYER_CHANGELOG = [
  { version: 125, changes: ['Les rats géants se déplacent 70 % plus vite.'] },
  { version: 124, changes: ['Tous les ennemis se déplacent deux fois moins vite.'] },
  { version: 122, changes: ['Les roquettes et missiles laissent une traînée de fumée et une petite flamme.'] },
  { version: 119, changes: ['Un bouton « Nouveautés » permet de retrouver les changements du jeu.'] },
  { version: 117, changes: ['Les grandes nuées se synchronisent plus efficacement en multijoueur.'] },
  { version: 112, changes: ['Les insectes ont des vitesses adaptées à chaque espèce.'] },
  { version: 109, changes: ['Le rat, le moustique et l’araignée pondeuse rejoignent le bestiaire.'] },
  { version: 97, changes: ['Les nuées créées manuellement avancent à vitesse constante, même très nombreuses.'] },
  { version: 94, changes: ['Les nuées s’adaptent à leur taille et empruntent plusieurs entrées.'] },
  { version: 90, changes: ['Les réglages personnels de pilotage sont enregistrés sur votre appareil.'] },
  { version: 89, changes: ['L’équilibrage et la génération de nuées sont accessibles aux joueurs de la room.'] },
  { version: 86, changes: ['Le bourdonnement des nuées se déplace avec elles dans le son 3D.'] },
  { version: 81, changes: ['Le rendu des nuées est optimisé pour afficher beaucoup de moucherons.'] },
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
