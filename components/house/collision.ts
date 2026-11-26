/**
 * 2D (top-down X/Z) AABB collision for the first-person walk mode.
 * Walls are stored as axis-aligned rectangles. Door openings simply have
 * no rectangle, so the player walks straight through them.
 */

export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface CollisionWorld {
  /** Static solid rectangles (walls, sills, big furniture, compound walls). */
  boxes: AABB[];
  /** Outer walkable limit. */
  bounds: AABB;
}

export const PLAYER_RADIUS = 0.55; // feet

function hits(x: number, z: number, r: number, b: AABB) {
  const cx = Math.max(b.minX, Math.min(x, b.maxX));
  const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz < r * r;
}

export function isBlocked(world: CollisionWorld, x: number, z: number, extra: AABB[] = [], r = PLAYER_RADIUS) {
  const b = world.bounds;
  if (x - r < b.minX || x + r > b.maxX || z - r < b.minZ || z + r > b.maxZ) return true;
  for (const box of world.boxes) if (hits(x, z, r, box)) return true;
  for (const box of extra) if (hits(x, z, r, box)) return true;
  return false;
}

/**
 * Move from (x,z) by (dx,dz) with wall sliding. Large steps are split into
 * sub-steps so a fast frame can never tunnel through a 4.5" partition.
 */
export function moveWithCollision(
  world: CollisionWorld,
  x: number,
  z: number,
  dx: number,
  dz: number,
  extra: AABB[] = [],
): [number, number] {
  const len = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(len / 0.15));
  const sx = dx / steps;
  const sz = dz / steps;
  for (let i = 0; i < steps; i++) {
    if (!isBlocked(world, x + sx, z, extra)) x += sx;
    if (!isBlocked(world, x, z + sz, extra)) z += sz;
  }
  return [x, z];
}

/** Nudge a point out of any overlap (used after teleports / glides). */
export function findFreeSpot(world: CollisionWorld, x: number, z: number, extra: AABB[] = []): [number, number] {
  if (!isBlocked(world, x, z, extra)) return [x, z];
  for (let ring = 1; ring <= 12; ring++) {
    const rad = ring * 0.25;
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      const nx = x + Math.cos(ang) * rad;
      const nz = z + Math.sin(ang) * rad;
      if (!isBlocked(world, nx, nz, extra)) return [nx, nz];
    }
  }
  return [x, z];
}

export function aabbFromRange(x1: number, x2: number, z1: number, z2: number): AABB {
  return {
    minX: Math.min(x1, x2),
    maxX: Math.max(x1, x2),
    minZ: Math.min(z1, z2),
    maxZ: Math.max(z1, z2),
  };
}
