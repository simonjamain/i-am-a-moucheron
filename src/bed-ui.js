export class BedUI {
  constructor({ root, snapshot, command, accept, ground, onOpen, onClose, archive }) {
    Object.assign(this, { root, snapshot, command, accept, ground, onOpen, onClose, archive });
    this.opened = false;
    this.busy = false;
    this.canvas = root.querySelector('canvas');
    this.ink = this.canvas.getContext('2d');
    this.pointer = null;
    this.points = [];
    root.querySelector('[data-bed-close]').onclick = () => this.close();
    root.querySelector('[data-bed-clear]').onclick = () => {
      if (!this.busy) this.clear();
    };
    this.canvas.onpointerdown = (e) => {
      e.preventDefault();
      if (this.busy || this.pointer !== null) return;
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
  point(e) {
    const r = this.canvas.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    ];
  }
  clear() {
    const p = this.pointer;
    this.pointer = null;
    this.points = [];
    if (p !== null && this.canvas.hasPointerCapture?.(p)) this.canvas.releasePointerCapture(p);
    this.ink.clearRect(0, 0, this.canvas.width, this.canvas.height);
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
  open(bed, self) {
    if (this.busy) return;
    this.opened = true;
    this.invalidated = false;
    this.bed = bed.slot;
    this.cancel = self.bedId === bed.slot;
    this.epoch = this.snapshot().base.epoch;
    this.incarnation = self.incarnation;
    this.clear();
    this.root.querySelector('h2').textContent = this.cancel
      ? 'Résiliation du domicile posthume'
      : 'Contrat personnel de réapparition';
    this.root.querySelector('[data-bed-text]').textContent = this.cancel
      ? 'Je renonce à ce lit comme destination de retour. Ma prochaine résurrection utilisera la zone de départ. Aucun déménagement immédiat : les draps ne constituent pas un moyen de transport.'
      : 'Après mon passage au purgatoire, je demande à réapparaître à ce lit. Ce contrat remplace mon précédent point personnel et ne réserve pas le matelas aux autres joueurs. Si le lit disparaît ou devient impraticable, retour au départ. Le service décline toute responsabilité pour les ronflements des ressuscités.';
    this.root.querySelector('[data-bed-status]').textContent =
      'Signez puis relâchez pour confirmer.';
    this.root.classList.remove('hidden');
    this.onOpen();
  }
  observe(self) {
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
    this.opened = false;
    this.clear();
    this.root.classList.add('hidden');
    this.onClose();
  }
  async submit() {
    if (this.busy || !this.opened) return;
    this.busy = true;
    this.root.querySelector('[data-bed-close]').disabled = true;
    this.root.querySelector('[data-bed-status]').textContent = 'Transmission du contrat…';
    const ink = this.canvas.toDataURL('image/png');
    let success = false;
    try {
      const result = await this.command({
        bed: this.bed,
        cancel: this.cancel,
        signature: true,
        epoch: this.epoch,
        incarnation: this.incarnation,
        ground: this.ground(),
      });
      this.accept(result);
      if (this.snapshot().base.epoch === this.epoch)
        this.archive({
          title: this.cancel ? 'Résiliation du lit' : 'Contrat de réapparition',
          ink,
        });
      this.root.querySelector('[data-bed-status]').textContent = 'SIGNÉ · Destination mise à jour.';
      this.clear();
      success = true;
    } catch (e) {
      this.root.querySelector('[data-bed-status]').textContent = e.message;
      this.clear();
    } finally {
      this.busy = false;
      this.root.querySelector('[data-bed-close]').disabled = false;
      if (success || this.invalidated) this.close();
    }
  }
}
