import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLatLngString, parseAppleMapsUrl, parseBingUrl,
} from '../src/lib/parse.js';
import { providerForUrl } from '../src/lib/providers.js';

test('parseLatLngString handles comma and tilde, rejects junk', () => {
  assert.deepEqual(parseLatLngString('37.7,-122.4'), [37.7, -122.4]);
  assert.deepEqual(parseLatLngString('47.6~-122.3'), [47.6, -122.3]); // Bing
  assert.equal(parseLatLngString('somewhere nice'), null);
  assert.equal(parseLatLngString('0,0'), null); // null island
});

test('parseAppleMapsUrl: ll + name', () => {
  const r = parseAppleMapsUrl('https://maps.apple.com/?ll=37.7749,-122.4194&q=San+Francisco');
  assert.equal(r.lat, 37.7749);
  assert.equal(r.lng, -122.4194);
  assert.equal(r.label, 'San Francisco');
});

test('parseAppleMapsUrl: place coordinate param', () => {
  const r = parseAppleMapsUrl('https://maps.apple.com/place?coordinate=37.334859,-122.009040&name=Apple+Park');
  assert.ok(Math.abs(r.lat - 37.334859) < 1e-6);
  assert.ok(Math.abs(r.lng + 122.00904) < 1e-6);
  assert.equal(r.label, 'Apple Park');
});

test('parseBingUrl: cp tilde + pushpin', () => {
  const cp = parseBingUrl('https://www.bing.com/maps?cp=47.6062~-122.3321&lvl=12');
  assert.equal(cp.lat, 47.6062);
  assert.equal(cp.lng, -122.3321);
  const sp = parseBingUrl('https://www.bing.com/maps?sp=point.40.6892_-74.0445_Statue');
  assert.equal(sp.lat, 40.6892);
  assert.equal(sp.lng, -74.0445);
});

test('providerForUrl maps hostnames to providers', () => {
  assert.equal(providerForUrl('https://www.google.com/maps/@1.5,2.5,5z').id, 'gmaps');
  assert.equal(providerForUrl('https://maps.apple.com/?ll=1.5,2.5').id, 'applemaps');
  assert.equal(providerForUrl('https://beta.maps.apple.com/?ll=1.5,2.5').id, 'applemaps');
  assert.equal(providerForUrl('https://www.bing.com/maps?cp=1.5~2.5').id, 'bing');
  assert.equal(providerForUrl('https://example.com/whatever'), null);
});

test('providerForUrl + provider.parse round-trips a coordinate', () => {
  const url = 'https://maps.apple.com/?ll=48.8584,2.2945';
  const p = providerForUrl(url);
  const parsed = p.parse(url);
  assert.equal(p.id, 'applemaps');
  assert.equal(parsed.lat, 48.8584);
  assert.equal(parsed.lng, 2.2945);
});
