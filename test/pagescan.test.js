import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankWebCandidates } from '../src/lib/pagescan.js';

test('rankWebCandidates dedupes by ~coordinate, keeps best confidence, sorts', () => {
  const out = rankWebCandidates([
    { lat: 40.0, lng: -3.0, confidence: 'text', label: 'A-text' },
    { lat: 40.00001, lng: -3.00001, confidence: 'structured', label: 'A-struct' }, // same ~coord, higher confidence
    { lat: 48.85, lng: 2.29, confidence: 'address', label: 'B-address' },
    { lat: 91, lng: 0, confidence: 'structured', label: 'invalid' }, // out of range -> dropped
    { lat: 0, lng: 0, confidence: 'structured', label: 'null-island' }, // dropped
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].label, 'A-struct'); // structured beats the text duplicate AND sorts first
  assert.equal(out[1].label, 'B-address');
});

test('rankWebCandidates handles empty / missing input', () => {
  assert.deepEqual(rankWebCandidates([]), []);
  assert.deepEqual(rankWebCandidates(null), []);
});
