'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const serverSource = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
const start = '// MATCHING CORE START  (pure functions, no I/O)';
const end = '// MATCHING CORE END';
const from = serverSource.indexOf(start);
const to = serverSource.indexOf(end, from);
assert(from >= 0 && to > from, 'Matching core markers missing in index.js');

// Evaluate the frozen production core without loading server, Firebase, or bot side effects.
const core = serverSource.slice(from + start.length, to);
const koStart = serverSource.indexOf('function buildKoIndex(keysObj, names) {', to);
const koEnd = serverSource.indexOf('\nconst state =', koStart);
assert(koStart >= 0 && koEnd > koStart, 'Key-only matcher boundaries missing in index.js');
const source = `${core}\n${serverSource.slice(koStart, koEnd)}\nmodule.exports = { safeKey, parseIds, idCode, typOk, toArray, normRow, valueToString, buildKeyIndex, lookupKeys, buildMasterIndex, searchRows, buildKoIndex, SEP };`;
const sandbox = { module: { exports: {} } };
vm.runInNewContext(source, sandbox, { filename: 'index.js matching core' });
const actual = sandbox.module.exports;
const golden = JSON.parse(fs.readFileSync(path.join(__dirname, 'golden.json'), 'utf8'));

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

for (const test of golden.parseIds) {
  assert.deepEqual(plain(actual.parseIds(test.input)), test.expected, `parseIds: ${test.input}`);
}
for (const test of golden.safeKey) {
  assert.equal(actual.safeKey(test.input), test.expected, `safeKey: ${String(test.input)}`);
}
for (const test of golden.lookupKeys) {
  const idx = actual.buildKeyIndex(test.keys);
  assert.equal(actual.lookupKeys(test.site, idx), test.expected, `lookupKeys: ${test.site}`);
}
for (const test of golden.searchRows) {
  const index = actual.buildMasterIndex(test.master);
  assert.deepEqual(plain(actual.searchRows(index, test.query).map((e) => e.name)), test.expected, `searchRows: ${test.query}`);
}
for (const test of golden.keyOnly) {
  const rows = actual.buildKoIndex(test.keys, test.masterNames);
  assert.deepEqual(plain(rows.map((e) => ({ name: e.name, v: e.v, aliases: [...e.aliases].sort() }))), test.expected, `buildKoIndex: ${test.label}`);
}

console.log(`Golden matching checks passed (${golden.parseIds.length + golden.safeKey.length + golden.lookupKeys.length + golden.searchRows.length + golden.keyOnly.length} cases).`);
