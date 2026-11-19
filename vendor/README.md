# Bibliothèques embarquées

Le navigateur charge toujours ces fichiers depuis `vendor/` (aucun bundler, voir
[TypeScript](../docs/typescript.md)). Les remplacer demande de mettre à jour ce
tableau, l'empreinte et les tests.

| Fichier                 | Origine                                                                            | Version | Licence    | SHA-256                                                            |
| ----------------------- | ---------------------------------------------------------------------------------- | ------- | ---------- | ------------------------------------------------------------------ |
| `three.module.min.js`   | three.js                                                                           | r170    | MIT        | `08fd7545d13d2c7fb65ab691530a802dafefd638596501854f267d0fb13c39e7` |
| `rapier.compat.mjs`     | `@dimforge/rapier3d-compat` 0.21.0, `dist/rapier.mjs` (WASM en base64), sans le commentaire `sourceMappingURL` | 0.21.0  | Apache-2.0 | `b0e40704083fbd4406e48aa9b5ab7c5507054ce07491f58fce01241c2921c900`                                                  |

Rapier : moteur de physique 3D (Rust compilé en WebAssembly). Chargé à la demande
(`import('/rapier.js')`), en arrière-plan après l'accueil, jamais au démarrage de la page ; voir
[la physique Rapier](../docs/physics-engine.md). Empreinte complète dans le tableau.
