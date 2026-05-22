import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGmapsUrl, isValidLatLng } from '../src/lib/parse.js';

test('isValidLatLng', () => {
  assert.ok(isValidLatLng(48.85, 2.29));
  assert.ok(!isValidLatLng(0, 0));
  assert.ok(!isValidLatLng(95, 0));
  assert.ok(!isValidLatLng(NaN, 1));
});

test('parseGmapsUrl prefers !3d/!4d place coordinates', () => {
  const u = 'https://www.google.com/maps/place/Eiffel+Tower/@48.8584,2.2945,17z/data=!3m1!4b1!4m6!3d48.8583701!4d2.2944813';
  const r = parseGmapsUrl(u);
  assert.equal(r.lat, 48.8583701);
  assert.equal(r.lng, 2.2944813);
  assert.equal(r.label, 'Eiffel Tower');
});

test('parseGmapsUrl falls back to the @ map centre', () => {
  const r = parseGmapsUrl('https://www.google.com/maps/@40.6892,-74.0445,15z');
  assert.equal(r.lat, 40.6892);
  assert.equal(r.lng, -74.0445);
});

test('parseGmapsUrl reads an explicit query coordinate', () => {
  const r = parseGmapsUrl('https://www.google.com/maps/search/?api=1&query=35.6586%2C139.7454');
  assert.equal(r.lat, 35.6586);
  assert.equal(r.lng, 139.7454);
});

test('parseGmapsUrl returns null when there is no coordinate', () => {
  assert.equal(parseGmapsUrl('https://www.google.com/maps'), null);
});
