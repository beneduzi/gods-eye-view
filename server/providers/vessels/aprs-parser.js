/** Small, dependency-free APRS-IS parser. It intentionally accepts only
 * position-bearing maritime packets; telemetry/messages are not vessels. */
export function parseAprsLine(line, now = Date.now()) {
  const text = String(line || '').trim();
  if (!text || text.startsWith('#')) return null;
  const bang = text.indexOf('!AIVDM,');
  const ais = bang >= 0 ? parseAis(text.slice(bang), now) : null;
  if (ais) return ais;
  const colon = text.indexOf(':');
  if (colon < 1) return null;
  const callsign = text.slice(0, colon).split('>')[0].trim();
  const payload = text.slice(colon + 1);
  const position = parseAprsPosition(payload);
  if (!position || !isMaritimeAprs(payload)) return null;
  return { ...position, reference: `aprs:${callsign}`, callsign, source: 'APRS-IS', transport: 'tcp', timestamp: new Date(now).toISOString(), freshness: 'live', metadata: { protocol: 'APRS', rawSymbol: position.symbol } };
}

function parseAprsPosition(payload) {
  const m = payload.match(/^[!=/@][^0-9A-Z]*([0-9]{2})([0-9]{2}\.[0-9]{2})([NS])([/\\])([0-9]{3})([0-9]{2}\.[0-9]{2})([EW])([A-Za-z0-9])/);
  if (!m) return null;
  const lat = (Number(m[1]) + Number(m[2]) / 60) * (m[3] === 'S' ? -1 : 1);
  const lon = (Number(m[5]) + Number(m[6]) / 60) * (m[7] === 'W' ? -1 : 1);
  if (lat > 90 || lon > 180) return null;
  const table = payload.match(/^[!=/@][^0-9A-Z]*[0-9]{4}\.[0-9]{2}[NS]([/\\])/);
  const sym = m[8];
  const courseSpeed = payload.match(/([0-9]{3})\/([0-9]{3})/);
  return { lat, lon, course: courseSpeed ? Number(courseSpeed[1]) : null, speed: courseSpeed ? Number(courseSpeed[2]) : null, name: null, symbol: `${table?.[1] || ''}${sym}` };
}
// APRS ship (/s or \\s), boat (>), and yacht (Y/y) symbols only.
function isMaritimeAprs(payload) { return /^[!=/@].*?[\\/]s|^[!=/@].*?>|^[!=/@].*?[Yy]/.test(payload); }
function parseAis(sentence, now) {
  const fields = sentence.split(',');
  if (fields[0] !== '!AIVDM' || !/^\d+$/.test(fields[1] || '') || !/^\d+$/.test(fields[2] || '') || !fields[5]) return null;
  const bits = [...fields[5]].flatMap((c) => { const n = c.charCodeAt(0) - 48 - (c.charCodeAt(0) >= 88 ? 8 : 0); return Array.from({ length: 6 }, (_, i) => (n >> (5 - i)) & 1); });
  const type = bitsToInt(bits, 0, 6); if (![1, 2, 3, 18].includes(type)) return null;
  const mmsi = bitsToInt(bits, 8, 30).toString();
  const lonBits = type === 18 ? 57 : 61, latBits = type === 18 ? 85 : 89;
  const lon = signed(bitsToInt(bits, lonBits, 28), 28) / 600000;
  const lat = signed(bitsToInt(bits, latBits, 27), 27) / 600000;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const course = type === 18 ? bitsToInt(bits, 79, 12) / 10 : bitsToInt(bits, 116, 12) / 10;
  const speed = type === 18 ? bitsToInt(bits, 46, 10) / 10 : bitsToInt(bits, 50, 10) / 10;
  return { reference: `mmsi:${mmsi}`, mmsi, lat, lon, course: course >= 360 ? null : course, speed: speed >= 102.3 ? null : speed, name: `MMSI ${mmsi}`, source: 'APRS-IS', transport: 'tcp', timestamp: new Date(now).toISOString(), freshness: 'live', metadata: { protocol: 'AIS', aisType: type } };
}
function bitsToInt(bits, start, length) { return bits.slice(start, start + length).reduce((n, b) => n * 2 + b, 0); }
function signed(n, width) { return n & (1 << (width - 1)) ? n - 2 ** width : n; }
