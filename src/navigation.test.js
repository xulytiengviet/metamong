import test from 'node:test';
import assert from 'node:assert/strict';
import { findPath, isWalkable } from './navigation.js';
import { encodeState, decodeState, encodePeerState, decodePeerState } from './protocol.js';
test('A* avoids altar and ponds', () => {
  const p = findPath({ x: 0, z: 8 }, { x: 0, z: -21 });
  assert.ok(p.length > 20);
  assert.ok(p.every(v => isWalkable(v.x, v.z)));
});
test('A* navigates to moon court', () => assert.ok(findPath({ x: 0, z: 8 }, { x: 29, z: 15 }).length > 0));
test('Delta packet quantization and identity', () => {
  const id = '63e842b0-54bd-624a-4654-54d533c33f57';
  const state = { x: 12.12, z: -5.21, yaw: 1.1234, action: 'greet' };
  assert.equal(encodeState(state, 9).byteLength, 10);
  assert.deepEqual(decodeState(encodeState(state, 9)), { ...state, seq: 9 });
  assert.deepEqual(decodePeerState(encodePeerState(id, state, 9)), { ...state, seq: 9, id });
});
