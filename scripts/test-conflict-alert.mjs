// Alerte de conflit : état simulé de l'API GitHub, aucun réseau.
import assert from 'node:assert/strict';
import { LABEL, MARKER, alertConflicts } from './conflict-alert.ts';

const pulls = new Map();
const calls = [];
const add = (number, extra) =>
  pulls.set(number, {
    number,
    head: { sha: 'sha' + number },
    mergeable: true,
    mergeable_state: 'clean',
    labels: [],
    comments: [],
    ...extra,
  });
add(1);
add(2, { mergeable: false, mergeable_state: 'dirty' });
add(3, {
  mergeable: false,
  mergeable_state: 'dirty',
  labels: [{ name: LABEL }],
  comments: [{ body: MARKER('sha3') }],
});
add(4, { labels: [{ name: LABEL }] });
add(5, { mergeable: null, mergeable_state: 'unknown' });
let late = 0;
const api = {
  openPulls: async () => [...pulls.values()].map(({ number }) => ({ number })),
  pull: async (n) => {
    if (n === 6 && ++late > 2) pulls.get(6).mergeable = false;
    return pulls.get(n);
  },
  comments: async (n) => pulls.get(n).comments,
  comment: async (n, body) => calls.push(['comment', n, body]),
  addLabel: async (n) => calls.push(['label', n]),
  removeLabel: async (n) => calls.push(['unlabel', n]),
};
add(6, { mergeable: null, mergeable_state: 'dirty' });
const result = await alertConflicts(api, { tries: 4, wait: async () => {} });
assert.deepEqual(result, { alerted: [2, 6], cleared: [4], unknown: [5] });
assert.deepEqual(
  calls.map(([kind, n]) => kind + n),
  ['label2', 'comment2', 'unlabel4', 'label6', 'comment6'],
);
assert.ok(calls.find((c) => c[0] === 'comment' && c[1] === 2)[2].includes(MARKER('sha2')));
// Idempotent : une deuxième passe sur le même état ne répète rien.
pulls.get(2).labels.push({ name: LABEL });
pulls.get(2).comments.push({ body: MARKER('sha2') });
pulls.get(6).labels.push({ name: LABEL });
pulls.get(6).comments.push({ body: MARKER('sha6') });
calls.length = 0;
await alertConflicts(api, { tries: 1, wait: async () => {} });
assert.deepEqual(
  calls.map(([kind, n]) => kind + n),
  ['unlabel4'],
);
console.log(
  'Conflict alert: labels and comments conflicting PRs once per head, clears resolved ones.',
);
