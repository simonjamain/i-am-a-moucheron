# Identifiant coloré des véhicules Meshy — textures originales à compléter

- Branche : `feat/meshy-uniform-markers`, issue non créée ; PR à ouvrir pour transmettre le travail.
- Base : `main` après la fusion des PR #71–#74 (VERSION 167).
- Objectif : tous les sept véhicules Meshy (M1, H2, B3, Stuka, S6, T3 et D2) conservent leur apparence et utilisent seulement le disque flottant pour la couleur individuelle, comme le B3.
- Réalisé : généralisation du drapeau `preserveTexture`, disque Meshy commun orienté vers la caméra dans `client.js`, hauteur calculée avant ajout pour dégager les rotors/superstructures, palette de base olive pour les surfaces précédemment peintes. Tests ciblés adaptés ; VERSION 168, changelog et références.
- **Limite des textures** : B3 contient réellement ses UV et son atlas JPEG dans `src/meshy-b3-data.js`. Pour M1, H2, Stuka, S6, T3 et D2, les conversions antérieures ont échantillonné les textures en couleurs de sommets et supprimé UV et atlas. Elles ne permettent pas de restituer l'original exactement.
- Bibliothèque inspectée le 5 novembre 2026 : archives 3D Meshy du B3 uniquement, plus images de référence ; aucun GLB original texturé identifié pour les six autres. Le dépôt ne contient pas les GLB d'origine, seulement les conversions intégrées ; **ne pas appeler Meshy** et ne pas prétendre avoir récupéré les textures originales.
- Prochaine étape : demander à l'utilisateur les six GLB texturés (ou GLTF avec fichiers textures), reprendre une conversion qui préserve UV/atlas comme le B3, vérifier la taille du paquet et les performances WebGL, rejouer les tests et la CI Docker avant fusion.
- Vérification locale : clone Git indisponible (résolution DNS du dépôt impossible dans l'environnement de travail), Docker absent ; contrôles PR GitHub Actions à examiner. Ni rendu WebGL ni partie UDP/WAN testés à ce stade.
- Références : [flotte Meshy](../meshy-fleet.md), [B3](../b3-model.md), [M1](../m1-model.md), [H2](../h2-model.md).
