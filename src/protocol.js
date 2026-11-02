/** Compact protocol: client position packet = 10B; server packet = 26B.
 * 1 byte type, 2 bytes sequence, 2+2 position (cm), 2 yaw (1e-4 rad), 1 action.
 * Server additionally appends 16 bytes for UUID of sender.
 */
export const ACTIONS = Object.freeze(['idle', 'bow', 'greet', 'dance', 'offer', 'beads', 'moktak', 'sit']);
export function encodeState(state, seq) {
  const bytes = new Uint8Array(10), dv = new DataView(bytes.buffer);
  dv.setUint8(0, 1); dv.setUint16(1, seq & 65535, true);
  dv.setInt16(3, Math.round(state.x * 100), true);
  dv.setInt16(5, Math.round(state.z * 100), true);
  dv.setInt16(7, Math.round(Math.atan2(Math.sin(state.yaw), Math.cos(state.yaw)) * 10000), true);
  dv.setUint8(9, Math.max(0, ACTIONS.indexOf(state.action)));
  return bytes;
}
export function decodeState(buffer) {
  const b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (b.length < 10 || b[0] !== 1) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const n = dv.getUint8(9);
  return { seq: dv.getUint16(1, true), x: dv.getInt16(3, true) / 100,
    z: dv.getInt16(5, true) / 100, yaw: dv.getInt16(7, true) / 10000,
    action: ACTIONS[n] || 'idle' };
}
export function uuidToBytes(uuid) {
  const hex = uuid.replaceAll('-', '');
  if (!/^[0-9a-f]{32}$/i.test(hex)) return new Uint8Array(16);
  return Uint8Array.from({ length: 16 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16));
}
export function bytesToUuid(bytes) {
  if (bytes.length !== 16) return '';
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function encodePeerState(id, state, seq) {
  const b = new Uint8Array(26);
  b.set(encodeState(state, seq), 0); b.set(uuidToBytes(id), 10);
  return b;
}
export function decodePeerState(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length !== 26) return null;
  return { ...decodeState(bytes), id: bytesToUuid(bytes.subarray(10)) };
}
