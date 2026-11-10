// Legacy regression scenarios pin crypto randomness (it once drew the removed
// malicious annexes); kept so their other random draws stay reproducible.
globalThis.crypto.getRandomValues = (array) => {
  array.fill(0xffffffff);
  return array;
};
