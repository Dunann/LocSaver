// Registry of supported web-map sites. Each provider recognises its own URLs and
// extracts a coordinate from them. Adding a new map = one entry here (+ a parser in
// parse.js, a SOURCE_META entry in model.js, and a content-script match in the manifest).
import { parseGmapsUrl, parseAppleMapsUrl, parseBingUrl } from './parse.js';

export const WEB_PROVIDERS = [
  { id: 'gmaps', host: /(^|\.)google\.[a-z.]+$/, parse: parseGmapsUrl },
  { id: 'applemaps', host: /(^|\.)maps\.apple\.com$/, parse: parseAppleMapsUrl },
  { id: 'bing', host: /(^|\.)bing\.com$/, parse: parseBingUrl },
];

/** Find the provider that owns a URL (by hostname), or null. */
export function providerForUrl(url) {
  let host;
  try { host = new URL(url).hostname.toLowerCase(); } catch { return null; }
  return WEB_PROVIDERS.find((p) => p.host.test(host)) || null;
}
