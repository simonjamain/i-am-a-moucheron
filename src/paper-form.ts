// Paper documents (docs/ui-guidelines.md, « Menus : des documents qui sortent du monde »):
// clauses ticked by hand, never pre-ticked, then a signature. A clause can be refused:
// signing with it ticked gets the document stamped REFUSÉ and the request is dropped.
// The ticks stay on the player's side, like the ink of a signature: the server only
// receives `signature: true`.

export interface Clause {
  id: string;
  text: string;
  /** Signing with this clause ticked gets the whole document refused. */
  refused?: boolean;
}

export interface ClauseRule {
  title: string;
  clauses: readonly Clause[];
  /** Ticking a clause unticks the others. */
  exclusive: boolean;
  /** Clauses to tick before the signature unlocks. */
  min: number;
}

/**
 * Motives a workshop order can give (bon de commande). Each order draws a few of
 * them, then always offers « convenance personnelle », marked as refused: the
 * form knows it will refuse it and offers it anyway.
 */
export const PURCHASE_MOTIVE_POOL: readonly Clause[] = Object.freeze([
  { id: 'defense', text: 'Défense de la poubelle (encore)' },
  { id: 'lost', text: 'Le précédent a été perdu en vol, avec le pilote' },
  { id: 'ant', text: 'Le précédent a été emporté par une fourmi' },
  { id: 'neighbours', text: 'L’escadrille d’en face en a un' },
  { id: 'audit', text: 'Inventaire à compléter avant l’audit de fin de vague' },
  { id: 'shiny', text: 'Ça brille et c’est dans le budget' },
  { id: 'chief', text: 'Mon chef d’escadrille a dit oui, de loin' },
  { id: 'bin', text: 'Remplacement de matériel tombé au fond de la poubelle' },
  { id: 'budget', text: 'Crédit à dépenser avant la fin de l’exercice' },
]);
export const COMFORT: Clause = Object.freeze({
  id: 'comfort',
  text: 'Convenance personnelle (systématiquement refusé)',
  refused: true,
});
/** Motives of one order: three drawn from the pool, then the refused one. */
export function purchaseMotives(random: () => number = Math.random): ClauseRule {
  const pool = [...PURCHASE_MOTIVE_POOL];
  const drawn: Clause[] = [];
  while (drawn.length < 3) drawn.push(...pool.splice(Math.floor(random() * pool.length), 1));
  return Object.freeze({
    title: 'Motif de la commande (cocher une case)',
    exclusive: true,
    min: 1,
    clauses: Object.freeze([...drawn, COMFORT]),
  });
}

/**
 * The one box of a bank loan: the team knows what it signs up for. No motive:
 * the bank does not judge motives, it collects instalments.
 */
export function loanConsent(waves: number): ClauseRule {
  return Object.freeze({
    title: 'Reconnaissance de dette',
    exclusive: false,
    min: 1,
    clauses: Object.freeze([
      {
        id: 'consent',
        text: `Je comprends que cet emprunt plombe mon équipe pendant les ${waves} vagues à venir, et que c’est moi qui ai signé.`,
      },
    ]),
  });
}
/** The refusal printed under the REFUSÉ stamp. */
export const REFUSAL_TEXT =
  'Demande refusée : la convenance personnelle n’est pas un motif réglementaire.';

/** Ticked clauses of one document: completeness and refusal. */
export class ClauseState {
  readonly rule: ClauseRule;
  readonly checked = new Set<string>();
  constructor(rule: ClauseRule) {
    this.rule = rule;
  }
  toggle(id: string): void {
    if (!this.rule.clauses.some((c) => c.id === id)) return;
    if (this.checked.has(id)) {
      this.checked.delete(id);
      return;
    }
    if (this.rule.exclusive) this.checked.clear();
    this.checked.add(id);
  }
  get complete(): boolean {
    return this.checked.size >= this.rule.min;
  }
  get refused(): boolean {
    return this.rule.clauses.some((c) => c.refused && this.checked.has(c.id));
  }
}

/** A hand-drawn SVG path: `box` (a slightly crooked square) or `tick` (a pencil check). */
export function handPath(kind: 'box' | 'tick', random: () => number = Math.random): string {
  const j = (amount: number): number => (random() * 2 - 1) * amount;
  const p = (x: number, y: number, amount = 0.9): string =>
    `${(x + j(amount)).toFixed(1)} ${(y + j(amount)).toFixed(1)}`;
  // Boxes are printed with the typed form: perfect squares. Only the tick is by hand.
  if (kind === 'box') return 'M4 4 H20 V20 H4 Z';
  return `M${p(4, 12, 1.2)} Q${p(7, 15)} ${p(10, 19, 1)} Q${p(14, 9, 1.5)} ${p(22, 2, 1.5)}`;
}

const SVG = 'http://www.w3.org/2000/svg';

/**
 * Renders a ClauseState into `container`: each clause is a hand-drawn box and its text,
 * ticked by a click (or Space / Enter when focused). `onChange` runs after each tick.
 */
export class ClauseSheet {
  readonly state: ClauseState;
  private readonly boxes = new Map<string, HTMLElement>();
  private readonly onChange: () => void;

  constructor(rule: ClauseRule, container: HTMLElement | null, onChange: () => void = () => {}) {
    this.state = new ClauseState(rule);
    this.onChange = onChange;
    const doc = container?.ownerDocument;
    if (!container || !doc) return;
    container.replaceChildren();
    const title = doc.createElement('p');
    title.className = 'clauseTitle';
    title.textContent = rule.title;
    container.append(title);
    for (const clause of rule.clauses) {
      const row = doc.createElement('span');
      row.className = 'clause';
      row.setAttribute('role', 'checkbox');
      row.setAttribute('aria-checked', 'false');
      row.tabIndex = 0;
      const svg = doc.createElementNS(SVG, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');
      const box = doc.createElementNS(SVG, 'path');
      box.setAttribute('class', 'clauseBox');
      box.setAttribute('d', handPath('box'));
      const tick = doc.createElementNS(SVG, 'path');
      tick.setAttribute('class', 'clauseTick');
      svg.append(box, tick);
      const text = doc.createElement('span');
      text.textContent = clause.text;
      row.append(svg, text);
      row.onclick = () => this.toggle(clause.id);
      row.onkeydown = (e: KeyboardEvent) => {
        if (e.key !== ' ' && e.key !== 'Enter') return;
        e.preventDefault();
        this.toggle(clause.id);
      };
      container.append(row);
      this.boxes.set(clause.id, row);
    }
  }

  toggle(id: string): void {
    this.state.toggle(id);
    for (const [clause, row] of this.boxes) {
      const on = this.state.checked.has(clause);
      if (on === (row.getAttribute('aria-checked') === 'true')) continue;
      row.setAttribute('aria-checked', String(on));
      // A new pencil stroke each time: no two ticks are the same.
      if (on) row.querySelector('.clauseTick')?.setAttribute('d', handPath('tick'));
    }
    this.onChange();
  }

  get complete(): boolean {
    return this.state.complete;
  }
  get refused(): boolean {
    return this.state.refused;
  }
}

/** Prints a stamp (`APPROUVÉ`, `REFUSÉ`) on a document's stamp element. */
export function stamp(element: HTMLElement | null, text: string, refused = false): void {
  if (!element) return;
  element.textContent = text;
  element.classList[refused ? 'add' : 'remove']('refused');
  element.classList.remove('printed');
  void element.offsetWidth; // restart the stamping animation
  element.classList.add('printed');
}
