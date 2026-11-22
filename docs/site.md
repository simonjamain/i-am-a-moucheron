# Site de documentation

Le site <https://simonjamain.github.io/i-am-a-moucheron/> présente la documentation
aux joueurs, aux concepteurs et aux développeurs. Il est **généré** : les fichiers
Markdown du dépôt restent la seule référence, on ne rédige rien directement pour le site.

## Publication

Le workflow `.github/workflows/docs-site.yml` construit le site à chaque PR (contrôle
**Docs site**, sans publication) et le publie sur GitHub Pages à chaque commit sur `main`.
La source Pages du dépôt est « GitHub Actions ».

Construction locale (Python 3 et Node) :

```sh
pip install -r requirements-docs.txt
node scripts/build-site.mjs
mkdocs build
```

Le résultat est dans `.site/html` (ignoré par Git) ; `mkdocs serve` donne un aperçu
rechargé à chaud de `.site/src`, à régénérer après modification des sources.

## Ce que fait la construction

`scripts/build-site.mjs` prépare `.site/src` :

- copie `docs/` à la racine du site, et `README.md`, `CONTRIBUTING.md`, `AGENTS.md`
  sous les noms `projet.md`, `contribuer.md` et `agents.md` ;
- réécrit les liens entre documents pour cette disposition ; un lien vers un fichier
  de code (`src/…`, `scripts/…`) ouvre ce fichier sur GitHub ;
- génère **Nouveautés** depuis `src/changelog.ts` (le même historique qu'en jeu),
  la **Galerie visuelle** (toutes les images de `docs/` et les pages qui les utilisent),
  les **Écrans intégrés** (l'aperçu `ui-review.html` avec ses vrais modules de jeu) et
  la **Santé de la documentation** (fraîcheur, renvois, pages hors menu ou au titre daté).

`mkdocs.yml` fixe le thème et le **menu**. MkDocs tourne en mode strict : un lien
cassé ou une page absente du menu fait échouer le contrôle.

## Ajouter ou déplacer une page

1. Écrire la page dans `docs/` (liens relatifs habituels, vérifiés par `npm run check:docs`).
2. L'ajouter au `nav` de `mkdocs.yml`, dans la bonne section : **Le jeu** (joueurs),
   **Conception** (direction artistique, interface, modèles), **Règles détaillées**,
   **Technique** ou **Contribuer**.
3. Depuis `docs/`, viser une page générée (Nouveautés, Galerie, Écrans, Santé) par son
   adresse complète sur le site : elle n'existe pas dans le dépôt.

Les couleurs du site sont dans `docs/site.css`. Material for MkDocs (versions figées dans
`requirements-docs.txt`) est maintenu jusqu'en mai 2027 ; son successeur, Zensical, lit
le même `mkdocs.yml`.
