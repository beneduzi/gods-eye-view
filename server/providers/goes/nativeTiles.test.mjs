import assert from 'node:assert/strict';
import test from 'node:test';
import { validateNativeTile, unzipJpeg } from './nativeTiles.js';

test('native tile validation is bounded and rejects malformed coordinates', () => {
  assert.equal(validateNativeTile({ satellite: 'GOES-19', frameId: 'goes19-abi2-abcd', z: 6, x: 0, y: 0 }), true);
  assert.equal(validateNativeTile({ satellite: 'GOES-19', frameId: 'goes19-abi2-abcd', z: 5, x: 0, y: 0 }), false);
  assert.equal(validateNativeTile({ satellite: 'GOES-19', frameId: 'goes19-abi2-abcd', z: 6, x: 64, y: 0 }), false);
  assert.equal(validateNativeTile({ satellite: 'GOES-17', frameId: 'goes19-abi2-abcd', z: 6, x: 0, y: 0 }), false);
});

test('ZIP parser accepts stored JPEG and rejects unsupported/truncated input', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const zip = Buffer.alloc(34); zip.writeUInt32LE(0x04034b50, 0); zip.writeUInt16LE(0, 8); zip.writeUInt32LE(jpeg.length, 18); zip.writeUInt16LE(0, 26); zip.writeUInt16LE(0, 28); jpeg.copy(zip, 30);
  assert.deepEqual(unzipJpeg(zip), jpeg);
  assert.throws(() => unzipJpeg(Buffer.alloc(10)), /Invalid native/);
});
