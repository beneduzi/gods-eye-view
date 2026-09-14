import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAprsLine } from './aprs-parser.js';

test('parses all APRS position forms and maritime symbols', () => {
  const forms = ['!', '=', '/', '@'];
  for (const form of forms) {
    const row = parseAprsLine(`CALL>APRS:${form}123456z4903.50N/07201.75Ws`);
    assert.equal(row?.lat.toFixed(4), '49.0583');
    assert.equal(row?.lon.toFixed(4), '-72.0292');
  }
  assert.ok(parseAprsLine('SHIP>APRS:!4903.50N/07201.75Ws'));
  assert.ok(parseAprsLine('SHIP>APRS:!4903.50N\\07201.75Ws'));
  assert.ok(parseAprsLine('SHIP>APRS:!4903.50N/07201.75W>'));
  assert.ok(parseAprsLine('SHIP>APRS:!4903.50N/07201.75WY'));
  assert.equal(parseAprsLine('WX>APRS:!4903.50N/07201.75WcRain'), null);
  assert.equal(parseAprsLine('LAND>APRS:!not-a-position'), null);
});

test('rejects malformed AIS and preserves NMEA sentence framing', () => {
  assert.equal(parseAprsLine('!AIVDM,2,3,1,A,15,0*hh'), null);
  assert.equal(parseAprsLine('!AIVDM,1,1,,A,*hh'), null);
});
