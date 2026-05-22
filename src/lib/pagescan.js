// Rank + de-duplicate location candidates scraped from an arbitrary web page.
// (The DOM scraping itself runs in the page; this pure step ranks the results.)
const RANK = { structured: 0, address: 1, text: 2 };
const rankOf = (c) => {
  const r = c && RANK[c.confidence];
  return r == null ? 9 : r;
};

export function rankWebCandidates(list) {
  const byKey = new Map();
  for (const c of list || []) {
    if (!(Number.isFinite(c.lat) && Number.isFinite(c.lng))) continue;
    if (Math.abs(c.lat) > 90 || Math.abs(c.lng) > 180 || (c.lat === 0 && c.lng === 0)) continue;
    const key = `${c.lat.toFixed(4)},${c.lng.toFixed(4)}`;
    const prev = byKey.get(key);
    if (!prev || rankOf(c) < rankOf(prev)) byKey.set(key, c);
  }
  return [...byKey.values()].sort((a, b) => rankOf(a) - rankOf(b));
}
