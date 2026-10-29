// Legacy regression scenarios use ordinary dossiers. The logistics suite separately
// exercises the 5% branch, compatible clauses, refusal and accepted effects.
globalThis.crypto.getRandomValues = (array) => {
  array.fill(0xffffffff);
  return array;
};
