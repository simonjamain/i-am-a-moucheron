// Frozen encoder from main before #22. Keep independent from production code:
// changing protocol constants/framing must fail parity, not update the oracle.
export function encodeReplyV1(value, id) {
  const text = JSON.stringify(value);
  if (text.length > 4 * 1024 * 1024) throw Error('État de salle trop volumineux.');
  const count = Math.ceil(text.length / 12000) || 1;
  return Array.from({ length: count }, (_, part) =>
    JSON.stringify({
      v: 1,
      id,
      part,
      count,
      data: text.slice(part * 12000, (part + 1) * 12000),
    }),
  );
}
