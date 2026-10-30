# Notes de reprise par tâche

Créer une note `<identifiant-de-tache>.md` lorsqu'un travail dépasse une session,
est interrompu ou transmis. Une tâche courte peut garder ces informations dans
sa PR. Lier la note depuis l'issue ou la PR ; chaque agent modifie celle de sa tâche.
Lire la note à la reprise, puis vérifier la branche, les derniers commits et les
résultats : la note est un aide-mémoire, pas une preuve que le code fonctionne.

Conserver uniquement les informations nécessaires à la prochaine session :

```markdown
# Identifiant — objectif

- Tâche / PR : liens.
- Branche et dernier commit vérifié : références exactes.
- Résultat attendu : critères observables et périmètre.
- État réel : terminé, en cours, restant ; fichiers ou symboles utiles.
- Vérifications : commandes, résultats et commit testé ; essais non effectués.
- Blocages / hypothèses : faits distingués des pistes ; tentatives infructueuses utiles.
- Prochaine action : première étape concrète pour reprendre.
```

Actualiser à un jalon significatif ou avant interruption, sans journal de chaque
outil ni transcription du raisonnement. Garder secrets et données personnelles
hors des notes. Mettre les décisions durables dans leur document de référence
et les lier. À la clôture, résumer le résultat dans la PR et supprimer la note
transitoire si elle n'apporte plus d'information utile.
