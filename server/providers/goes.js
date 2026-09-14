import sharp from 'sharp';
import { GOES_SATELLITES, GOES_STAR_PRODUCT } from './goes/catalog.js';
import { fetchStarFrame } from './goes/star.js';
import { createFrameCache } from './goes/cache.js';
import { satelliteNav } from './geostationary/projection.js';
import { reprojectToEquirectangular } from './geostationary/raster.js';

/** Install the keyless GOES imagery proxy. */
export function goesProxy({ fetchImpl = fetch, now = () => Date.now(), outputHeight = 1024, ttlMs = 5 * 60_000 } = {}) {
  const cache = createFrameCache();
  let manifest = null;
  let refreshing = null;
  async function refresh() {
    const fetchedAt = now();
    const sources = await Promise.all(GOES_SATELLITES.map(async (satellite) => {
      try {
        const frame = await fetchStarFrame(satellite, { fetchImpl });
        const frameId = `${satellite.id.toLowerCase()}-${frame.contentHash.slice(0, 12)}`;
        let parts = cache.get(frameId);
        if (!parts) {
          const decoded = await sharp(frame.buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
          const projected = reprojectToEquirectangular({ rgba: decoded.data, srcWidth: decoded.info.width, srcHeight: decoded.info.height, nav: satelliteNav(satellite.lon0), outputHeight });
          parts = await Promise.all(projected.parts.map(async (part) => ({
            png: await sharp(part.rgba, { raw: { width: part.width, height: part.height, channels: 4 } }).png().toBuffer(),
            width: part.width, height: part.height, rectangle: part.rectangle,
          })));
          cache.put(frameId, parts);
        }
        return { satelliteId: satellite.id, subSatelliteLongitude: satellite.lon0, product: 'imagery', upstreamProduct: GOES_STAR_PRODUCT, frameId, observationTime: frame.lastModifiedMs, observationTimeSource: frame.lastModifiedMs == null ? 'unknown' : 'last-modified', stale: false, unavailable: false, reason: null, parts: parts.map((part, i) => ({ url: `/api/goes/frames/${frameId}/${i}.png`, rectangle: part.rectangle, width: part.width, height: part.height })) };
      } catch (error) {
        const previous = manifest?.sources.find((source) => source.satelliteId === satellite.id);
        return previous ? { ...previous, unavailable: true, reason: error.message } : { satelliteId: satellite.id, subSatelliteLongitude: satellite.lon0, product: 'imagery', upstreamProduct: GOES_STAR_PRODUCT, frameId: null, observationTime: null, observationTimeSource: 'unknown', stale: false, unavailable: true, reason: error.message, parts: [] };
      }
    }));
    manifest = { schemaVersion: 1, family: 'goes', fetchedAt, sources };
    return manifest;
  }
  function json(res, value, status = 200) { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(value)); }
  async function middleware(req, res, next) {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/goes/manifest') {
      if (!manifest || now() - manifest.fetchedAt >= ttlMs) { refreshing ||= refresh().finally(() => { refreshing = null; }); try { await refreshing; } catch { if (!manifest) return json(res, { schemaVersion: 1, family: 'goes', fetchedAt: now(), sources: [] }); manifest = { ...manifest, sources: manifest.sources.map((source) => ({ ...source, stale: true })) }; } }
      return json(res, manifest);
    }
    const match = url.pathname.match(/^\/api\/goes\/frames\/([^/]+)\/(\d+)\.png$/);
    if (match) { const parts = cache.get(match[1]); const part = parts?.[Number(match[2])]; if (!part) return json(res, { error: 'unknown_frame' }, 404); res.setHeader('Content-Type', 'image/png'); res.setHeader('Cache-Control', 'public, max-age=300, immutable'); res.end(part.png); return; }
    if (url.pathname === '/api/goes/status') return json(res, { fetchedAt: manifest?.fetchedAt ?? null, ttlMs, sources: (manifest?.sources ?? []).map(({ satelliteId, frameId, observationTime, unavailable, reason }) => ({ satelliteId, frameId, observationTime, unavailable, reason })) });
    return next();
  }
  return {
    name: 'goes',
    // Do NOT return the middleware: Vite treats a truthy return from
    // configureServer as a post-hook and would invoke the Connect app itself.
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
