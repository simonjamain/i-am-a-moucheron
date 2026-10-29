import { BedUI } from './bed-ui.js';
import { SHOP, shopPrice, purchaseCount } from './equipment.js';
// Same pointer-cancel, ACK and ink lifecycle as the personal bed contract.
export class PurchaseUI extends BedUI {
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
    this.price = shopPrice(item, this.snapshot().upgrades, purchaseCount(this.snapshot(), item));
    this.root.querySelector('h2').textContent = 'Bon de commande · ' + SHOP[item].name;
    this.root.querySelector('[data-bed-text]').textContent =
      `Je commande ${SHOP[item].name} pour ${this.price} $. La caisse commune sera débitée une fois à la signature. E posera ensuite cet objet sans autre paiement ni signature. Échap conserve l’achat pour reprise dans l’atelier pendant cette connexion ; une déconnexion prolongée rembourse les objets non posés, une remise à zéro les supprime. Le ministère ne rembourse pas les hésitations décoratives.`;
  }
}
