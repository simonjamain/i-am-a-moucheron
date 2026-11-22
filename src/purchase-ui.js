import { BedUI } from './bed-ui.ts';
import { SHOP, shopPrice, purchaseCount } from './equipment.ts';
import { PURCHASE_MOTIVES } from './paper-form.ts';
// Workshop order on the same paper document as the bed contract (BedUI): motive,
// common-fund ledger, signature, stamp; « convenance personnelle » is refused and
// the order must be started again from the workshop.
const money = (n) => (Math.round(n * 100) / 100).toLocaleString('fr-FR') + ' $';
export class PurchaseUI extends BedUI {
  motives() {
    return PURCHASE_MOTIVES;
  }
  signedText() {
    return 'SIGNÉ · Commande transmise à l’intendance.';
  }
  restartText() {
    return 'Recommencez la commande depuis l’atelier.';
  }
  open(item, self) {
    super.open({ slot: -1 }, self);
    this.item = item;
    this.request =
      globalThis.crypto?.randomUUID?.() ||
      Date.now().toString(36) +
        '-' +
        Math.random().toString(36).slice(2) +
        '-' +
        Math.random().toString(36).slice(2);
    this.price = shopPrice(item, purchaseCount(this.snapshot(), item), this.snapshot().balance);
    this.root.querySelector('h2').textContent = 'Bon de commande · ' + SHOP[item].name;
    this.root.querySelector('[data-bed-text]').textContent =
      `Je commande ${SHOP[item].name} pour ${this.price} $. La caisse commune sera débitée une fois à la signature. Depuis un appareil, le colis descend sous parachute ; à pied, E posera cet objet sans autre paiement ni signature. Échap conserve l’achat pour reprise dans l’atelier pendant cette connexion ; une déconnexion prolongée rembourse les objets non posés, une remise à zéro les supprime. Le ministère ne rembourse pas les hésitations décoratives.`;
    const ledger = this.root.querySelector('[data-ledger]');
    const cash = this.snapshot().dollars;
    if (ledger?.ownerDocument && Number.isFinite(cash)) {
      const doc = ledger.ownerDocument;
      ledger.replaceChildren(
        ...[
          ['Solde de la caisse commune', money(cash)],
          ['Prix réglementaire', '− ' + money(this.price)],
          ['Solde après signature', money(cash - this.price), 'total'],
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
