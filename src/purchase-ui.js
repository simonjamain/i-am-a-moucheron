import { BedUI } from './bed-ui.js';
import { SHOP, shopPrice, purchaseCount } from './equipment.ts';
import { ClauseSheet, PURCHASE_MOTIVES, stamp } from './paper-form.ts';
// Same pointer-cancel, ACK and ink lifecycle as the personal bed contract, on a
// paper order: a motive to tick before signing (docs/ui-guidelines.md). The
// « convenance personnelle » clause is really refused: the order is stamped
// REFUSÉ, nothing is bought, and the player starts again from the workshop.
const STAMP_LINGER_MS = 900;
const REFUSAL_LINGER_MS = 1600;
const money = (n) => (Math.round(n * 100) / 100).toLocaleString('fr-FR') + ' $';
export class PurchaseUI extends BedUI {
  open(item, self) {
    clearTimeout(this.linger);
    this.root.classList.remove('leaving');
    this.root.querySelector('[data-stamp]')?.classList.remove('printed');
    this.keepInk = false;
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
    if (ledger && Number.isFinite(cash))
      ledger.textContent = `Caisse commune : ${money(cash)} · Prix : − ${money(this.price)} · Après signature : ${money(cash - this.price)}`;
    this.clauses = new ClauseSheet(
      PURCHASE_MOTIVES,
      this.root.querySelector('[data-clauses]'),
      () => this.refreshLock(),
    );
    this.refreshLock();
  }
  canSign() {
    return !!this.clauses?.complete;
  }
  signBlocked() {
    this.root.querySelector('[data-bed-status]').textContent = 'Cochez un motif avant de signer.';
  }
  refreshLock() {
    this.root.classList[this.canSign() ? 'remove' : 'add']('locked');
    this.root.querySelector('[data-bed-status]').textContent = this.canSign()
      ? 'Signez puis relâchez pour confirmer.'
      : 'Cochez un motif, puis signez.';
  }
  async submit() {
    if (this.busy || !this.opened) return;
    if (this.clauses?.refused) {
      this.refuse();
      return;
    }
    await super.submit();
  }
  // Really refused: no command is sent; the document closes and must be started again.
  refuse() {
    this.keepInk = true;
    stamp(this.root.querySelector('[data-stamp]'), 'REFUSÉ', true);
    this.root.querySelector('[data-bed-status]').textContent =
      'Demande refusée : la convenance personnelle n’est pas un motif réglementaire. Recommencez la commande depuis l’atelier.';
    this.invalidated = true;
    this.closeLingering(REFUSAL_LINGER_MS);
  }
  signed() {
    stamp(this.root.querySelector('[data-stamp]'), 'APPROUVÉ');
    this.root.querySelector('[data-bed-status]').textContent =
      'SIGNÉ · Commande transmise à l’intendance.';
    this.keepInk = true;
    this.stamped = true;
  }
  // The signature stays on the stamped sheet until it leaves the screen.
  clear() {
    if (!this.keepInk) {
      super.clear();
      return;
    }
    this.pointer = null;
    this.points = [];
  }
  close() {
    if (this.busy) return;
    if (this.stamped) {
      this.stamped = false;
      this.closeLingering(STAMP_LINGER_MS);
      return;
    }
    super.close();
  }
  // Closes now (the game takes over) while the stamped sheet stays a moment on screen.
  closeLingering(ms) {
    super.close();
    this.root.classList.remove('hidden');
    this.root.classList.add('leaving');
    clearTimeout(this.linger);
    this.linger = setTimeout(() => {
      this.root.classList.add('hidden');
      this.root.classList.remove('leaving');
    }, ms);
  }
}
