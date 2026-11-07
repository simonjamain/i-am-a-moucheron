# Tourelle T-01 — modèle Meshy validé, intégration à achever

- Demande : remplacer la maquette automatique du G1 Castor par un design conforme aux références de la Bibliothèque, avec un canon unique et un capteur visible. Élévation du canon de **−10° à +90°**, rotation à 360°, base immobile, tête et canon articulés.
- Référence design : planche approuvée dans la conversation du 7 novembre 2026, colorimétrie olive/sable/jaune/noir du G1 Castor.
- Génération Meshy : image isolée \`01a1b566-8103-7736-a3e8-8630c52ae546\` ; GLB texturé généré \`01a1b567-57ab-70d1-9f1b-387b76342cd2\` (géométrie Meshy T2.5 Smart Topology, objectif 12 000 triangles, texture Meshy N1). Les URLs d'export sont temporaires : ne pas les inscrire dans le code ou la CI.
- État : le GLB est disponible dans Meshy, mais le téléchargement de ses octets vers l'environnement de développement était bloqué (lien inaccessible depuis les outils du conteneur). **Aucune statistique ni validation d'optimisation du vrai GLB obtenue**.
- Cette PR n'importe pas le GLB Meshy : elle prépare une maquette 3D provisoire plus fidèle au concept, avec pivots indépendants et orientation vers la dernière cible serveur (sans changement de règles de combat).
- Relais de travail : récupérer le vrai GLB (upload de l'export Meshy par le propriétaire dans la conversation ou accès autorisé équivalent). Inspecter nombre de triangles, matériaux, UV et séparation des maillages ; segmenter / reconstruire base, rotation, élévation, capteur avant tout remplacement.
- Utiliser l'outil \`compose.assets.yaml\` et ses rapports avant/après, protéger les zones mobiles et vérifier les textures et pivots ; conserver le modèle brut et les SHA. Importer en modules JS hors ligne via la chaîne Meshy existante, avec textures originales et segments animables, puis retirer le fallback seulement après validation.
- Vérifier sur PR : \`node scripts/test-sentry-model.mjs\`, \`node scripts/test-ground-sentry.mjs\`, \`npm run format:check\`, \`npm test\`, \`npm run check:docs\`, \`npm run build\`, \`node scripts/validate-artifact.mjs\`, \`npm run check:version\`, \`Docker build\` sur Actions.
- Tests non couverts automatiquement : apparence WebGL finale, confort de rotation avec la latence, FPS pour 12 tourelles, intégration UV Meshy ; ne pas déduire des tests Node une validation graphique humaine.
- Références : [documentation](../asset-pipeline.md) et [issue #76](https://github.com/simonjamain/i-am-a-moucheron/issues/76). **Ne pas clôturer #76 sur cette PR partielle.**

- Sur les snapshots de munitions/tirs, les groupes T-01 sont désormais réutilisés sans libérer/recréer leurs géométries ; l'animation conserve ses pivots et le test de régression vérifie ce comportement.
