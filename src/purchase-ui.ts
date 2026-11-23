import { BedUI } from './bed-ui.ts';
import { SHOP, shopPrice, purchaseCount } from './equipment.ts';
import { purchaseMotives } from './paper-form.ts';
import type { BedSelf, BedSnapshot } from './bed-ui.ts';
import type { PriceBalance, PurchaseSnapshot, ShopKey } from './equipment.ts';
import type { ClauseRule } from './paper-form.ts';
// Workshop order on the same paper document as the bed contract (BedUI): motive,
// common-fund ledger, signature, stamp. Each order draws its motives; « convenance
// personnelle (systématiquement refusé) » is refused and the order must be started
// again from the workshop.
/** The snapshot fields read by the workshop order (beyond the bed contract's). */
export interface PurchaseUISnapshot extends BedSnapshot, PurchaseSnapshot {
  balance?: PriceBalance | null;
  dollars?: number;
}
const money = (n: number) => (Math.round(n * 100) / 100).toLocaleString('fr-FR') + ' $';
export class PurchaseUI extends BedUI {
  item!: ShopKey;
  request!: string;
  price!: number;
  override motives(): ClauseRule | null {
    return purchaseMotives();
  }
  override signedText(): string {
    return 'SIGNÉ · Commande transmise à l’intendance.';
  }
  override restartText(): string {
    return 'Recommencez la commande depuis l’atelier.';
  }
  // @ts-expect-error -- opens on a shop item, not a bed slot: PurchaseUI is not a
  // drop-in BedUI (see docs/tasks/typescript-migration.md).
  override open(item: ShopKey, self: BedSelf): void {
    super.open({ slot: -1 }, self);
    this.item = item;
    this.request =
      globalThis.crypto?.randomUUID?.() ||
      Date.now().toString(36) +
        '-' +
        Math.random().toString(36).slice(2) +
        '-' +
        Math.random().toString(36).slice(2);
    this.price = shopPrice(
      item,
      purchaseCount(this.snapshot() as PurchaseUISnapshot, item),
      (this.snapshot() as PurchaseUISnapshot).balance,
    );
    this.root.querySelector('h2')!.textContent = 'Bon de commande · ' + SHOP[item].name;
    this.root.querySelector('[data-bed-text]')!.textContent =
      `Je commande ${SHOP[item].name} pour ${this.price} $. La caisse commune sera débitée une fois à la signature. Depuis un appareil, le colis descend sous parachute ; à pied, un clic posera cet objet sans autre paiement ni signature. Échap conserve l’achat pour reprise dans l’atelier pendant cette connexion ; une déconnexion prolongée rembourse les objets non posés, une remise à zéro les supprime. Le ministère ne rembourse pas les hésitations décoratives.`;
    const ledger = this.root.querySelector('[data-ledger]');
    const cash = (this.snapshot() as PurchaseUISnapshot).dollars;
    if (ledger?.ownerDocument && Number.isFinite(cash)) {
      const doc = ledger.ownerDocument;
      ledger.replaceChildren(
        ...[
          ['Solde de la caisse commune', money(cash!)],
          ['Prix réglementaire', '− ' + money(this.price)],
          ['Solde après signature', money(cash! - this.price), 'total'],
        ].flatMap(([label, value, kind]) => {
          const dt = doc.createElement('dt'),
            dd = doc.createElement('dd');
          dt.textContent = label;
          dd.textContent = value;
          if (kind) dt.className = dd.className = kind;
          return [dt, dd];
        }),
      );
    }
  }
}
