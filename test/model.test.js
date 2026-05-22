import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeRecord, dedupeKey, countryNameFromCode, gmapsLink, isPlaceable,
} from '../src/lib/model.js';

test('makeRecord coerces + trims + fills defaults', () => {
  const r = makeRecord({ lat: '1.5', lng: '2.5', source: 'geoguessr', label: '  Paris ' });
  assert.equal(r.lat, 1.5);
  assert.equal(r.source, 'geoguessr');
  assert.equal(r.label, 'Paris');
  assert.deepEqual(r.tags, []);
  assert.ok(r.id && r.createdAt);
});

test('makeRecord defaults an unknown source to gmaps', () => {
  assert.equal(makeRecord({ lat: 1, lng: 1, source: 'nope' }).source, 'gmaps');
});

test('dedupeKey rounds to ~1 m', () => {
  assert.equal(dedupeKey(1.234567, 2.345678, 'gmaps'), 'gmaps:1.23457,2.34568');
});

test('countryNameFromCode via Intl', () => {
  assert.equal(countryNameFromCode('FR'), 'France');
  assert.equal(countryNameFromCode('jp'), 'Japan');
  assert.equal(countryNameFromCode(null), null);
});

test('gmapsLink builds a search deep link', () => {
  assert.match(gmapsLink({ lat: 1, lng: 2 }), /query=1%2C2/);
});

test('isPlaceable', () => {
  assert.ok(isPlaceable({ lat: 1, lng: 2 }));
  assert.ok(!isPlaceable({ lat: 0, lng: 0 }));
});
