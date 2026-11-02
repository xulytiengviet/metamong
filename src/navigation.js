/** Deterministic A* pathfinder on a shared 1m walk grid. No network calls. */
export const BOUNDS = Object.freeze({ minX: -43, maxX: 43, minZ: -31, maxZ: 47 });
const obstacles = [
  { kind: 'box', x1: -10, x2: 10, z1: -16, z2: -9.4 },
  { kind: 'circle', x: -18, z: 3, r: 4.5 },
  { kind: 'circle', x: 18, z: 3, r: 4.5 },
  { kind: 'box', x1: 27, x2: 32, z1: 21, z2: 24 }
];
export function isWalkable(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (x < BOUNDS.minX || x > BOUNDS.maxX || z < BOUNDS.minZ || z > BOUNDS.maxZ) return false;
  return obstacles.every(o => o.kind === 'box'
    ? x < o.x1 || x > o.x2 || z < o.z1 || z > o.z2
    : (x - o.x) ** 2 + (z - o.z) ** 2 >= o.r ** 2);
}
const key = (x, z) => `${x},${z}`;
function closest(x, z) {
  const px = Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, Math.round(x)));
  const pz = Math.max(BOUNDS.minZ, Math.min(BOUNDS.maxZ, Math.round(z)));
  if (isWalkable(px, pz)) return [px, pz];
  for (let radius = 1; radius <= 8; radius++) {
    for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
      if (isWalkable(px + dx, pz + dz)) return [px + dx, pz + dz];
    }
  }
  return null;
}
/** Return [] when no route exists, otherwise array of {x,z} waypoints. */
export function findPath(start, end, maxNodes = 13000) {
  const s = closest(start.x, start.z), t = closest(end.x, end.z);
  if (!s || !t) return [];
  const source = key(...s), target = key(...t);
  const h = (x, z) => Math.hypot(x - t[0], z - t[1]);
  const nodes = new Map([[source, { x: s[0], z: s[1], g: 0, f: h(...s), parent: null }]]);
  const open = [source], closed = new Set();
  const steps = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  let visited = 0;
  while (open.length && visited++ < maxNodes) {
    let best = 0;
    for (let i = 1; i < open.length; i++) if (nodes.get(open[i]).f < nodes.get(open[best]).f) best = i;
    const currentKey = open.splice(best, 1)[0];
    if (currentKey === target) {
      const path = [];
      for (let k = target; k && k !== source; k = nodes.get(k).parent) {
        const n = nodes.get(k); path.push({ x: n.x, z: n.z });
      }
      path.reverse();
      if (path.length && isWalkable(end.x, end.z)) path[path.length - 1] = { x: end.x, z: end.z };
      return path;
    }
    closed.add(currentKey);
    const node = nodes.get(currentKey);
    for (const [dx, dz] of steps) {
      const nx = node.x + dx, nz = node.z + dz, nk = key(nx, nz);
      if (closed.has(nk) || !isWalkable(nx, nz)) continue;
      if (dx && dz && (!isWalkable(node.x + dx, node.z) || !isWalkable(node.x, node.z + dz))) continue;
      const g = node.g + (dx && dz ? Math.SQRT2 : 1);
      const old = nodes.get(nk);
      if (!old || g < old.g) {
        nodes.set(nk, { x: nx, z: nz, g, f: g + h(nx, nz), parent: currentKey });
        if (!open.includes(nk)) open.push(nk);
      }
    }
  }
  return [];
}
