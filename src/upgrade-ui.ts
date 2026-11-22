import { BedUI, type BedSelf } from './bed-ui.ts';
import type { ClauseRule } from './paper-form.ts';
import { TURRET_NAMES, upgradeCost, upgradesOf, type TurretKind } from './ground-sentry.ts';

// Refit order of an automatic turret (docs/gatling-turret.md, « Amélioration »): the
// same paper document as the workshop order (BedUI). One box per variant of the
// turret's upgrade tree, ticked by hand, then the signature. Signing without the
// funds gets the document stamped REFUSÉ and nothing is sent.
const money = (n: number): string => (Math.round(n * 100) / 100).toLocaleString('fr-FR') + ' $';

/** The turret being refitted, as the ground defense snapshot lists it. */
export interface UpgradeTurret {
  id: string;
  kind: TurretKind;
}
export interface UpgradeSnapshot {
  base: { epoch: unknown };
  dollars?: number;
  groundDefense?: { structures?: readonly { id: string; kind: string; hp: number }[] };
}

export class UpgradeUI extends BedUI {
  turret: UpgradeTurret | null = null;
  upgradeSnapshot(): UpgradeSnapshot {
    return this.snapshot() as UpgradeSnapshot;
  }
  cash(): number {
    return this.upgradeSnapshot().dollars ?? 0;
  }
  /** Variant ticked on the form, or the first one offered while none is. */
  variant(): TurretKind | null {
    const offered = upgradesOf(this.turret?.kind);
    const ticked = offered.find((v) => this.clauses?.state.checked.has(v));
    return ticked ?? offered[0] ?? null;
  }
  price(): number {
    const variant = this.variant();
    return variant ? upgradeCost(variant) : 0;
  }
  override motives(): ClauseRule | null {
    const offered = upgradesOf(this.turret?.kind);
    return Object.freeze({
      title: 'Variante demandée (cocher une case)',
      exclusive: true,
      min: 1,
      clauses: Object.freeze(
        offered.map((v) => ({
          id: v,
          text: `Refonte en « ${TURRET_NAMES[v]} » : remise à neuf et pleins de munitions, ${money(upgradeCost(v))}`,
        })),
      ),
    });
  }
  override signedText(): string {
    return 'SIGNÉ · L’atelier remet la tourelle à neuf.';
  }
  override restartText(): string {
    return 'Revenez devant la tourelle pour recommencer.';
  }
  override declined(): boolean {
    return this.cash() + 1e-8 < this.price();
  }
  override refusalText(): string {
    return 'Demande refusée : la caisse commune ne couvre pas la refonte.';
  }
  override lockedText(): string {
    return 'Cochez une variante avant de signer.';
  }
  override refreshLock(): void {
    this.root.classList[this.canSign() ? 'remove' : 'add']('locked');
    this.status(
      this.canSign() ? 'Signez puis relâchez pour confirmer.' : 'Cochez une variante, puis signez.',
    );
    this.ledger();
  }
  ledger(): void {
    const ledger = this.root.querySelector<HTMLElement>('[data-ledger]');
    if (!ledger?.ownerDocument) return;
    const doc = ledger.ownerDocument,
      cash = this.cash(),
      price = this.price();
    ledger.replaceChildren(
      ...(
        [
          ['Solde de la caisse commune', money(cash)],
          ['Prix de la refonte', '− ' + money(price)],
          ['Solde après signature', money(cash - price), 'total'],
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
  openTurret(turret: UpgradeTurret, self: BedSelf): void {
    if (this.busy || !upgradesOf(turret.kind).length) return;
    this.turret = { id: turret.id, kind: turret.kind };
    super.open({ slot: -1 }, self);
    if (!this.opened) return;
    this.root.querySelector('h2')!.textContent = 'Ordre de refonte · ' + TURRET_NAMES[turret.kind];
    this.root.querySelector<HTMLElement>('[data-bed-text]')!.textContent =
      'Je demande la refonte de cette tourelle dans la variante cochée ci-dessous. Le prix est prélevé une fois sur la caisse commune ; la tourelle repart réparée, avec ses munitions au maximum. La variante est définitive : l’atelier ne reprend pas les modèles précédents.';
  }
  // The form closes when its turret is gone, ruined or already refitted by someone else.
  override observe(self: BedSelf | null | undefined): void {
    super.observe(self);
    if (!this.opened || !this.turret) return;
    const structure = this.upgradeSnapshot().groundDefense?.structures?.find(
      (s) => s.id === this.turret!.id,
    );
    if (structure && structure.kind === this.turret.kind && structure.hp > 0) return;
    this.invalidated = true;
    if (!this.busy) this.close();
  }
}
