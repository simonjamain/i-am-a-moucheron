# Écran de chargement

L'HTML affiche immédiatement « CHARGEMENT » (fond vert/noir) avant les modules du
jeu ; les polices externes ne le bloquent pas. Une petite entrée charge en priorité
Three et le moucheron Meshy animé, qui virevolte autour du texte.

- La sélection salon/personnage reste masquée jusqu'à l'initialisation du client,
  au premier dessin du personnage et à la fin des textures. Un échec propose
  « Réessayer » (rechargement de la page, pour réinitialiser les imports ESM).
  Sans WebGL, le texte reste et le moteur logiciel demeure utilisable.
- Le moucheron reste visible au moins 0,9 s. À la fin, l'accueil apparaît derrière
  le fond qui s'efface, le moucheron se tourne vers le joueur puis fonce vers la
  caméra (1,4 s, clics bloqués). Mouvement réduit : fondu de 0,2 s, sans attente.
- La préparation des animations ennemies est découpée en tâches d'environ 4 ms
  pour ne pas figer l'animation du loader ; les données produites sont identiques.
- Le contexte WebGL du loader est détruit après la transition.

Contrôles : `test-loading-preparation.mjs`, `npm run e2e -- loading` (Chromium, dans la CI navigateur).
Les pauses dues aux shaders, au décodage ou au pilote GPU ne sont pas couvertes.
