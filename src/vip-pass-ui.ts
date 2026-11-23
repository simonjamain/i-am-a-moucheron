// VIP lane pass (docs/purgatory-queue.md): a small paper slip handed by the guard
// at the VIP lane's gate. No box to tick: the signature pays the wave's price once
// from the common fund, then the rope gate lets this soul through to Saint
// Pierre's second window. The server refuses it when the fund cannot pay.
import { BedUI, type BedSelf } from './bed-ui.ts';
import { vipPrice } from './purgatory-queue.ts';

const money = (n: number): string => (Math.round(n * 100) / 100).toLocaleString('fr-FR') + ' $';

/** Snapshot fields the slip reads: common fund and current wave. */
export interface VipSnapshot {
  base: { epoch: unknown };
  dollars?: number;
  wave?: number;
}

export class VipPassUI extends BedUI {
  price = 1;
  vipSnapshot(): VipSnapshot {
    return this.snapshot() as VipSnapshot;
  }
  cash(): number {
    return this.vipSnapshot().dollars ?? 0;
  }
  override signedText(): string {
    return 'SIGNÉ · Le vigile décroche le cordon. Avancez jusqu’au guichet VIP.';
  }
  override restartText(): string {
    return 'Retournez voir le vigile.';
  }
  override canSign(): boolean {
    return super.canSign() && Math.round(this.cash() * 100) >= this.price * 100;
  }
  override lockedText(): string {
    return `Caisse commune insuffisante : le coupe-file coûte ${money(this.price)}. La file des insectes reste gratuite.`;
  }
  override refreshLock(): void {
    this.root.classList[this.canSign() ? 'remove' : 'add']('locked');
    this.status(this.canSign() ? 'Signez puis relâchez pour payer.' : this.lockedText());
  }
  override open(_bed: { slot: number }, self: BedSelf): void {
    this.price = vipPrice(this.vipSnapshot().wave ?? 0);
    super.open({ slot: -1 }, self);
    if (!this.opened) return;
    this.root.querySelector('h2')!.textContent = 'Coupe-file · Accès VIP';
    this.root.querySelector<HTMLElement>('[data-bed-text]')!.textContent =
      `Je sollicite l’accès à la file prioritaire pour ${money(this.price)}, prélevés une fois sur la caisse commune (tarif de la vague en cours). Les insectes de la file ordinaire conservent leur droit de ronchonner. Le vigile ne rend pas la monnaie et ne garantit pas la bonne humeur de Saint Pierre.`;
    const ledger = this.root.querySelector<HTMLElement>('[data-ledger]');
    const cash = this.cash();
    if (ledger?.ownerDocument) {
      const doc = ledger.ownerDocument;
      ledger.replaceChildren(
        ...(
          [
            ['Solde de la caisse commune', money(cash)],
            ['Coupe-file', '− ' + money(this.price)],
            ['Solde après signature', money(cash - this.price), 'total'],
          ] as const
        ).flatMap(([label, value, kind]) => {
          const dt = doc.createElement('dt'),
            dd = doc.createElement('dd');
          dt.textContent = label;
          dd.textContent = value;
          if (kind) dt.className = dd.className = kind;
          return [dt, dd];
        }),
      );
    }
    this.refreshLock();
  }
  // A soul's slip: closes when the dossier no longer belongs to this death.
  override observe(self: BedSelf | null | undefined): void {
    if (
      this.opened &&
      (this.snapshot().base.epoch !== this.epoch ||
        self?.incarnation !== this.incarnation ||
        self?.life !== 'dead')
    ) {
      this.invalidated = true;
      if (!this.busy) this.close();
    }
  }
}
