export const dollars = (cents) =>
  (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
  ' $';
const rate = (loan) => (loan.rate * 100).toLocaleString('fr-FR') + ' %';
export function loanText(loan, repay = false) {
  return repay
    ? `Je demande le remboursement anticipé du contrat ${loan.serial} : ${dollars(loan.remaining)} de capital restant, sans intérêts futurs. La banque rend sa calculette, mais garde son sourire inquiétant. Le montant est revérifié au dépôt ; toute échéance intervenue impose de relire ce document.`
    : `La Banque de la Dernière Volonté prête ${dollars(loan.principal)} à la caisse commune. Taux fixe : ${rate(loan)} par vague, sur ${loan.waves} vagues. Échéance : ${dollars(loan.payment)}, coût total : ${dollars(loan.total)}. La dernière échéance ajuste les arrondis. Les prélèvements continuent même avec un solde négatif. Un nouvel emprunt exige un solde non négatif. Le remboursement anticipé porte uniquement sur le capital restant. Votre avion peut tomber ; vos échéances restent debout.`;
}

export class BankUI {
  constructor({ root, document, snapshot, command, accept, onOpen, onClose, archive = () => {} }) {
    Object.assign(this, { root, document, snapshot, command, accept, onOpen, onClose, archive });
    this.opened = false;
    this.busy = false;
    this.selection = null;
    this.points = [];
    this.pointer = null;
    root.onkeydown = (event) => {
      if (event.key !== 'Tab') return;
      const focusable = [...root.querySelectorAll('button:not(:disabled), summary, canvas')].filter(
        (el) => !el.closest('.hidden'),
      );
      const first = focusable[0],
        last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    this.cards = root.querySelector('[data-bank-cards]');
    this.sheet = root.querySelector('[data-bank-sheet]');
    this.status = root.querySelector('[data-bank-status]');
    this.canvas = root.querySelector('canvas');
    this.ink = this.canvas.getContext('2d');
    root.querySelector('[data-bank-close]').onclick = () => this.close();
    root.querySelector('[data-bank-back]').onclick = () => {
      if (!this.busy) {
        this.selection = null;
        this.clear();
        this.render();
      }
    };
    root.querySelector('[data-bank-clear]').onclick = () => {
      if (!this.busy) this.clear();
    };
    this.canvas.onpointerdown = (e) => {
      e.preventDefault();
      if (this.busy || this.pointer !== null || !this.selection) return;
      this.pointer = e.pointerId;
      this.canvas.setPointerCapture?.(e.pointerId);
      this.points = [this.point(e)];
    };
    this.canvas.onpointermove = (e) => {
      if (this.pointer !== e.pointerId) return;
      this.points.push(this.point(e));
      this.draw();
    };
    this.canvas.onpointerup = (e) => {
      if (this.pointer !== e.pointerId) return;
      this.points.push(this.point(e));
      this.pointer = null;
      this.draw();
      let length = 0;
      for (let i = 1; i < this.points.length; i++)
        length += Math.hypot(
          this.points[i][0] - this.points[i - 1][0],
          this.points[i][1] - this.points[i - 1][1],
        );
      if (length > 0.12) this.submit();
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
    const pointer = this.pointer;
    this.pointer = null;
    this.points = [];
    if (pointer !== null && this.canvas.hasPointerCapture?.(pointer))
      this.canvas.releasePointerCapture(pointer);
    this.ink.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
  draw() {
    const ink = this.ink;
    ink.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ink.beginPath();
    ink.strokeStyle = '#183832';
    ink.lineWidth = 3;
    ink.lineCap = 'round';
    this.points.forEach(([x, y], i) =>
      ink[i ? 'lineTo' : 'moveTo'](x * this.canvas.width, y * this.canvas.height),
    );
    ink.stroke();
    if (this.points.length > 300)
      this.points = this.points.filter((_, i, a) => i % 2 === 0 || i === a.length - 1);
  }
  open() {
    if (!this.snapshot()?.bank) return;
    this.opened = true;
    this.selection = null;
    this.clear();
    this.status.textContent = '';
    this.onOpen();
    this.root.classList.remove('hidden');
    this.render();
    this.root.querySelector('[data-bank-close]').focus?.();
  }
  close() {
    if (this.busy) return;
    this.opened = false;
    this.selection = null;
    this.clear();
    this.root.classList.add('hidden');
    this.onClose();
  }
  select(loan, repay) {
    this.selection = {
      serial: loan.serial,
      slot: loan.slot,
      repay,
      remaining: loan.remaining,
      epoch: this.snapshot().base?.epoch,
    };
    this.status.textContent = '';
    this.clear();
    this.render();
  }
  element(tag, text, parent) {
    const el = this.document.createElement(tag);
    el.textContent = text;
    parent?.append(el);
    return el;
  }
  render() {
    if (!this.opened) return;
    const snapshot = this.snapshot(),
      bank = snapshot?.bank;
    if (!bank) {
      if (!this.busy) this.close();
      return;
    }
    const balance = Math.round(snapshot.dollars * 100);
    this.root.querySelector('[data-bank-balance]').textContent =
      `Caisse commune : ${dollars(balance)} · Dette partagée · Débits maintenus même en solde négatif`;
    const selected =
      this.selection &&
      bank.slots.find((l) => l.slot === this.selection.slot && l.serial === this.selection.serial);
    if (
      this.selection &&
      !this.busy &&
      (!selected ||
        this.selection.epoch !== snapshot.base?.epoch ||
        (this.selection.repay
          ? selected.status !== 'active' || selected.remaining !== this.selection.remaining
          : selected.status !== 'offer'))
    ) {
      this.selection = null;
      this.clear();
      this.status.textContent = 'Le contrat a changé. Relisez sa version actuelle avant de signer.';
    }
    const key = JSON.stringify([bank, balance, this.busy]);
    if (key !== this.key) {
      this.key = key;
      this.cards.replaceChildren();
      for (const loan of bank.slots) {
        const card = this.element('article', '', this.cards),
          active = loan.status === 'active';
        this.element(
          'small',
          `${active ? 'CONTRAT' : 'OFFRE'} ${loan.slot + 1} · ${active ? 'SIGNÉ' : 'NON SIGNÉE'}`,
          card,
        );
        this.element('h3', dollars(loan.principal), card);
        this.element(
          'p',
          `Taux fixe : ${rate(loan)} par vague · Durée : ${loan.waves} vagues`,
          card,
        );
        this.element(
          'p',
          `Échéance : ${dollars(loan.payment)} · Coût total : ${dollars(loan.total)}`,
          card,
        );
        this.element(
          'p',
          active
            ? `Capital restant : ${dollars(loan.remaining)} · ${loan.waves - loan.paid} vagues restantes`
            : 'Offre conservée à la prochaine visite.',
          card,
        );
        const read = this.element(
          'button',
          active ? 'Consulter le contrat signé' : 'Lire et signer l’offre',
          card,
        );
        read.disabled = this.busy || (!active && balance < 0);
        read.onclick = () => this.select(loan, false);
        if (active) {
          const repay = this.element('button', `Rembourser ${dollars(loan.remaining)}`, card);
          repay.disabled = this.busy || balance < loan.remaining;
          repay.onclick = () => this.select(loan, true);
        }
      }
    }
    this.cards.classList.toggle('hidden', !!this.selection);
    this.sheet.classList.toggle('hidden', !this.selection);
    this.root.querySelector('[data-bank-close]').disabled = this.busy;
    for (const selector of ['[data-bank-back]', '[data-bank-clear]'])
      this.root.querySelector(selector).disabled = this.busy;
    if (!this.selection || !selected) return;
    const readOnly = selected.status === 'active' && !this.selection.repay;
    this.canvas.classList.toggle('hidden', readOnly);
    this.root.querySelector('[data-bank-clear]').classList.toggle('hidden', readOnly);
    this.root.querySelector('[data-bank-sign-hint]').textContent = readOnly
      ? 'Contrat signé · Tableau d’amortissement'
      : 'Signez dans le cadre ; relâchez pour déposer le document.';
    this.root.querySelector('[data-bank-text]').textContent =
      loanText(selected, this.selection.repay) +
      (readOnly
        ? `\nCapital restant : ${dollars(selected.remaining)} · ${selected.waves - selected.paid} vagues restantes.`
        : '');
    this.root.querySelector('[data-bank-title]').textContent = this.selection.repay
      ? 'Remboursement anticipé'
      : readOnly
        ? 'Contrat signé'
        : 'Offre de prêt';
    const schedule = this.root.querySelector('[data-bank-schedule]');
    const scheduleKey = JSON.stringify([snapshot.base?.epoch, selected.serial, selected.paid]);
    if (schedule.dataset.key !== scheduleKey) {
      schedule.dataset.key = scheduleKey;
      schedule.replaceChildren();
      for (const row of selected.schedule) {
        const tr = this.element('tr', '', schedule);
        for (const value of [
          row.wave + (row.wave <= selected.paid ? ' · payé' : ''),
          dollars(row.payment),
          dollars(row.interest),
          dollars(row.capital),
          dollars(row.remaining),
        ])
          this.element('td', String(value), tr);
      }
    }
  }
  async submit() {
    if (this.busy || !this.selection) return;
    const selected = this.selection,
      loan = this.snapshot().bank.slots.find(
        (l) => l.slot === selected.slot && l.serial === selected.serial,
      );
    if (!loan || (!selected.repay && loan.status !== 'offer')) return;
    this.busy = true;
    this.status.textContent = 'Dépôt du document en cours…';
    this.render();
    const ink = this.canvas.toDataURL('image/png');
    try {
      const result = await this.command(selected.repay ? 'bank-repay' : 'bank-sign', {
        slot: selected.slot,
        serial: selected.serial,
        epoch: selected.epoch,
        signature: true,
        ...(selected.repay ? { expectedRemaining: selected.remaining } : {}),
      });
      this.accept(result);
      if (this.snapshot().base?.epoch !== selected.epoch) {
        this.selection = null;
        this.clear();
        this.status.textContent = 'La partie a été remise à zéro ; ce document est clos.';
        return;
      }
      this.archive({ title: selected.repay ? 'Remboursement anticipé' : 'Contrat de prêt', ink });
      this.selection = null;
      this.clear();
      this.status.textContent = 'SIGNÉ · Document enregistré.';
    } catch (e) {
      this.status.textContent = e.message;
      this.clear();
    } finally {
      this.busy = false;
      this.render();
    }
  }
}
