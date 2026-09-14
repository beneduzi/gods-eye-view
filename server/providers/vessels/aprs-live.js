import net from 'node:net';
import tls from 'node:tls';
import { parseAprsLine } from './aprs-parser.js';
const MAX = 2000,
  STALE = 30 * 60_000;
const records = new Map();
let socket = null,
  timer = null,
  attempt = 0,
  state = 'idle',
  nextAttemptAt = null;
function configured() {
  return Boolean(
    process.env.APRS_IS_HOST || process.env.APRS_IS_ENABLED === '1',
  );
}
function filter() {
  return process.env.APRS_IS_FILTER || 'r/0/0/180';
}
function connect() {
  if (!configured() || socket) return;
  state = 'connecting';
  const host = process.env.APRS_IS_HOST || 'rotate.aprs2.net';
  const port = Number(process.env.APRS_IS_PORT || 14580);
  socket = (process.env.APRS_IS_TLS === '1' ? tls : net).connect(
    { host, port, timeout: 20_000 },
    () => {
      state = 'live';
      attempt = 0;
      socket.write(
        `user ${process.env.APRS_IS_CALLSIGN || 'N0CALL'} pass ${process.env.APRS_IS_PASSCODE || '-1'} vers gods-eye-view 1.0\nfilter ${filter()}\n`,
      );
    },
  );
  let buffer = '';
  socket.setEncoding('utf8');
  socket.on('data', (chunk) => {
    buffer += chunk;
    let i;
    while ((i = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, i).replace(/\r$/, '');
      buffer = buffer.slice(i + 1);
      const row = parseAprsLine(line);
      if (row) {
        records.set(row.reference, { ...row, _updatedAt: Date.now() });
        prune();
      }
    }
  });
  const retry = () => {
    socket = null;
    state = 'down';
    const delay = Math.min(300_000, 2_000 * 2 ** Math.min(attempt++, 7));
    nextAttemptAt = Date.now() + delay;
    clearTimeout(timer);
    timer = setTimeout(connect, delay);
    timer.unref?.();
  };
  socket.on('error', retry);
  socket.on('close', retry);
  socket.on('timeout', () => socket.destroy());
}
function prune() {
  const cutoff = Date.now() - STALE;
  for (const [key, row] of records)
    if (row._updatedAt < cutoff) records.delete(key);
  while (records.size > MAX) records.delete(records.keys().next().value);
}
export function aprsLiveProxy() {
  return {
    name: 'aprs-live-proxy',
    configureServer(server) {
      server.middlewares.use('/api/aprs-live', handler);
      connect();
      server.httpServer?.on('close', dispose);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/aprs-live', handler);
      connect();
      server.httpServer?.on('close', dispose);
    },
    closeBundle: dispose,
  };
}
function handler(req, res) {
  const url = new URL(req.url || '', 'http://localhost');
  const maxRows = Math.min(
    2000,
    Math.max(
      1,
      Number.parseInt(url.searchParams.get('maxRows') || '2000', 10) || 2000,
    ),
  );
  const rows = [...records.values()]
    .sort((a, b) => b._updatedAt - a._updatedAt)
    .slice(0, maxRows)
    .map(({ _updatedAt, ...r }) => r);
  res.statusCode = configured() ? 200 : 503;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(
    JSON.stringify({
      rows,
      source: 'APRS-IS',
      status: state,
      configured: configured(),
      nextAttemptAt,
      filter: filter(),
    }),
  );
}
function dispose() {
  if (timer) clearTimeout(timer);
  timer = null;
  socket?.destroy();
  socket = null;
  state = 'idle';
}
export { parseAprsLine } from './aprs-parser.js';
