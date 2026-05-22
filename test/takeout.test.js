import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseGeoJson, parseListCsv, parseCsv, parseTakeout,
} from '../src/lib/takeout.js';

test('parseGeoJson reads coords + maps country_code to a name', () => {
  const gj = JSON.stringify({
    type: 'FeatureCollection',
    features: [
      {
        geometry: { type: 'Point', coordinates: [2.2945, 48.8584] },
        properties: { Title: 'Eiffel Tower', location: { country_code: 'FR' } },
      },
      {
        geometry: { type: 'Point', coordinates: [0, 0] },
        properties: { Title: 'No Coords', google_maps_url: 'https://maps.app.goo.gl/abc' },
      },
    ],
  });
  const { records, unresolved } = parseGeoJson(gj);
  assert.equal(records.length, 1);
  assert.equal(records[0].label, 'Eiffel Tower');
  assert.equal(records[0].country, 'France');
  assert.equal(records[0].source, 'takeout');
  assert.equal(unresolved.length, 1);
  assert.equal(unresolved[0].title, 'No Coords');
});

test('parseListCsv resolves coordinate URLs and flags short links', () => {
  const csv = 'Title,Note,URL\n'
    + '"Tokyo Tower","cool","https://www.google.com/maps/place/Tokyo+Tower/@35.6586,139.7454,17z/data=!3d35.6586!4d139.7454"\n'
    + '"Mystery Cafe","","https://maps.app.goo.gl/xyz"\n';
  const { records, unresolved } = parseListCsv(csv);
  assert.equal(records.length, 1);
  assert.equal(records[0].label, 'Tokyo Tower');
  assert.equal(records[0].notes, 'cool');
  assert.ok(Math.abs(records[0].lat - 35.6586) < 1e-6);
  assert.equal(unresolved.length, 1);
  assert.equal(unresolved[0].title, 'Mystery Cafe');
});

test('parseCsv handles quoted commas and embedded newlines', () => {
  const rows = parseCsv('a,b\n"x,y","line1\nline2"\n');
  assert.deepEqual(rows[0], ['a', 'b']);
  assert.deepEqual(rows[1], ['x,y', 'line1\nline2']);
});

test('parseTakeout dispatches by filename / content', () => {
  assert.deepEqual(parseTakeout('Saved Places.json', '{"features":[]}'), { records: [], unresolved: [] });
  const csv = parseTakeout('Want to go.csv', 'Title,URL\n"A","https://maps.app.goo.gl/x"\n');
  assert.equal(csv.unresolved.length, 1);
});
