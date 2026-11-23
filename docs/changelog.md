# Version et nouveautés

Le numéro de version et les nouveautés montrées aux joueurs se déduisent de l'historique
Git. Aucun fichier partagé n'est modifié par plusieurs PR : deux contributions en
parallèle ne peuvent plus se mettre en conflit sur le numéro ou sur le changelog.

## Numéro de version

- La version est un entier : `437 + nombre de commits` de `main` (première parentée)
  depuis le commit de référence `BASELINE` de `scripts/build-info.ts`.
- Les PR sont fusionnées en squash : une PR fusionnée = un commit = un numéro.
- `VERSION` n'est **plus versionné** : `node scripts/build-info.ts` l'écrit (ignoré par
  Git). L'assembleur le fait aussi, donc `npm test`, `npm start` et les builds le
  régénèrent seuls. Ne jamais l'éditer ni le committer.
- Sur une branche, le numéro compte aussi les commits non fusionnés : il sert de repère
  de développement, le numéro définitif est celui du commit de fusion.
- Il faut l'historique complet (`git fetch --unshallow`, `fetch-depth: 0` en CI). Dans un
  clone superficiel, le script avertit et retombe sur 437 ; avec `--strict` (workflows
  Docker) il échoue plutôt que de publier un mauvais numéro.
- Docker n'a pas accès à `.git` : les workflows lancent `node scripts/build-info.ts --strict`
  avant `docker build`, et le `Dockerfile` copie `VERSION` et `src/changelog-recent.ts`.
  En local : lancer la même commande avant `docker build`.

## Nouveautés pour les joueurs

Pour chaque changement visible en jeu, ajouter **un nouveau fichier** dans
[`changelog.d/`](https://github.com/simonjamain/i-am-a-moucheron/tree/main/changelog.d), nommé `sujet-court-ab12.md` :

- une phrase par ligne, en français courant, sans vocabulaire technique, 130 caractères
  au plus (`#` commence un commentaire) : ce qui change **pour le joueur** ;
- le nom doit être unique : suffixe aléatoire, jamais le nom de la branche (réutilisée
  d'une session à l'autre), jamais l'édition d'un fragment existant ni son renommage ;
- aucun fragment pour une contribution purement technique ;
- ne pas écrire de numéro de version : il est calculé.

À la génération, la version d'un fragment est celle du commit qui l'a ajouté ; les
fragments d'un même commit se regroupent sous un seul numéro. `src/changelog-recent.ts`
(généré, ignoré par Git) les expose à `src/changelog.ts`, qui les place avant
l'historique figé de `src/changelog-history.ts` (versions jusqu’à 437, à ne plus modifier).
Le bouton **Nouveautés** et le [site de documentation](site.md) affichent le même résultat.
`npm test` (`test-changelog`, `test-build-info`) vérifie le format des fragments, le calcul
des versions et le rendu.

## Conflits entre PR

Version et nouveautés ne créent pas de conflit. Les autres conflits sont signalés par le
workflow [`conflict-alert`](../.github/workflows/conflict-alert.yml) (label `conflit`) ;
procédure : [CONTRIBUTING](../CONTRIBUTING.md#vérifier-et-fusionner).
