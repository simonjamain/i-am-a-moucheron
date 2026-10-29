# Pistolet : diagnostic et correction ARM-02

Le diagnostic initial DIA-01 était volontairement sans correction. ARM-02 autorise
et livre désormais la correction : caméra au-dessus de l’épaule, bras et main
alignés, point de visée choisi au réticule puis rayon depuis la bouche physique
du pistolet, avec nouveau contrôle des obstacles. Les règles de dégâts et de
portée restent inchangées.

Référence actuelle, causes, valeurs et limites : [retours terrain](field-update.md#pistolet-à-lépaule).
`node scripts/diagnose-pistol.mjs` exécute le vrai `pistol()` et ses raycasts ;
`test-field-backlog.mjs` vérifie orientations, échelles, dégagement du torse et
obstacles. L’ancienne analyse est [archivée](archive/pistol-before-arm02.md).

Le [lot suivant de lisibilité et nettoyage](clean-flight.md) précise les commandes
contextuelles actuelles, les effets partagés et les nouvelles collisions de coque.
