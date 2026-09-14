import { inflateRawSync } from 'node:zlib';
import sharp from 'sharp';
import { starNativeZipUrl } from './catalog.js';

export const TILE_SIZE = 512;
export const MAX_ZOOM = 6;
const MAX_ZIP_BYTES = 80 * 1024 * 1024;

export function validateNativeTile({ satellite, frameId, z, x, y } = {}) {
  if (!/^GOES-(18|19)$/.test(satellite) || !/^[a-z0-9-]{8,100}$/i.test(frameId)) return false;
  z = Number(z); x = Number(x); y = Number(y);
  const n = 2 ** z;
  return Number.isInteger(z) && z >= 0 && z <= MAX_ZOOM && Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < n && y < n;
}

function unzipJpeg(buffer) {
  if (buffer.length > MAX_ZIP_BYTES || buffer.readUInt32LE(0) !== 0x04034b50) throw new Error('Invalid native C02 ZIP');
  const method = buffer.readUInt16LE(8); const compressed = buffer.readUInt32LE(18); const start = 30 + buffer.readUInt16LE(26) + buffer.readUInt16LE(28);
  if (!compressed || start < 30 || start + compressed > buffer.length) throw new Error('Malformed native C02 ZIP');
  const data = buffer.subarray(start, start + compressed);
  return method === 0 ? data : method === 8 ? inflateRawSync(data, { maxOutputLength: 22000 * 22000 }) : (() => { throw new Error('Unsupported native C02 ZIP'); })();
}

export function createNativeTileStore({ fetchImpl = fetch, maxFrames = 2 } = {}) {
  const frames = new Map();
  const tiles = new Map();
  async function getTile(satellite, frameId, z, x, y) {
    if (!validateNativeTile({ satellite, frameId, z, x, y })) throw new RangeError('Invalid native tile request');
    const key = `${satellite}/${frameId}/${z}/${x}/${y}`;
    if (tiles.has(key)) return tiles.get(key);
    let image = frames.get(`${satellite}/${frameId}`);
    if (!image) {
      const response = await fetchImpl(starNativeZipUrl({ starCode: satellite === 'GOES-19' ? 'GOES19' : 'GOES18' }));
      if (!response.ok) throw new Error(`STAR native C02 request failed: ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      image = sharp(unzipJpeg(bytes));
      frames.set(`${satellite}/${frameId}`, image);
      while (frames.size > maxFrames) frames.delete(frames.keys().next().value);
    }
    const n = 2 ** Number(z); const size = Math.ceil(21696 / n);
    const png = await image.clone().resize(21696, 21696).extract({ left: Number(x) * size, top: Number(y) * size, width: Math.min(size, 21696 - Number(x) * size), height: Math.min(size, 21696 - Number(y) * size) }).png().toBuffer();
    tiles.set(key, png); return png;
  }
  return { getTile };
}
