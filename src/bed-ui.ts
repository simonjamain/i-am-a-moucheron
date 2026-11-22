import { BED_CANCEL_MOTIVES, BED_MOTIVES, ClauseSheet, REFUSAL_TEXT, stamp } from './paper-form.ts';
import type { ClauseRule } from './paper-form.ts';
// Paper document with a signature (docs/ui-guidelines.md): personal bed contract,
// base of the workshop order (PurchaseUI). A motive is ticked first (never by
// default); the signature, released, sends the document; APPROUVÉ is stamped on
// the signed sheet, which leaves the screen while the game goes on. The clause
// « convenance personnelle » is really refused: REFUSÉ, nothing sent, the sheet
// closes and the request must be started again.
const STAMP_LINGER_MS = 900;
const REFUSAL_LINGER_MS = 1600;
/** The snapshot fields read by the bed contract. */
export interface BedSnapshot {
  base: { epoch: unknown };
}
/** Body of the `bed-contract` command (the server only receives `signature: true`). */
export interface BedContractBody {
  bed: number;
  cancel: boolean;
  signature: true;
  epoch: unknown;
  incarnation: number | undefined;
  ground: unknown;
}
/** The player fields read when opening or watching the document. */
export interface BedSelf {
  bedId?: number | null;
  incarnation?: number;
  life?: string;
}
export interface BedUIOptions {
  root: HTMLElement;
  snapshot: () => BedSnapshot;
  command: (body: BedContractBody) => Promise<unknown>;
  accept: (result: unknown) => void;
  ground: () => unknown;
  onOpen: () => void;
  onClose: () => void;
}
type InkPoint = [number, number];
export class BedUI {
  root!: HTMLElement;
  snapshot!: BedUIOptions['snapshot'];
  command!: BedUIOptions['command'];
  accept!: BedUIOptions['accept'];
  ground!: BedUIOptions['ground'];
  onOpen!: BedUIOptions['onOpen'];
  onClose!: BedUIOptions['onClose'];
  opened: boolean;
  busy: boolean;
  canvas: HTMLCanvasElement;
  ink: CanvasRenderingContext2D;
  pointer: number | null;
  points: InkPoint[];
  refusing?: boolean;
  keepInk?: boolean;
  stamped?: boolean;
  invalidated?: boolean;
  linger?: ReturnType<typeof setTimeout>;
  bed?: number;
  cancel?: boolean;
  epoch?: unknown;
  incarnation?: number;
  clauses?: ClauseSheet;
  constructor({ root, snapshot, command, accept, ground, onOpen, onClose }: BedUIOptions) {
    Object.assign(this, { root, snapshot, command, accept, ground, onOpen, onClose });
    this.opened = false;
    this.busy = false;
    this.canvas = root.querySelector('canvas')!;
    this.ink = this.canvas.getContext('2d')!;
    this.pointer = null;
    this.points = [];
    root.querySelector<HTMLElement>('[data-bed-close]')!.onclick = () => this.close();
    this.canvas.onpointerdown = (e) => {
      e.preventDefault();
      if (this.busy || this.pointer !== null || this.refusing) return;
      if (!this.canSign()) {
        this.status('Cochez un motif avant de signer.');
        return;
      }
      this.pointer = e.pointerId;
      this.canvas.setPointerCapture?.(e.pointerId);
      this.points = [this.point(e)];
    };
    this.canvas.onpointermove = (e) => {
      if (e.pointerId !== this.pointer) return;
      this.points.push(this.point(e));
      this.draw();
    };
    this.canvas.onpointerup = (e) => {
      if (e.pointerId !== this.pointer) return;
      this.points.push(this.point(e));
      this.pointer = null;
      this.draw();
      let d = 0;
      for (let i = 1; i < this.points.length; i++)
        d += Math.hypot(
          this.points[i][0] - this.points[i - 1][0],
          this.points[i][1] - this.points[i - 1][1],
        );
      if (d > 0.12) this.submit();
      else this.clear();
    };
    this.canvas.onpointercancel = () => this.clear();
    this.canvas.onlostpointercapture = () => {
      this.pointer = null;
    };
  }
  status(text: string): void {
    this.root.querySelector<HTMLElement>('[data-bed-status]')!.textContent = text;
  }
  // Clauses of the document being opened (a ClauseRule from paper-form.ts).
  motives(): ClauseRule {
    return this.cancel ? BED_CANCEL_MOTIVES : BED_MOTIVES;
  }
  // Text after a confirmed signature, and where to start again after a refusal.
  signedText(): string {
    return 'SIGNÉ · Destination mise à jour.';
  }
  restartText(): string {
    return 'Revenez au lit pour recommencer.';
  }
  canSign(): boolean {
    return !!this.clauses?.complete;
  }
  refreshLock() {
    this.root.classList[this.canSign() ? 'remove' : 'add']('locked');
    this.status(
      this.canSign() ? 'Signez puis relâchez pour confirmer.' : 'Cochez un motif, puis signez.',
    );
  }
  point(e: { clientX: number; clientY: number }): InkPoint {
    const r = this.canvas.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    ];
  }
  // The signature stays on a stamped sheet until it leaves the screen.
  clear() {
    const p = this.pointer;
    this.pointer = null;
    this.points = [];
    if (p !== null && this.canvas.hasPointerCapture?.(p)) this.canvas.releasePointerCapture(p);
    if (!this.keepInk) this.ink.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
  draw() {
    this.ink.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ink.beginPath();
    this.ink.lineWidth = 3;
    this.ink.strokeStyle = '#183832';
    this.points.forEach(([x, y], i) =>
      this.ink[i ? 'lineTo' : 'moveTo'](x * this.canvas.width, y * this.canvas.height),
    );
    this.ink.stroke();
    if (this.points.length > 300)
      this.points = this.points.filter((_, i, a) => i % 2 === 0 || i === a.length - 1);
  }
  open(bed: { slot: number }, self: BedSelf): void {
    if (this.busy) return;
    clearTimeout(this.linger);
    this.root.classList.remove('leaving');
    this.root.querySelector<HTMLElement>('[data-stamp]')?.classList.remove('printed');
    this.keepInk = false;
    this.stamped = false;
    this.refusing = false;
    this.opened = true;
    this.invalidated = false;
    this.bed = bed.slot;
    this.cancel = self.bedId === bed.slot;
    this.epoch = this.snapshot().base.epoch;
    this.incarnation = self.incarnation;
    this.clear();
    this.root.querySelector('h2')!.textContent = this.cancel
      ? 'Résiliation du domicile posthume'
      : 'Contrat personnel de réapparition';
    this.root.querySelector<HTMLElement>('[data-bed-text]')!.textContent = this.cancel
      ? 'Je renonce à ce lit comme destination de retour. Ma prochaine résurrection utilisera la zone de départ. Aucun déménagement immédiat : les draps ne constituent pas un moyen de transport.'
      : 'Après mon passage au purgatoire, je demande à réapparaître à ce lit. Ce contrat remplace mon précédent point personnel et ne réserve pas le matelas aux autres joueurs. Si le lit disparaît ou devient impraticable, retour au départ. Le service décline toute responsabilité pour les ronflements des ressuscités.';
    this.clauses = new ClauseSheet(
      this.motives(),
      this.root.querySelector<HTMLElement>('[data-clauses]'),
      () => this.refreshLock(),
    );
    this.refreshLock();
    this.root.classList.remove('hidden');
    this.onOpen();
  }
  observe(self: BedSelf | null | undefined): void {
    if (
      this.opened &&
      (this.snapshot().base.epoch !== this.epoch ||
        self?.incarnation !== this.incarnation ||
        self?.life !== 'alive')
    ) {
      this.invalidated = true;
      if (!this.busy) this.close();
    }
  }
  close() {
    if (this.busy) return;
    if (this.stamped) {
      this.stamped = false;
      this.closeLingering(STAMP_LINGER_MS);
      return;
    }
    this.opened = false;
    this.clear();
    this.root.classList.add('hidden');
    this.onClose();
  }
  // Closes now (the game takes over) while the stamped sheet stays a moment on screen.
  closeLingering(ms: number): void {
    this.opened = false;
    this.clear();
    this.root.classList.add('leaving');
    this.onClose();
    clearTimeout(this.linger);
    this.linger = setTimeout(() => {
      this.root.classList.add('hidden');
      this.root.classList.remove('leaving');
      this.keepInk = false;
    }, ms);
  }
  // Really refused: no command is sent; the document closes and must be started again.
  refuse() {
    this.keepInk = true;
    this.refusing = true;
    stamp(this.root.querySelector<HTMLElement>('[data-stamp]'), 'REFUSÉ', true);
    this.status(REFUSAL_TEXT + ' ' + this.restartText());
    this.invalidated = true;
    this.closeLingering(REFUSAL_LINGER_MS);
  }
  async submit() {
    if (this.busy || !this.opened) return;
    if (this.clauses?.refused) {
      this.refuse();
      return;
    }
    this.busy = true;
    this.root.querySelector<HTMLButtonElement>('[data-bed-close]')!.disabled = true;
    this.status('Transmission du contrat…');
    let success = false;
    try {
      const result = await this.command({
        bed: this.bed!,
        cancel: this.cancel!,
        signature: true,
        epoch: this.epoch,
        incarnation: this.incarnation,
        ground: this.ground(),
      });
      this.accept(result);
      stamp(this.root.querySelector<HTMLElement>('[data-stamp]'), 'APPROUVÉ');
      this.status(this.signedText());
      this.keepInk = true;
      this.stamped = true;
      success = true;
    } catch (e) {
      this.status((e as Error).message);
      this.clear();
    } finally {
      this.busy = false;
      this.root.querySelector<HTMLButtonElement>('[data-bed-close]')!.disabled = false;
      if (success || this.invalidated) this.close();
    }
  }
}
