import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeBigDataCloud, normalizeNominatim, reverseGeocode,
} from '../src/lib/geocode.js';

test('normalizeBigDataCloud', () => {
  const n = normalizeBigDataCloud({
    countryName: 'France', countryCode: 'FR', principalSubdivision: 'Île-de-France', city: 'Paris',
  });
  assert.deepEqual(n, { country: 'France', countryCode: 'FR', region: 'Île-de-France', city: 'Paris' });
});

test('normalizeNominatim uppercases the country code', () => {
  const n = normalizeNominatim({ address: { country: 'Japan', country_code: 'jp', state: 'Tokyo', city: 'Chiyoda' } });
  assert.equal(n.country, 'Japan');
  assert.equal(n.countryCode, 'JP');
  assert.equal(n.region, 'Tokyo');
});

test('reverseGeocode falls back from BigDataCloud to Nominatim', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('bigdatacloud')) return { ok: true, json: async () => ({ countryName: '', countryCode: '' }) };
    return { ok: true, json: async () => ({ address: { country: 'Spain', country_code: 'es' } }) };
  };
  const r = await reverseGeocode(40.4, -3.7, fetchImpl);
  assert.equal(r.country, 'Spain');
  assert.equal(r.countryCode, 'ES');
});

test('reverseGeocode returns an empty result if everything fails', async () => {
  const r = await reverseGeocode(1, 1, async () => { throw new Error('net'); });
  assert.deepEqual(r, { country: null, countryCode: null, region: null, city: null });
});
