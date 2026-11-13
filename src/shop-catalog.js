// Shop layout: one column per category, items sorted from weakest (top) to
// strongest (bottom) by base price, which tracks power across the catalogue.
import { SHOP } from './equipment.js';

export const SHOP_CATEGORIES = Object.freeze([
  {
    id: 'air',
    title: 'Aéronefs',
    items: ['fighter', 'interceptor', 'bomber', 'spitfire', 'helicopter', 'flyingcastor'],
  },
  { id: 'ground', title: 'Véhicules au sol', items: ['tank', 'castor', 'flaktruck'] },
  { id: 'base', title: 'Installations', items: ['bed', 'refuel', 'radar', 'dca'] },
  { id: 'upgrades', title: 'Améliorations', items: ['engine', 'weapons'] },
]);

// Columns in display order; items missing from every category land in a last
// "Autres" column so a new SHOP entry is never hidden.
export function shopColumns(shop = SHOP) {
  const listed = new Set(SHOP_CATEGORIES.flatMap((c) => c.items));
  const columns = SHOP_CATEGORIES.map((c) => ({ ...c, items: c.items.filter((k) => shop[k]) }));
  const others = Object.keys(shop).filter((k) => !listed.has(k));
  if (others.length) columns.push({ id: 'other', title: 'Autres', items: others });
  return columns
    .map((c) => ({
      ...c,
      // Stable sort: equal prices keep the order written above.
      items: c.items
        .map((key, order) => ({ key, order }))
        .sort((a, b) => shop[a.key].cost - shop[b.key].cost || a.order - b.order)
        .map((e) => e.key),
    }))
    .filter((c) => c.items.length);
}
