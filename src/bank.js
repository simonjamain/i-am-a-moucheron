// Amounts are integer cents; rates apply once per completed wave.
export const LOAN_TERMS = Object.freeze([
  { principal: 1200, rate: 0.1, waves: 4 },
  { principal: 2400, rate: 0.15, waves: 6 },
  { principal: 4000, rate: 0.2, waves: 8 },
  { principal: 1800, rate: 0.12, waves: 5 },
  { principal: 3000, rate: 0.18, waves: 7 },
]);
export function amortization(principal, rate, waves) {
  if (
    !Number.isSafeInteger(principal) ||
    principal < 1 ||
    !Number.isFinite(rate) ||
    rate < 0 ||
    !Number.isInteger(waves) ||
    waves < 1
  )
    throw Error('Invalid loan');
  const payment = Math.round(
    rate ? (principal * rate) / (1 - (1 + rate) ** -waves) : principal / waves,
  );
  let remaining = principal;
  const schedule = [];
  for (let i = 0; i < waves; i++) {
    const interest = Math.round(remaining * rate);
    const capital =
      i === waves - 1 ? remaining : Math.min(remaining, Math.max(0, payment - interest));
    remaining -= capital;
    schedule.push({ wave: i + 1, interest, capital, payment: capital + interest, remaining });
  }
  return { payment, total: schedule.reduce((n, row) => n + row.payment, 0), schedule };
}
export function loanOffer(slot, serial, random = Math.random) {
  const terms =
    LOAN_TERMS[Math.min(LOAN_TERMS.length - 1, Math.floor(random() * LOAN_TERMS.length))];
  return {
    slot,
    serial,
    ...terms,
    ...amortization(terms.principal, terms.rate, terms.waves),
    status: 'offer',
    paid: 0,
    remaining: terms.principal,
    signedWave: null,
  };
}
export function newBank(random = Math.random) {
  return {
    serial: 3,
    lastSettledWave: 0,
    slots: [0, 1, 2].map((slot) => loanOffer(slot, slot + 1, random)),
  };
}
export function signLoan(bank, slot, serial, balance, wave) {
  const offer = bank.slots[slot];
  if (balance < 0) throw Error('Aucun nouvel emprunt avec un solde négatif.');
  if (!offer || offer.serial !== serial || offer.status !== 'offer')
    throw Error('Cette offre n’est plus disponible.');
  offer.status = 'active';
  offer.signedWave = wave;
  return offer.principal;
}
export function settleLoans(bank, wave, random = Math.random) {
  if (wave <= bank.lastSettledWave) return 0;
  bank.lastSettledWave = wave;
  let debit = 0;
  for (const loan of bank.slots) {
    if (loan.status !== 'active' || wave < loan.signedWave) continue;
    const row = loan.schedule[loan.paid++];
    debit += row.payment;
    loan.remaining = row.remaining;
    if (loan.paid === loan.waves)
      bank.slots[loan.slot] = loanOffer(loan.slot, ++bank.serial, random);
  }
  return debit;
}
export function repayLoan(bank, slot, serial, balance, random = Math.random) {
  const loan = bank.slots[slot];
  if (!loan || loan.serial !== serial || loan.status !== 'active')
    throw Error('Contrat absent ou déjà soldé.');
  if (balance < loan.remaining)
    throw Error('Solde insuffisant pour rembourser le capital restant.');
  const debit = loan.remaining;
  bank.slots[slot] = loanOffer(slot, ++bank.serial, random);
  return debit;
}
