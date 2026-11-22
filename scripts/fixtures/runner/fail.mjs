import assert from 'node:assert/strict';
console.log('before failure');
assert.equal(1, 2, 'fixture failure');
