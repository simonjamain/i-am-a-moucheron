# Réglages d’équilibrage par room — reprise

- Tâche : https://github.com/simonjamain/i-am-a-moucheron/issues/25
- Branche : `feat/room-gameplay-balance`, base `aa5887d`.
- Résultat : [équilibrage par room](../room-balance.md), version 62.
- État : code et vérifications locales terminés. L’issue et la PR liée font foi
  pour le contrôle Docker GitHub Actions et la fusion autorisée par l’utilisateur.
- Preuves : `npm test`, `npm run format:check`, `npm run check:docs`,
  `npm run build`, `node scripts/validate-artifact.mjs` passent sur la version 62.
  La suite inclut les vrais gestionnaires UI et deux pairs WebRTC/UDP locaux.
- Revue : prix du bon et séparation des ennemis supplémentaires corrigés et
  couverts par régressions ; aucune violation documentaire constatée.
- Limites : Docker absent localement ; contrôler `Docker build` sur la PR avant
  fusion. Navigateur local absent et téléchargement Playwright tronqué : aucune
  capture visuelle ni validation WebGL/WAN revendiquée. Preview Actions absente.
- Prochaine action humaine : après publication, tester les réglages dans deux
  navigateurs sur le VPS, dont reconnexion du créateur et ajustement en combat.
