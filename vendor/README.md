# Bibliothèques embarquées

Le navigateur charge toujours ces fichiers depuis `vendor/` (aucun bundler, voir
[TypeScript](../docs/typescript.md)). Les remplacer demande de mettre à jour ce
tableau, l'empreinte et les tests.

| Fichier                 | Origine                                                                            | Version | Licence    | SHA-256                                                            |
| ----------------------- | ---------------------------------------------------------------------------------- | ------- | ---------- | ------------------------------------------------------------------ |
| `three.webgpu.min.js`   | three.js, `build/three.webgpu.js` (renderer WebGPU, matériaux à nœuds, TSL), minifié avec esbuild | r187    | MIT        | `9ee3997188aa007236c379f4e028526968e250e995e18e85d141832cb0fad464` |
| `three.core.min.js`     | three.js, `build/three.core.js` (classes de base, importées par les deux autres), minifié | r187    | MIT        | `9802c2314f06e6b2d21450e42065cda2c5d2a6a078bccbfa3deaebbab62e65b0` |
| `three.tsl.min.js`      | three.js, `build/three.tsl.js` (Three Shading Language), minifié                    | r187    | MIT        | `a6d6a822506f1b074f4471ecbcf98466433886743bcc60933610743e1908101d` |
| `rapier.compat.mjs`     | `@dimforge/rapier3d-compat` 0.21.0, `dist/rapier.mjs` (WASM en base64), sans le commentaire `sourceMappingURL` | 0.21.0  | Apache-2.0 | `b0e40704083fbd4406e48aa9b5ab7c5507054ce07491f58fce01241c2921c900`                                                  |

Three.js : le navigateur charge `/three.js` = `three.webgpu.min.js`, qui importe
`three.core.min.js` et `three.tsl.min.js` (les spécificateurs `./three.core.js` et
`./three.tsl.js` des builds d'origine sont réécrits en `.min.js`). Les tests Node
importent le même `three.webgpu.min.js`. Pour changer de version : `npm pack three@X`,
minifier les trois fichiers `build/three.{webgpu,core,tsl}.js` avec esbuild
(`--minify --format=esm --legal-comments=none`), réécrire les imports, mettre à jour
ce tableau, `@types/three` et [le rendu WebGPU](../docs/webgpu.md).

Rapier : moteur de physique 3D (Rust compilé en WebAssembly). Chargé à la demande
(`import('/rapier.js')`), pendant l'écran de chargement ; voir
[la physique Rapier](../docs/physics-engine.md). Empreinte complète dans le tableau.
