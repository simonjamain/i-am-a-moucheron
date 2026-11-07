// Issue #109: the lasting Meshy rule stays in AGENTS.md, its details and PR
// checklist in docs/asset-pipeline.md, and the PR template points to it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const agents = readFileSync('AGENTS.md', 'utf8');
const pipeline = readFileSync('docs/asset-pipeline.md', 'utf8');
const template = readFileSync('.github/pull_request_template.md', 'utf8');
assert.match(agents, /validation de l'utilisateur avant toute génération/);
assert.match(agents, /image de référence isolée[\s\S]{0,80}par pièce mobile/);
assert.match(agents, /pivots, axes et dimensions/);
assert.match(pipeline, /^## Règle pour tout nouveau modèle Meshy$/m);
assert.match(pipeline, /^### Checklist de PR pour un asset Meshy$/m);
for (const item of [
  "validées par l'utilisateur",
  'référence isolée',
  'SHA-256',
  'Pivots, axes',
  'UV et textures',
  'butées',
  'avant/après',
])
  assert.ok(pipeline.includes(item), 'checklist item: ' + item);
assert.match(template, /## Assets Meshy \(si concernés\)/);
assert.match(template, /asset-pipeline\.md#checklist-de-pr-pour-un-asset-meshy/);
console.log('Meshy rule: AGENTS.md summary, pipeline details, PR checklist and template link.');
