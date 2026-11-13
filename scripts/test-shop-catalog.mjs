// Shop menu: one column per category, items from weakest (top) to strongest
// (bottom) by price, a picture for every purchasable item, no item hidden.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SHOP } from '../src/equipment.js';
import { SHOP_CATEGORIES, shopColumns } from '../src/shop-catalog.js';

const columns = shopColumns();
assert.deepEqual(
  columns.map((c) => c.title),
  ['Aéronefs', 'Véhicules au sol', 'Installations', 'Améliorations'],
);
const placed = columns.flatMap((c) => c.items);
assert.deepEqual([...placed].sort(), Object.keys(SHOP).sort(), 'every item once, none hidden');
for (const column of columns) {
  const costs = column.items.map((k) => SHOP[k].cost);
  assert.deepEqual(
    costs,
    [...costs].sort((a, b) => a - b),
    column.title + ' sorted by price',
  );
}
assert.equal(columns[0].items[0], 'fighter');
assert.equal(columns[0].items.at(-1), 'flyingcastor');
assert.equal(columns[1].items[0], 'tank');
assert.equal(columns[1].items.at(-1), 'flaktruck');
// A future item that no category lists still appears, in a last column.
const extra = shopColumns({ ...SHOP, rocketpack: { name: 'x', cost: 1, kind: 'vehicle' } });
assert.deepEqual(extra.at(-1), { id: 'other', title: 'Autres', items: ['rocketpack'] });
assert.ok(
  SHOP_CATEGORIES.every((c) => c.items.every((k) => SHOP[k])),
  'categories list real items',
);

// The client builds a card (picture, name, price) per item from this layout.
const client = readFileSync('src/client.js', 'utf8');
assert.match(client, /for \(const column of shopColumns\(\)\)/);
assert.match(client, /shopThumbs\.picture\(item\)/);
// Simplified cards: the whole card is the button; no description, no "Signer le bon".
const card = client.slice(
  client.indexOf('function shopCard('),
  client.indexOf('async function purchase('),
);
assert.match(card, /createElement\('button'\)/);
assert.match(card, /card\.onclick/);
assert.doesNotMatch(card, /description|Signer le bon|createElement\('p'\)/);
const thumbs = readFileSync('src/shop-thumbs.js', 'utf8');
for (const item of [
  'fighter',
  'bomber',
  'interceptor',
  'spitfire',
  'helicopter',
  'flaktruck',
  'tank',
  'castor',
])
  assert.match(thumbs, new RegExp(item + ':'), item + ' has a picture');
for (const kind of ['bed', 'refuel', 'radar', 'dca'])
  assert.match(thumbs, new RegExp("'" + kind + "'"));
console.log('Shop catalog: columns by category, price-sorted, pictures for every item');
