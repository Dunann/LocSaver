// Convert saved-location records into a KML document for import into Google My Maps.

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function toKml(records, docName = 'LocSaver export') {
  const placemarks = (records || [])
    .filter((r) => Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lng)))
    .map((r) => {
      const name = esc(r.label || r.city || `${r.lat}, ${r.lng}`);
      const desc = [];
      if (r.country) desc.push(`Country: ${r.country}`);
      if (r.region) desc.push(`Region: ${r.region}`);
      if (r.source) desc.push(`Source: ${r.source}`);
      if (r.notes) desc.push(r.notes);
      if (r.tags && r.tags.length) desc.push(`Tags: ${r.tags.join(', ')}`);
      return `    <Placemark>
      <name>${name}</name>
      <description>${esc(desc.join('\n'))}</description>
      <Point><coordinates>${Number(r.lng)},${Number(r.lat)},0</coordinates></Point>
    </Placemark>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${esc(docName)}</name>
${placemarks}
  </Document>
</kml>
`;
}
