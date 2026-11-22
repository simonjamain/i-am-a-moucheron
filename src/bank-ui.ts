import { ClauseSheet, LOAN_MOTIVES, handPath, stamp } from './paper-form.ts';
// The bank's prospectus (docs/ui-guidelines.md, « Menus : des documents qui sortent du
// monde »): one paper sheet with the three slots printed as coupons. Ticking an offer
// shows its terms and amortization table; the loan's purpose is ticked (the bank
// accepts every motive, « convenance personnelle » included), then the signature
// deposits it. A signed loan stays readable as a stamped contract whose paid
// instalments are stamped PAYÉ.
export const dollars = (cents) =>
  (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
  ' $';
const rate = (loan) => (loan.rate * 100).toLocaleString('fr-FR') + ' %';
export function loanText(loan) {
  return `La Banque de la Dernière Volonté prête ${dollars(loan.principal)} à la caisse commune. Taux fixe : ${rate(loan)} par vague, sur ${loan.waves} vagues. Échéance : ${dollars(loan.payment)}, coût total : ${dollars(loan.total)}. La dernière échéance ajuste les arrondis. Les prélèvements continuent même avec un solde négatif. Un nouvel emprunt exige un solde non négatif. Votre avion peut tomber ; vos échéances restent debout.`;
}
const SVG = 'http://www.w3.org/2000/svg';

export class BankUI {
  constructor({ root, document, snapshot, command, accept, onOpen, onClose, onSigned = () => {} }) {
    Object.assign(this, { root, document, snapshot, command, accept, onOpen, onClose, onSigned });
    this.opened = false;
    this.busy = false;
    this.selection = null;
    this.clauses = null;
    this.points = [];
    this.pointer = null;
    root.onkeydown = (event) => {
      if (event.key !== 'Tab') return;
      const focusable = [
        ...root.querySelectorAll('button:not(:disabled), [tabindex="0"], canvas'),
      ].filter((el) => !el.closest('.hidden'));
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
    this.canvas.onpointerdown = (e) => {
      e.preventDefault();
      if (this.busy || this.pointer !== null || !this.selection) return;
      if (!this.canSign()) {
        this.status.textContent = 'Cochez l’objet du prêt avant de signer.';
        return;
      }
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
  balance() {
    return Math.round((this.snapshot()?.dollars ?? 0) * 100);
  }
  selected() {
    const s = this.selection;
    return (
      s && this.snapshot()?.bank?.slots.find((l) => l.slot === s.slot && l.serial === s.serial)
    );
  }
  canSign() {
    const loan = this.selected();
    return loan?.status === 'offer' && !!this.clauses?.complete && this.balance() >= 0;
  }
  // Locks the signature line until an offer and the loan's purpose are ticked.
  refreshLock() {
    const offer = this.selected()?.status === 'offer';
    this.root.classList.toggle('locked', offer && !this.canSign());
    if (offer)
      this.status.textContent = this.canSign()
        ? 'Signez puis relâchez pour déposer le document.'
        : 'Cochez l’objet du prêt, puis signez.';
  }
  open() {
    if (!this.snapshot()?.bank) return;
    this.opened = true;
    this.selection = null;
    this.signed = null;
    this.clear();
    this.status.textContent = '';
    this.key = null;
    this.onOpen();
    this.root.classList.remove('hidden', 'locked');
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
  // Ticks a coupon: an offer to read and sign, or a signed contract to consult.
  select(loan) {
    if (this.busy) return;
    if (loan.status === 'offer' && this.balance() < 0) {
      this.status.textContent = 'Aucun nouvel emprunt tant que la caisse commune est négative.';
      return;
    }
    if (this.selection?.slot === loan.slot && this.selection.serial === loan.serial) return;
    this.selection = { slot: loan.slot, serial: loan.serial, epoch: this.snapshot().base?.epoch };
    this.tick = handPath('tick');
    this.signed = null;
    this.clear();
    this.status.textContent = '';
    this.clauses =
      loan.status === 'offer'
        ? new ClauseSheet(LOAN_MOTIVES, this.root.querySelector('[data-clauses]'), () =>
            this.refreshLock(),
          )
        : null;
    const mark = this.root.querySelector('[data-stamp]');
    if (loan.status === 'active') stamp(mark, 'APPROUVÉ');
    else mark?.classList.remove('printed');
    this.key = null;
    this.render();
    this.refreshLock();
  }
  element(tag, text, parent, className) {
    const el = this.document.createElement(tag);
    el.textContent = text;
    if (className) el.className = className;
    parent?.append(el);
    return el;
  }
  coupon(loan, balance) {
    const card = this.element('article', '', this.cards, 'coupon'),
      active = loan.status === 'active',
      chosen = this.selection?.slot === loan.slot && this.selection.serial === loan.serial,
      unavailable = !active && balance < 0;
    card.setAttribute?.('role', 'checkbox');
    card.setAttribute?.('aria-checked', String(chosen));
    card.setAttribute?.('aria-disabled', String(unavailable || this.busy));
    card.tabIndex = 0;
    card.onclick = () => this.select(loan);
    card.onkeydown = (e) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      this.select(loan);
    };
    const head = this.element('div', '', card, 'couponHead');
    if (this.document.createElementNS) {
      const svg = this.document.createElementNS(SVG, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');
      const box = this.document.createElementNS(SVG, 'path');
      box.setAttribute('class', 'clauseBox');
      box.setAttribute('d', handPath('box'));
      svg.append(box);
      if (chosen) {
        const tick = this.document.createElementNS(SVG, 'path');
        tick.setAttribute('class', 'clauseTick');
        tick.setAttribute('d', this.tick);
        svg.append(tick);
      }
      head.append(svg);
    }
    this.element('small', `${active ? 'Contrat' : 'Offre'} n° ${loan.serial}`, head);
    this.element('strong', dollars(loan.principal), card, 'couponAmount');
    this.element('span', `${rate(loan)} par vague · ${loan.waves} vagues`, card);
    this.element('span', `Échéance ${dollars(loan.payment)}`, card);
    this.element(
      'span',
      active
        ? `Restant ${dollars(loan.remaining)} · ${loan.waves - loan.paid} vagues`
        : unavailable
          ? 'Indisponible : caisse négative'
          : `Coût total ${dollars(loan.total)}`,
      card,
    );
    if (active) this.element('span', 'SIGNÉ', card, 'couponStamp');
  }
  render() {
    if (!this.opened) return;
    const snapshot = this.snapshot(),
      bank = snapshot?.bank;
    if (!bank) {
      if (!this.busy) this.close();
      return;
    }
    const balance = this.balance();
    this.root.querySelector('[data-bank-balance]').textContent =
      `Caisse commune : ${dollars(balance)}`;
    let selected = this.selected();
    if (
      this.selection &&
      !this.busy &&
      (!selected || this.selection.epoch !== snapshot.base?.epoch)
    ) {
      this.selection = null;
      this.clauses = null;
      selected = null;
      this.clear();
      this.root.classList.remove('locked');
      this.root.querySelector('[data-stamp]')?.classList.remove('printed');
      this.status.textContent =
        'Le contrat a changé. Relisez le prospectus avant de signer à nouveau.';
    }
    // Signed by someone else while being read: the coupon becomes a contract.
    if (selected?.status === 'active' && this.clauses && !this.busy) {
      this.clauses = null;
      this.root.classList.remove('locked');
      stamp(this.root.querySelector('[data-stamp]'), 'APPROUVÉ');
    }
    const key = JSON.stringify([bank, balance, this.busy, this.selection]);
    if (key !== this.key) {
      this.key = key;
      this.cards.replaceChildren();
      for (const loan of bank.slots) this.coupon(loan, balance);
    }
    this.sheet.classList.toggle('hidden', !selected);
    this.root.querySelector('[data-bank-hint]').classList.toggle('hidden', !!selected);
    this.root.querySelector('[data-bank-close]').disabled = this.busy;
    if (!selected) return;
    const offer = selected.status === 'offer';
    this.root.querySelector('[data-clauses]').classList.toggle('hidden', !offer);
    this.root
      .querySelector('[data-bank-sign]')
      .classList.toggle('hidden', !offer && this.signed !== selected.serial);
    this.root.querySelector('[data-bank-title]').textContent = offer
      ? `Offre de prêt n° ${selected.serial}`
      : `Contrat de prêt n° ${selected.serial}`;
    this.root.querySelector('[data-bank-text]').textContent = loanText(selected);
    const schedule = this.root.querySelector('[data-bank-schedule]');
    const scheduleKey = JSON.stringify([snapshot.base?.epoch, selected.serial, selected.paid]);
    if (schedule.dataset.key !== scheduleKey) {
      schedule.dataset.key = scheduleKey;
      schedule.replaceChildren();
      for (const row of selected.schedule) {
        const tr = this.element('tr', '', schedule);
        for (const value of [
          row.wave,
          dollars(row.payment),
          dollars(row.interest),
          dollars(row.capital),
          dollars(row.remaining),
        ])
          this.element('td', String(value), tr);
        this.element('td', row.wave <= selected.paid ? 'PAYÉ' : '', tr, 'paid');
      }
    }
  }
  async submit() {
    if (this.busy || !this.selection || !this.canSign()) return;
    const selected = this.selection;
    this.busy = true;
    this.status.textContent = 'Dépôt du document en cours…';
    this.render();
    try {
      const result = await this.command('bank-sign', {
        slot: selected.slot,
        serial: selected.serial,
        epoch: selected.epoch,
        signature: true,
      });
      this.accept(result);
      if (this.snapshot().base?.epoch !== selected.epoch) {
        this.selection = null;
        this.clauses = null;
        this.clear();
        this.status.textContent = 'La partie a été remise à zéro ; ce document est clos.';
        return;
      }
      this.onSigned();
      // The signature stays on the stamped contract until another coupon is ticked.
      this.signed = selected.serial;
      this.clauses = null;
      this.pointer = null;
      this.points = [];
      this.root.classList.remove('locked');
      stamp(this.root.querySelector('[data-stamp]'), 'APPROUVÉ');
      this.status.textContent = 'SIGNÉ · Capital versé à la caisse commune.';
    } catch (e) {
      this.status.textContent = e.message;
      this.clear();
    } finally {
      this.busy = false;
      this.key = null;
      this.render();
    }
  }
}
