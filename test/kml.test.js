import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toKml } from '../src/lib/kml.js';

test('toKml emits lng,lat coordinates, escapes XML, drops invalid points', () => {
  const kml = toKml([
    { lat: 48.8584, lng: 2.2945, label: 'Eiffel & Tower', country: 'France', source: 'gmaps', tags: ['paris'] },
    { lat: 'x', lng: 'y', label: 'should-be-skipped' },
  ]);
  assert.match(kml, /<coordinates>2.2945,48.8584,0<\/coordinates>/);
  assert.match(kml, /Eiffel &amp; Tower/);
  assert.match(kml, /Tags: paris/);
  assert.doesNotMatch(kml, /should-be-skipped/);
});
