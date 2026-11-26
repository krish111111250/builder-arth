/**
 * Procedural geometry for 3 attached 1BHK row houses.
 *
 * Scale: 1 unit = 1 foot. World X runs left -> right across the plot
 * (-22.5 .. 22.5), world Z runs back -> front (front road is +Z).
 *
 * Each house is described in LOCAL plan coordinates:
 *   lx = 0..15  across the unit (0 = left party/outer wall centre line)
 *   d  = 0..35  depth from the front plot edge (0) to the rear compound wall (35)
 * House 2 is mirrored (lx -> 15 - lx) so Houses 1 and 2 share the kitchen
 * plumbing wall on the x = -7.5 party wall.
 *
 * All static meshes are merged per material (a few dozen draw calls in total).
 * Furniture is tagged by a key so it can be skipped and replaced by a GLB model
 * at the matching anchor (see models.tsx).
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { MatKey, MaterialLibrary } from "./textures";
import { aabbFromRange, type AABB, type CollisionWorld } from "./collision";

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

export const UNIT_W = 15;
export const PLOT_W = 45;
export const FLOOR_Y = 2; // plinth height
export const CEIL_H = 10;
export const EYE_H = 5.5;
export const EYE_Y = FLOOR_Y + EYE_H; // 7.5
const EXT_T = 0.75; // 9"
const INT_T = 0.375; // 4.5"
const F = FLOOR_Y;

export interface HouseInfo {
  index: number;
  name: string;
  short: string;
  mirror: boolean;
}

export const HOUSES: HouseInfo[] = [
  { index: 0, name: "House 1", short: "H1", mirror: false },
  { index: 1, name: "House 2 (Mirrored)", short: "H2", mirror: true },
  { index: 2, name: "House 3", short: "H3", mirror: false },
];

export const unitOriginX = (i: number) => -PLOT_W / 2 + UNIT_W * i;

export function localToWorld(i: number, lx: number, d: number) {
  const ox = unitOriginX(i);
  const x = HOUSES[i].mirror ? ox + UNIT_W - lx : ox + lx;
  return { x, z: 17.5 - d };
}

export function worldToLocal(i: number, x: number, z: number) {
  const ox = unitOriginX(i);
  const lx = HOUSES[i].mirror ? ox + UNIT_W - x : x - ox;
  return { lx, d: 17.5 - z };
}

export function houseIndexAt(x: number) {
  return Math.max(0, Math.min(2, Math.floor((x + PLOT_W / 2) / UNIT_W)));
}

/* ------------------------------------------------------------------ */
/* Rooms (local plan)                                                  */
/* ------------------------------------------------------------------ */

export interface RoomDef {
  key: string;
  name: string;
  /** detection rectangle (local) */
  lx1: number;
  lx2: number;
  d1: number;
  d2: number;
  /** clear interior size in feet [across, deep] */
  size: [number, number];
  label: [number, number];
  waypoint: [number, number];
  look: [number, number];
}

export const ROOMS: RoomDef[] = [
  { key: "sitout", name: "Sit-Out & Bike Parking", lx1: 0, lx2: 15, d1: -3.2, d2: 5, size: [14.25, 5], label: [4.6, 2.6], waypoint: [12.3, 2.6], look: [12.3, 12] },
  { key: "living", name: "Living Hall", lx1: 0.375, lx2: 14.625, d1: 5, d2: 15.94, size: [14.25, 10], label: [7.5, 10.2], waypoint: [11.3, 11.4], look: [2, 10.5] },
  { key: "dining", name: "Dining Passage", lx1: 5.25, lx2: 10, d1: 15.94, d2: 21.81, size: [4.75, 5.5], label: [7.6, 18.9], waypoint: [7.6, 19.2], look: [7.6, 28] },
  { key: "kitchen", name: "Modular Kitchen", lx1: 10, lx2: 14.625, d1: 15.94, d2: 31.375, size: [4.625, 14.875], label: [11.4, 24.5], waypoint: [11.2, 23.6], look: [14.6, 21] },
  { key: "bath", name: "Bathroom", lx1: 0.375, lx2: 5.06, d1: 15.94, d2: 21.81, size: [4.5, 5.5], label: [2.6, 19], waypoint: [3.8, 18.9], look: [0.5, 17.2] },
  { key: "bedroom", name: "Bedroom", lx1: 0.375, lx2: 9.81, d1: 21.81, d2: 31.375, size: [9.25, 9], label: [4.6, 27], waypoint: [8.3, 25.6], look: [3, 28.5] },
  { key: "utility", name: "Utility / Wash Area", lx1: 0.375, lx2: 14.625, d1: 31.375, d2: 34.7, size: [14.25, 2.875], label: [7.5, 33.2], waypoint: [8, 33.2], look: [13.4, 33.4] },
];

/** Walk-mode spawn for each house: living hall, facing sofa, TV wall and the open kitchen. */
export const SPAWN_LOCAL = { lx: 11.9, d: 9.6, lookLx: 5.2, lookD: 19 };

/** 14.25 -> 14'3"  */
export function formatFeet(v: number) {
  const totalIn = Math.round(v * 12 * 2) / 2;
  const ft = Math.floor(totalIn / 12);
  const inch = totalIn - ft * 12;
  if (inch === 0) return `${ft}'`;
  return `${ft}'${inch % 1 === 0 ? inch : inch.toFixed(1)}"`;
}

export const roomSize = (r: RoomDef) => `${formatFeet(r.size[0])} × ${formatFeet(r.size[1])}`;

export function roomAt(i: number, x: number, z: number): RoomDef | null {
  const { lx, d } = worldToLocal(i, x, z);
  for (const r of ROOMS) if (lx >= r.lx1 && lx <= r.lx2 && d >= r.d1 && d <= r.d2) return r;
  return null;
}

/** Floor height under a world point (plinth, front steps, ground). */
export function floorHeightAt(x: number, z: number) {
  if (Math.abs(x) > PLOT_W / 2 + 0.4) return 0;
  const i = houseIndexAt(x);
  const { lx, d } = worldToLocal(i, x, z);
  if (d >= 0 && d <= 35.4) return F;
  if (d < 0 && d > -2.05 && lx > 10.1 && lx < 14.5) {
    // three risers of 8" each
    const t = (d + 2) / 2;
    return Math.max(0, Math.min(F, Math.ceil(t * 3 - 0.0001) * (F / 3)));
  }
  return 0;
}

/* ------------------------------------------------------------------ */
/* Geometry kit (merge-by-material)                                    */
/* ------------------------------------------------------------------ */

function boxUV(g: THREE.BufferGeometry, w: number, h: number, d: number, x0: number, y0: number, z0: number) {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // face order: +x, -x, +y, -y, +z, -z  (4 verts each)
  const dims: [number, number, number, number][] = [
    [d, h, z0, y0], [d, h, z0, y0],
    [w, d, x0, z0], [w, d, x0, z0],
    [w, h, x0, y0], [w, h, x0, y0],
  ];
  for (let f = 0; f < 6; f++) {
    const [su, sv, ou, ov] = dims[f];
    for (let v = 0; v < 4; v++) {
      const idx = f * 4 + v;
      uv.setXY(idx, uv.getX(idx) * su + ou, uv.getY(idx) * sv + ov);
    }
  }
  uv.needsUpdate = true;
}

export class Kit {
  private parts = new Map<MatKey, THREE.BufferGeometry[]>();

  add(k: MatKey, g: THREE.BufferGeometry) {
    let arr = this.parts.get(k);
    if (!arr) {
      arr = [];
      this.parts.set(k, arr);
    }
    arr.push(g);
  }

  box(k: MatKey, x1: number, x2: number, y1: number, y2: number, z1: number, z2: number) {
    const w = Math.abs(x2 - x1);
    const h = Math.abs(y2 - y1);
    const d = Math.abs(z2 - z1);
    if (w < 1e-4 || h < 1e-4 || d < 1e-4) return;
    const g = new THREE.BoxGeometry(w, h, d);
    const mx = Math.min(x1, x2);
    const my = Math.min(y1, y2);
    const mz = Math.min(z1, z2);
    boxUV(g, w, h, d, mx, my, mz);
    g.translate(mx + w / 2, my + h / 2, mz + d / 2);
    this.add(k, g);
  }

  cyl(k: MatKey, cx: number, cy: number, cz: number, len: number, rTop: number, rBot = rTop, axis: "x" | "y" | "z" = "y", seg = 20) {
    const g = new THREE.CylinderGeometry(rTop, rBot, len, seg);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const circ = Math.PI * 2 * Math.max(rTop, rBot);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ, uv.getY(i) * len);
    if (axis === "x") g.rotateZ(Math.PI / 2);
    if (axis === "z") g.rotateX(Math.PI / 2);
    g.translate(cx, cy, cz);
    this.add(k, g);
  }

  sphere(k: MatKey, cx: number, cy: number, cz: number, r: number, sy = 1) {
    const g = new THREE.SphereGeometry(r, 12, 8);
    g.scale(1, sy, 1);
    g.translate(cx, cy, cz);
    this.add(k, g);
  }

  custom(k: MatKey, g: THREE.BufferGeometry) {
    this.add(k, g);
  }

  build(lib: MaterialLibrary, name: string) {
    const group = new THREE.Group();
    group.name = name;
    const noCast: MatKey[] = ["glass", "grass", "asphalt", "marking", "paver", "rug", "coveGlow", "ledStrip", "downlight", "mirrorLight", "sconce", "floor", "bathFloor", "sitout", "utilityFloor", "terrace", "curtain"];
    this.parts.forEach((geos, key) => {
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) return;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, lib[key]);
      mesh.name = `${name}:${key}`;
      mesh.castShadow = !noCast.includes(key);
      mesh.receiveShadow = key !== "glass";
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      if (key === "glass") mesh.renderOrder = 2;
      group.add(mesh);
    });
    this.parts.clear();
    return group;
  }
}

/* ------------------------------------------------------------------ */
/* Walls with real openings                                            */
/* ------------------------------------------------------------------ */

interface Opening {
  a: number;
  b: number;
  sill: number;
  head: number;
}

/**
 * Wall along world `axis` ('x' or 'z'), centred on the perpendicular
 * coordinate `c`. Openings are cut by building left/right/sill/lintel pieces,
 * so nothing solid ever sits across a doorway. Each half of the thickness gets
 * its own material (matNeg faces the smaller perpendicular coordinate).
 */
function wall(
  kit: Kit,
  boxes: AABB[],
  axis: "x" | "z",
  c: number,
  t: number,
  s1: number,
  s2: number,
  y0: number,
  h: number,
  openings: Opening[],
  matNeg: MatKey,
  matPos: MatKey,
  collide = true,
) {
  const ops = openings.filter((o) => o.b > s1 && o.a < s2).sort((p, q) => p.a - q.a);
  const seg = (a: number, b: number, ya: number, yb: number, solid: boolean) => {
    if (b - a < 1e-4 || yb - ya < 1e-4) return;
    if (axis === "x") {
      kit.box(matNeg, a, b, ya, yb, c - t / 2, c);
      kit.box(matPos, a, b, ya, yb, c, c + t / 2);
      if (solid && collide) boxes.push(aabbFromRange(a, b, c - t / 2, c + t / 2));
    } else {
      kit.box(matNeg, c - t / 2, c, ya, yb, a, b);
      kit.box(matPos, c, c + t / 2, ya, yb, a, b);
      if (solid && collide) boxes.push(aabbFromRange(c - t / 2, c + t / 2, a, b));
    }
  };
  let cur = s1;
  for (const o of ops) {
    seg(cur, o.a, y0, y0 + h, true);
    if (o.sill > 0) seg(o.a, o.b, y0, y0 + o.sill, o.sill >= 1);
    seg(o.a, o.b, y0 + o.head, y0 + h, false);
    cur = o.b;
  }
  seg(cur, s2, y0, y0 + h, true);
}

/* ------------------------------------------------------------------ */
/* Output                                                              */
/* ------------------------------------------------------------------ */

export interface DoorDef {
  house: number;
  hinge: THREE.Vector3;
  /** +1: leaf extends to world +X when closed, -1: to -X */
  dir: 1 | -1;
  width: number;
  height: number;
  openAngle: number;
  closedBox: AABB;
}

export interface ModelAnchor {
  house: number;
  key: FurnitureKey;
  position: THREE.Vector3;
  rotationY: number;
}

export type FurnitureKey = "sofa" | "coffeeTable" | "tvUnit" | "bed" | "wardrobe" | "fridge" | "washingMachine" | "toilet" | "scooter";

export interface HouseLights {
  living: THREE.Vector3;
  kitchen: THREE.Vector3;
  bedroom: THREE.Vector3;
  bath: THREE.Vector3;
  porch: THREE.Vector3;
}

export interface BuiltScene {
  main: THREE.Group;
  roof: THREE.Group;
  ground: THREE.Mesh;
  collision: CollisionWorld;
  doors: DoorDef[];
  fans: THREE.Vector3[];
  anchors: ModelAnchor[];
  lights: HouseLights[];
  dispose: () => void;
}

/* ------------------------------------------------------------------ */
/* One house unit                                                      */
/* ------------------------------------------------------------------ */

interface UnitCtx {
  main: Kit;
  roof: Kit;
  boxes: AABB[];
  doors: DoorDef[];
  fans: THREE.Vector3[];
  anchors: ModelAnchor[];
  lights: HouseLights[];
  skip: Set<FurnitureKey>;
}

export function buildHouseUnit(i: number, ctx: UnitCtx) {
  const { main, roof, boxes, skip } = ctx;
  const mirror = HOUSES[i].mirror;
  const ox = unitOriginX(i);
  const X = (lx: number) => (mirror ? ox + UNIT_W - lx : ox + lx);
  const Z = (d: number) => 17.5 - d;
  const xr = (a: number, b: number): [number, number] => {
    const p = X(a);
    const q = X(b);
    return p < q ? [p, q] : [q, p];
  };
  const V = (lx: number, y: number, d: number) => new THREE.Vector3(X(lx), y, Z(d));

  /** Box in local coordinates. */
  const B = (k: MatKey, lx1: number, lx2: number, y1: number, y2: number, d1: number, d2: number, kit: Kit = main) => {
    const [xa, xb] = xr(lx1, lx2);
    kit.box(k, xa, xb, y1, y2, Z(Math.max(d1, d2)), Z(Math.min(d1, d2)));
  };
  /** Collision rectangle in local coordinates. */
  const solid = (lx1: number, lx2: number, d1: number, d2: number) => {
    const [xa, xb] = xr(lx1, lx2);
    boxes.push(aabbFromRange(xa, xb, Z(d1), Z(d2)));
  };
  const Cy = (k: MatKey, lx: number, d: number, y1: number, y2: number, r: number, r2 = r, kit: Kit = main, seg = 20) =>
    kit.cyl(k, X(lx), (y1 + y2) / 2, Z(d), y2 - y1, r, r2, "y", seg);
  /** Horizontal cylinder along local x between lx1..lx2. */
  const CxL = (k: MatKey, lx1: number, lx2: number, y: number, d: number, r: number, kit: Kit = main) => {
    const [xa, xb] = xr(lx1, lx2);
    kit.cyl(k, (xa + xb) / 2, y, Z(d), xb - xa, r, r, "x", 10);
  };
  const CdL = (k: MatKey, lx: number, y: number, d1: number, d2: number, r: number, kit: Kit = main) =>
    kit.cyl(k, X(lx), y, Z((d1 + d2) / 2), Math.abs(d2 - d1), r, r, "z", 12);
  const S = (k: MatKey, lx: number, y: number, d: number, r: number, sy = 1, kit: Kit = main) => kit.sphere(k, X(lx), y, Z(d), r, sy);

  /** Wall running along local x at depth dc. matFront faces the smaller d (toward the road). */
  const wallLX = (dc: number, t: number, lx1: number, lx2: number, ops: Opening[], matFront: MatKey, matBack: MatKey, h = CEIL_H, y0 = F) => {
    const [s1, s2] = xr(lx1, lx2);
    const wops = ops.map((o) => {
      const [a, b] = xr(o.a, o.b);
      return { a, b, sill: o.sill, head: o.head };
    });
    // world z = 17.5 - d: the front side has the larger z => "pos"
    wall(main, boxes, "x", Z(dc), t, s1, s2, y0, h, wops, matBack, matFront);
  };
  /** Wall running along local d at lx = lc. matLeft faces the smaller lx. */
  const wallLD = (lc: number, t: number, d1: number, d2: number, ops: Opening[], matLeft: MatKey, matRight: MatKey, h = CEIL_H) => {
    const wops = ops.map((o) => ({ a: Z(o.b), b: Z(o.a), sill: o.sill, head: o.head }));
    wall(main, boxes, "z", X(lc), t, Z(d2), Z(d1), F, h, wops, mirror ? matRight : matLeft, mirror ? matLeft : matRight);
  };

  /** Wavy curtain panel hanging parallel to a wall that runs along local x. */
  const curtain = (lx1: number, lx2: number, y1: number, y2: number, d: number) => {
    const w = Math.abs(lx2 - lx1);
    const h = y2 - y1;
    const g = new THREE.PlaneGeometry(w, h, 18, 1);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let v = 0; v < pos.count; v++) pos.setZ(v, Math.sin((pos.getX(v) / w) * Math.PI * 7) * 0.09);
    g.computeVertexNormals();
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let v = 0; v < uv.count; v++) uv.setXY(v, uv.getX(v) * w, uv.getY(v) * h);
    const [xa, xb] = xr(lx1, lx2);
    g.translate((xa + xb) / 2, (y1 + y2) / 2, Z(d));
    main.custom("curtain", g);
  };

  /** Aluminium window with glass, mullion, granite sill, optional curtains and chajja. */
  const windowLX = (
    dc: number,
    t: number,
    a: number,
    b: number,
    sill: number,
    head: number,
    opts: { curtainD?: number; curtainBottom?: number; chajjaSide?: "front" | "back" },
  ) => {
    const y1 = F + sill;
    const y2 = F + head;
    const ft = 0.14;
    B("frame", a, a + ft, y1, y2, dc - 0.12, dc + 0.12);
    B("frame", b - ft, b, y1, y2, dc - 0.12, dc + 0.12);
    B("frame", a, b, y2 - ft, y2, dc - 0.12, dc + 0.12);
    B("frame", a, b, y1, y1 + ft, dc - 0.12, dc + 0.12);
    B("frame", (a + b) / 2 - 0.06, (a + b) / 2 + 0.06, y1, y2, dc - 0.1, dc + 0.1);
    B("glass", a + ft, b - ft, y1 + ft, y2 - ft, dc - 0.02, dc + 0.02);
    B("granite", a - 0.2, b + 0.2, y1 - 0.08, y1, dc - t / 2 - 0.18, dc + t / 2 + 0.18);
    if (opts.curtainD !== undefined) {
      const cb = F + (opts.curtainBottom ?? 0.25);
      const cd = opts.curtainD;
      curtain(a - 0.8, a + 0.55, cb, F + 8.7, cd);
      curtain(b - 0.55, b + 0.8, cb, F + 8.7, cd);
      CxL("steel", a - 1.0, b + 1.0, F + 8.8, cd, 0.05);
    }
    if (opts.chajjaSide) {
      const out = opts.chajjaSide === "front" ? -1 : 1;
      const face = dc + (out * t) / 2;
      B("extAccent", a - 0.6, b + 0.6, y2 + 0.4, y2 + 0.65, face, face + out * 1.6);
    }
  };

  /** Wooden door frame for an opening in a wall along local x. */
  const doorFrameLX = (dc: number, t: number, a: number, b: number, head: number) => {
    const fw = 0.22;
    const half = t / 2 + 0.06;
    B("wood", a - fw, a, F, F + head + fw, dc - half, dc + half);
    B("wood", b, b + fw, F, F + head + fw, dc - half, dc + half);
    B("wood", a - fw, b + fw, F + head, F + head + fw, dc - half, dc + half);
  };
  const doorFrameLD = (lc: number, t: number, a: number, b: number, head: number) => {
    const fw = 0.22;
    const half = t / 2 + 0.06;
    B("wood", lc - half, lc + half, F, F + head + fw, a - fw, a);
    B("wood", lc - half, lc + half, F, F + head + fw, b, b + fw);
    B("wood", lc - half, lc + half, F + head, F + head + fw, a - fw, b + fw);
  };

  const anchor = (key: FurnitureKey, lx: number, d: number, faceLx: number, faceD: number) => {
    const wx = mirror ? -faceLx : faceLx;
    const wz = -faceD;
    ctx.anchors.push({ house: i, key, position: V(lx, F, d), rotationY: Math.atan2(wx, wz) });
  };

  /* ---------------- Floors ---------------- */
  B("floor", 0.375, 14.625, F, F + 0.03, 5.75, 31);
  B("sitout", 0.375, 14.625, F, F + 0.04, 0, 5);
  B("bathFloor", 0.375, 4.875, F + 0.03, F + 0.05, 16.125, 21.625);
  B("utilityFloor", 0.375, 14.625, F, F + 0.04, 31.75, 34.625);
  B("paver", 0.25, 14.75, 0, 0.05, -2.75, 0);

  /* ---------------- Front wall (d = 5.375) ---------------- */
  const FW = 5.375;
  wallLX(FW, EXT_T, 0.375, 14.625, [
    { a: 1.5, b: 6.0, sill: 3, head: 7 },
    { a: 10.9, b: 13.9, sill: 0, head: 7 },
  ], "extLight", "wall");
  // stone cladding feature around the main door
  B("cladding", 9.9, 14.625, F, F + CEIL_H, 4.94, 5.0);
  windowLX(FW, EXT_T, 1.5, 6.0, 3, 7, { curtainD: 6.1 });
  doorFrameLX(FW, EXT_T, 10.9, 13.9, 7);
  // main door: animated leaf (hinge on the lx = 10.9 side, swings into the hall)
  {
    const hinge = V(10.9, F, FW);
    const [xa, xb] = xr(10.9, 13.9);
    ctx.doors.push({
      house: i,
      hinge,
      dir: mirror ? -1 : 1,
      width: 3,
      height: 7,
      openAngle: (mirror ? -1 : 1) * Math.PI * 0.47,
      closedBox: aabbFromRange(xa, xb, Z(FW + 0.25), Z(FW - 0.25)),
    });
  }
  // porch wall sconces
  for (const sx of [10.35, 14.3]) {
    B("blackMetal", sx - 0.2, sx + 0.2, F + 6.1, F + 7.3, 4.86, 4.94);
    B("sconce", sx - 0.13, sx + 0.13, F + 6.25, F + 7.15, 4.74, 4.86);
  }

  /* ---------------- Sit-out ---------------- */
  // planter ledge along the front edge (with steps opening)
  B("cladding", 0.375, 10.0, F, F + 1.5, 0, 0.7);
  B("soil", 0.5, 9.9, F + 1.5, F + 1.52, 0.1, 0.6);
  for (let p = 0; p < 5; p++) {
    const px = 1.3 + p * 1.9;
    S("leaf", px, F + 2.0, 0.38, 0.55, 0.9);
    S("leaf", px + 0.45, F + 1.85, 0.3, 0.38, 0.9);
  }
  solid(0.375, 10.0, 0, 0.7);
  solid(14.45, 15, -0.05, 0.3);
  // potted plants beside the door
  Cy("pot", 9.4, 4.2, F, F + 1.3, 0.42, 0.32);
  S("leaf", 9.4, F + 2.1, 4.2, 0.7, 1.2);
  solid(8.9, 9.9, 3.7, 4.7);
  // front steps (3 risers)
  for (let s = 0; s < 3; s++) {
    const top = (F / 3) * (s + 1);
    const d1 = -2 + (2 / 3) * s;
    B("step", 10.2, 14.4, 0, top, d1, 0);
  }
  // bike / scooter in the front setback
  if (!skip.has("scooter")) {
    const sd = -1.55;
    CdL("tyre", 2.4, 0.55, sd - 0.2, sd + 0.2, 0.55);
    CdL("tyre", 6.4, 0.55, sd - 0.2, sd + 0.2, 0.55);
    B("scooter", 2.6, 6.2, 0.9, 1.7, sd - 0.55, sd + 0.55);
    B("scooter", 5.3, 6.6, 1.0, 3.3, sd - 0.35, sd + 0.35);
    B("blackMetal", 3.0, 5.0, 1.7, 2.3, sd - 0.5, sd + 0.5);
    CdL("steel", 6.4, 3.8, sd - 1.0, sd + 1.0, 0.05);
    B("blackMetal", 6.25, 6.55, 3.3, 3.8, sd - 0.12, sd + 0.12);
  }
  anchor("scooter", 4.4, -1.55, 0, 1);
  solid(1.8, 7.0, -2.2, -0.9);

  /* ---------------- Partition A (living | bath, dining, kitchen) ---------------- */
  const PA = 15.9375;
  wallLX(PA, INT_T, 0.375, 14.625, [{ a: 5.5, b: 12.0, sill: 0, head: 8 }], "wall", "wall");
  B("wood", 5.28, 5.5, F, F + 8.2, PA - 0.25, PA + 0.25);
  B("wood", 12.0, 12.22, F, F + 8.2, PA - 0.25, PA + 0.25);
  B("wood", 5.28, 12.22, F + 8, F + 8.2, PA - 0.25, PA + 0.25);

  /* ---------------- Bath wall (lx = 5.0625) ---------------- */
  const BW = 5.0625;
  wallLD(BW, INT_T, 16.125, 21.625, [{ a: 17.7, b: 20.0, sill: 0, head: 7 }], "wall", "wall");
  doorFrameLD(BW, INT_T, 17.7, 20.0, 7);
  B("wood", 2.6, 4.875, F, F + 6.9, 17.7, 17.85); // open bath door leaf
  solid(2.6, 4.875, 17.7, 17.85);

  /* ---------------- Partition B (dining | bedroom) ---------------- */
  const PB = 21.8125;
  wallLX(PB, INT_T, 0.375, 10.0, [{ a: 5.6, b: 8.6, sill: 0, head: 7 }], "wall", "wall");
  doorFrameLX(PB, INT_T, 5.6, 8.6, 7);
  B("wood", 5.6, 5.75, F, F + 6.9, 22.0, 24.9); // open bedroom door leaf
  solid(5.6, 5.75, 22.0, 24.9);

  /* ---------------- Divider (bedroom | kitchen) ---------------- */
  const DV = 9.8125;
  wallLD(DV, INT_T, 21.625, 31, [], "wall", "wall");

  /* ---------------- Rear wall (d = 31.375) ---------------- */
  const RW = 31.375;
  wallLX(RW, EXT_T, 0.375, 14.625, [
    { a: 3.0, b: 6.0, sill: 4.5, head: 7.5 },
    { a: 10.1, b: 12.4, sill: 0, head: 7 },
  ], "wall", "extLight");
  windowLX(RW, EXT_T, 3.0, 6.0, 4.5, 7.5, { curtainD: 30.42, curtainBottom: 4.35, chajjaSide: "back" });
  doorFrameLX(RW, EXT_T, 10.1, 12.4, 7);
  B("wood", 12.25, 12.4, F, F + 6.9, 31.75, 34.05); // rear door leaf, open to the wash area
  solid(12.25, 12.4, 31.75, 34.05);

  /* ---------------- Living hall ---------------- */
  if (!skip.has("sofa")) {
    // L-shaped sofa: long run on the left wall, short run on partition A
    B("sofa", 0.5, 3.3, F, F + 1.45, 7.3, 15.6);
    B("sofa", 0.5, 1.25, F + 1.45, F + 2.9, 7.3, 15.6);
    B("sofa", 3.3, 5.4, F, F + 1.45, 12.7, 15.6);
    B("sofa", 1.25, 5.4, F + 1.45, F + 2.9, 14.85, 15.6);
    B("sofa", 0.5, 3.3, F, F + 2.1, 7.3, 7.85); // arm
    B("sofa", 5.4, 5.95, F, F + 2.1, 12.7, 15.6); // arm
    B("linen", 1.3, 3.2, F + 1.45, F + 1.75, 7.9, 12.6);
    B("linen", 1.3, 5.35, F + 1.45, F + 1.75, 12.7, 14.8);
    // cushions
    B("cushion", 1.25, 1.65, F + 1.75, F + 3.0, 8.3, 9.7);
    B("cushion", 1.25, 1.65, F + 1.75, F + 3.0, 10.6, 12.0);
    B("cushion", 2.0, 3.4, F + 1.75, F + 3.0, 14.4, 14.8);
    B("cushion", 3.9, 5.2, F + 1.75, F + 3.0, 14.4, 14.8);
  }
  anchor("sofa", 2.8, 11.5, 1, 0);
  solid(0.4, 3.3, 7.3, 15.75);
  solid(0.4, 5.95, 12.7, 15.75);

  B("rug", 3.6, 10.2, F + 0.03, F + 0.06, 7.8, 13.2);
  if (!skip.has("coffeeTable")) {
    B("wood", 5.0, 8.0, F + 1.25, F + 1.45, 9.0, 11.6);
    B("blackMetal", 5.2, 7.8, F + 0.1, F + 1.25, 9.2, 11.4);
    B("granite", 5.3, 7.7, F + 0.4, F + 0.5, 9.3, 11.3);
    Cy("pot", 6.0, 10.3, F + 1.45, F + 1.9, 0.2, 0.15);
    S("leaf", 6.0, F + 2.1, 10.3, 0.28, 0.8);
  }
  anchor("coffeeTable", 6.5, 10.3, 1, 0);
  solid(5.0, 8.0, 9.0, 11.6);

  if (!skip.has("tvUnit")) {
    // slatted wood TV wall
    B("wood", 14.45, 14.625, F, F + 9.2, 8.0, 13.5);
    for (let s = 8.05; s < 13.45; s += 0.36) B("wood", 14.36, 14.45, F, F + 9.2, s, s + 0.16);
    B("wood", 13.3, 14.36, F + 0.7, F + 2.0, 8.5, 13.0);
    B("cabinet", 13.28, 13.3, F + 0.8, F + 1.9, 8.6, 12.9);
    B("ledStrip", 13.32, 13.4, F + 0.62, F + 0.7, 8.6, 12.9);
    // mounted TV
    B("blackMetal", 14.22, 14.36, F + 3.7, F + 5.9, 8.9, 12.7);
    B("screen", 14.2, 14.22, F + 3.78, F + 5.82, 8.98, 12.62);
  }
  anchor("tvUnit", 14.0, 10.75, -1, 0);
  solid(13.3, 14.625, 8.0, 13.5);
  // corner plant
  Cy("pot", 13.9, 15.0, F, F + 1.6, 0.42, 0.3);
  S("leaf", 13.9, F + 2.6, 15.0, 0.75, 1.4);
  solid(13.4, 14.4, 14.5, 15.5);

  // false ceiling with warm cove
  const fcY1 = F + 9.2;
  const fcY2 = F + 9.45;
  B("ceiling", 0.375, 14.625, fcY1, fcY2, 5.75, 7.25, roof);
  B("ceiling", 0.375, 14.625, fcY1, fcY2, 14.25, 15.75, roof);
  B("ceiling", 0.375, 1.875, fcY1, fcY2, 7.25, 14.25, roof);
  B("ceiling", 13.125, 14.625, fcY1, fcY2, 7.25, 14.25, roof);
  B("coveGlow", 1.875, 13.125, fcY2, fcY2 + 0.12, 7.25, 7.33, roof);
  B("coveGlow", 1.875, 13.125, fcY2, fcY2 + 0.12, 14.17, 14.25, roof);
  B("coveGlow", 1.875, 1.955, fcY2, fcY2 + 0.12, 7.25, 14.25, roof);
  B("coveGlow", 13.045, 13.125, fcY2, fcY2 + 0.12, 7.25, 14.25, roof);
  for (const [lx, d] of [[1.1, 6.5], [7.5, 6.5], [13.9, 6.5], [1.1, 15.0], [7.5, 15.0], [13.9, 15.0]] as const) {
    Cy("downlight", lx, d, fcY1 - 0.02, fcY1, 0.22, 0.22, roof, 14);
  }
  ctx.fans.push(V(7.5, F + CEIL_H, 10.75));

  /* ---------------- Bathroom ---------------- */
  const tileT = 0.03;
  B("bathWall", 0.375, 4.875, F, F + CEIL_H, 16.125, 16.125 + tileT);
  B("bathWall", 0.375, 4.875, F, F + CEIL_H, 21.625 - tileT, 21.625);
  B("bathWall", 0.375, 0.375 + tileT, F, F + CEIL_H, 16.125, 21.625);
  B("bathWall", 4.875 - tileT, 4.875, F, F + CEIL_H, 16.125, 17.7);
  B("bathWall", 4.875 - tileT, 4.875, F, F + CEIL_H, 20.0, 21.625);
  B("bathWall", 4.875 - tileT, 4.875, F + 7.2, F + CEIL_H, 17.7, 20.0);
  // vanity + backlit mirror
  B("wood", 0.6, 2.6, F + 1.0, F + 2.6, 16.16, 17.6);
  B("porcelain", 0.55, 2.65, F + 2.6, F + 2.75, 16.16, 17.65);
  Cy("porcelain", 1.6, 16.95, F + 2.75, F + 3.1, 0.5, 0.38);
  Cy("steel", 1.6, 16.35, F + 2.75, F + 3.4, 0.05);
  CdL("steel", 1.6, F + 3.36, 16.35, 16.75, 0.04);
  B("mirrorLight", 0.7, 2.5, F + 3.9, F + 6.2, 16.16, 16.175);
  B("mirror", 0.8, 2.4, F + 4.0, F + 6.1, 16.175, 16.2);
  solid(0.4, 2.65, 16.1, 17.65);
  // western toilet
  if (!skip.has("toilet")) {
    B("porcelain", 3.3, 4.5, F + 1.3, F + 2.7, 21.0, 21.6);
    Cy("porcelain", 3.9, 20.45, F, F + 1.3, 0.5, 0.36);
    Cy("porcelain", 3.9, 20.45, F + 1.3, F + 1.38, 0.53, 0.53);
    B("steel", 3.75, 4.05, F + 2.7, F + 2.73, 21.2, 21.4);
  }
  anchor("toilet", 3.9, 20.6, 0, -1);
  solid(3.35, 4.5, 19.9, 21.6);
  // glass shower partition + overhead shower
  B("porcelain", 0.405, 2.85, F + 0.05, F + 0.14, 19.5, 21.595);
  B("glass", 2.85, 2.9, F + 0.15, F + 6.6, 19.5, 21.595);
  B("steel", 2.83, 2.92, F + 6.6, F + 6.66, 19.5, 21.595);
  B("steel", 2.83, 2.92, F + 0.14, F + 6.66, 19.47, 19.53);
  CxL("steel", 0.405, 1.25, F + 7.0, 20.55, 0.045);
  Cy("steel", 1.25, 20.55, F + 6.82, F + 6.9, 0.36, 0.36);
  Cy("steel", 0.45, 20.55, F + 3.4, F + 3.6, 0.12);
  solid(2.8, 2.95, 19.45, 21.6);

  /* ---------------- Modular kitchen ---------------- */
  // lower cabinets (right plumbing wall run + front return)
  B("blackMetal", 12.75, 14.625, F, F + 0.33, 16.125, 27.0);
  B("cabinet", 12.625, 14.625, F + 0.33, F + 2.75, 16.125, 27.0);
  B("blackMetal", 10.95, 12.625, F, F + 0.33, 16.125, 18.05);
  B("cabinet", 10.85, 12.625, F + 0.33, F + 2.75, 16.125, 18.2);
  for (let s = 18.2; s < 27; s += 1.6) B("frame", 12.6, 12.625, F + 0.4, F + 2.7, s, s + 0.03);
  for (let s = 18.6; s < 27; s += 1.6) B("steel", 12.57, 12.6, F + 2.3, F + 2.4, s, s + 0.7);
  // granite top
  B("granite", 12.5, 14.625, F + 2.75, F + 2.9, 16.125, 27.0);
  B("granite", 10.8, 12.5, F + 2.75, F + 2.9, 16.125, 18.25);
  // backsplash
  B("backsplash", 14.595, 14.625, F + 2.9, F + 5.0, 16.125, 27.0);
  B("backsplash", 12.0, 14.625, F + 2.9, F + 5.0, 16.125, 16.155);
  // upper cabinets (split around the chimney)
  B("cabinet", 13.4, 14.595, F + 5.0, F + 7.6, 16.155, 19.3);
  B("cabinet", 13.4, 14.595, F + 5.0, F + 7.6, 22.2, 27.0);
  B("frame", 13.38, 13.4, F + 5.05, F + 7.55, 17.7, 17.73);
  B("frame", 13.38, 13.4, F + 5.05, F + 7.55, 24.6, 24.63);
  B("ledStrip", 13.42, 13.55, F + 4.96, F + 5.0, 16.2, 19.3);
  B("ledStrip", 13.42, 13.55, F + 4.96, F + 5.0, 22.2, 27.0);
  // 3-burner hob + chimney
  B("hob", 12.8, 14.4, F + 2.9, F + 2.94, 19.6, 21.9);
  for (const bd of [20.0, 20.75, 21.5]) {
    Cy("blackMetal", 13.6, bd, F + 2.94, F + 2.99, 0.28, 0.28, main, 16);
    Cy("steel", 13.6, bd, F + 2.99, F + 3.02, 0.12, 0.12, main, 12);
  }
  B("steel", 13.2, 14.595, F + 5.7, F + 6.1, 19.4, 22.1);
  B("hob", 13.2, 13.25, F + 5.6, F + 6.1, 19.4, 22.1);
  B("steel", 13.75, 14.5, F + 6.1, F + CEIL_H, 20.3, 21.2);
  // sink + faucet (on the shared plumbing wall)
  B("steel", 12.85, 14.25, F + 2.9, F + 2.93, 23.2, 24.8);
  B("blackMetal", 13.0, 14.1, F + 2.905, F + 2.935, 23.35, 24.65);
  Cy("steel", 14.35, 24.0, F + 2.9, F + 3.95, 0.06);
  CxL("steel", 13.7, 14.35, F + 3.9, 24.0, 0.045);
  // refrigerator
  if (!skip.has("fridge")) {
    B("appliance", 12.45, 14.55, F, F + 6.2, 27.3, 29.6);
    B("frame", 12.43, 12.45, F + 3.9, F + 3.93, 27.3, 29.6);
    B("steel", 12.36, 12.43, F + 2.6, F + 3.7, 27.45, 27.55);
    B("steel", 12.36, 12.43, F + 4.2, F + 5.6, 27.45, 27.55);
  }
  anchor("fridge", 13.5, 28.45, -1, 0);
  solid(12.5, 14.625, 16.125, 27.0);
  solid(10.85, 12.625, 16.125, 18.2);
  solid(12.45, 14.625, 27.3, 29.6);

  /* ---------------- Bedroom ---------------- */
  if (!skip.has("wardrobe")) {
    B("wood", 0.375, 5.3, F, F + CEIL_H, 22.0, 23.92);
    B("cabinet", 0.45, 2.84, F + 0.2, F + 9.8, 23.92, 23.98);
    B("cabinet", 2.86, 5.25, F + 0.2, F + 9.8, 23.98, 24.04);
    B("steel", 2.6, 2.66, F + 3.5, F + 6.5, 23.98, 24.02);
    B("steel", 3.05, 3.11, F + 3.5, F + 6.5, 24.04, 24.08);
  }
  anchor("wardrobe", 2.8, 23.0, 0, 1);
  solid(0.375, 5.3, 22.0, 24.05);
  if (!skip.has("bed")) {
    B("wood", 2.0, 7.0, F, F + 4.2, 30.6, 31.0);
    B("sofa", 2.3, 6.7, F + 1.9, F + 4.0, 30.5, 30.6);
    B("wood", 2.0, 7.0, F + 0.3, F + 1.3, 24.4, 30.6);
    B("blackMetal", 2.2, 6.8, F, F + 0.3, 24.6, 30.4);
    B("linen", 2.1, 6.9, F + 1.3, F + 2.0, 24.5, 30.5);
    B("blanket", 2.05, 6.95, F + 1.95, F + 2.15, 24.45, 28.4);
    B("linen", 2.5, 4.35, F + 2.0, F + 2.45, 29.3, 30.35);
    B("linen", 4.65, 6.5, F + 2.0, F + 2.45, 29.3, 30.35);
    B("cushion", 3.4, 5.6, F + 2.1, F + 2.6, 28.8, 29.25);
  }
  anchor("bed", 4.5, 27.5, 0, -1);
  solid(2.0, 7.0, 24.4, 31.0);
  // bedside tables + glowing lamps
  for (const tx of [1.175, 7.825]) {
    B("wood", tx - 0.68, tx + 0.68, F, F + 1.8, 29.5, 30.9);
    B("frame", tx - 0.6, tx + 0.6, F + 1.0, F + 1.03, 29.48, 29.5);
    Cy("wood", tx, 30.2, F + 1.8, F + 2.5, 0.12, 0.16);
    Cy("lampShade", tx, 30.2, F + 2.5, F + 3.25, 0.34, 0.45);
    solid(tx - 0.68, tx + 0.68, 29.5, 30.9);
  }
  // dressing mirror on the divider wall
  B("wood", 9.56, 9.625, F + 1.1, F + 6.7, 25.2, 27.0);
  B("mirror", 9.53, 9.56, F + 1.2, F + 6.6, 25.3, 26.9);
  // ceiling fan-less bedroom: downlights
  for (const [lx, d] of [[4.6, 25.2], [4.6, 29.0], [8.4, 27.0]] as const) Cy("downlight", lx, d, F + CEIL_H - 0.03, F + CEIL_H, 0.22, 0.22, roof, 14);

  /* ---------------- Utility / wash area ---------------- */
  if (!skip.has("washingMachine")) {
    B("porcelain", 12.5, 14.5, F, F + 2.8, 32.4, 34.5);
    B("frame", 12.5, 14.5, F + 2.4, F + 2.8, 32.38, 32.4);
    CdL("steel", 13.5, F + 1.35, 32.33, 32.4, 0.6);
    CdL("screen", 13.5, F + 1.35, 32.3, 32.33, 0.46);
  }
  anchor("washingMachine", 13.5, 33.45, 0, -1);
  solid(12.45, 14.6, 32.35, 34.6);
  // utility sink
  B("concrete", 1.0, 3.4, F + 2.2, F + 2.9, 33.3, 34.6);
  B("concrete", 1.1, 1.35, F, F + 2.2, 33.5, 34.4);
  B("concrete", 3.05, 3.3, F, F + 2.2, 33.5, 34.4);
  Cy("steel", 2.2, 34.5, F + 3.0, F + 3.5, 0.05);
  CdL("steel", 2.2, F + 3.45, 34.1, 34.55, 0.04);
  solid(1.0, 3.4, 33.3, 34.6);

  /* ---------------- Ceiling fixtures ---------------- */
  for (const [lx, d] of [[4.0, 2.5], [11.0, 2.5], [7.6, 18.9], [2.6, 18.9], [11.8, 19.5], [11.6, 24.5], [11.3, 29.8]] as const) {
    Cy("downlight", lx, d, F + CEIL_H - 0.03, F + CEIL_H, 0.22, 0.22, roof, 14);
  }

  /* ---------------- Terrace: water tank ---------------- */
  B("concrete", 5.8, 9.2, F + CEIL_H + 0.75, F + CEIL_H + 1.75, 25.3, 28.7, roof);
  Cy("tank", 7.5, 27, F + CEIL_H + 1.75, F + CEIL_H + 5.4, 1.5, 1.55, roof, 28);
  Cy("tank", 7.5, 27, F + CEIL_H + 5.4, F + CEIL_H + 5.65, 0.55, 0.6, roof, 20);
  for (const ry of [2.6, 3.6, 4.6]) Cy("tank", 7.5, 27, F + CEIL_H + ry, F + CEIL_H + ry + 0.08, 1.58, 1.58, roof, 28);

  ctx.lights.push({
    living: V(7.5, F + 8.4, 10.75),
    kitchen: V(11.8, F + 9.0, 22.5),
    bedroom: V(5.0, F + 9.0, 27.0),
    bath: V(2.7, F + 9.0, 19.0),
    porch: V(7.5, F + 8.6, 2.6),
  });
}

/* ------------------------------------------------------------------ */
/* Whole site                                                          */
/* ------------------------------------------------------------------ */

export function buildRowHouses(lib: MaterialLibrary, skipList: FurnitureKey[] = []): BuiltScene {
  const main = new Kit();
  const roof = new Kit();
  const boxes: AABB[] = [];
  const ctx: UnitCtx = { main, roof, boxes, doors: [], fans: [], anchors: [], lights: [], skip: new Set(skipList) };
  const Z = (d: number) => 17.5 - d;
  const xL = -PLOT_W / 2 - EXT_T / 2;
  const xR = PLOT_W / 2 + EXT_T / 2;

  /* plinth */
  main.box("plinth", xL, xR, 0, F, Z(35.375), Z(0));

  /* side walls on the 4 grid lines */
  const lines = [-22.5, -7.5, 7.5, 22.5];
  lines.forEach((x, li) => {
    const outerLeft = li === 0;
    const outerRight = li === lines.length - 1;
    const neg: MatKey = outerLeft ? "extLight" : "wall";
    const pos: MatKey = outerRight ? "extLight" : "wall";
    // main house
    wall(main, boxes, "z", x, EXT_T, Z(31.75), Z(5), F, CEIL_H, [], neg, pos);
    // sit-out: low wall + full-height clad porch column at the front
    wall(main, boxes, "z", x, EXT_T, Z(5), Z(1), F, 3.5, [], "cladding", "cladding");
    main.box("extAccent", x - EXT_T / 2 - 0.02, x + EXT_T / 2 + 0.02, F + 3.5, F + 3.6, Z(5), Z(1));
    wall(main, boxes, "z", x, EXT_T, Z(1), Z(0), F, CEIL_H, [], "cladding", "cladding");
    // utility compound walls
    wall(main, boxes, "z", x, EXT_T, Z(35.375), Z(31.75), F, 5, [], neg === "wall" ? "concrete" : neg, pos === "wall" ? "concrete" : pos);
    // front setback low walls
    wall(main, boxes, "z", x, 0.5, Z(0), Z(-3), 0, 3.2, [], "cladding", "cladding");
  });

  /* rear compound wall */
  wall(main, boxes, "x", Z(35), EXT_T, xL, xR, F, 5, [], "extLight", "concrete");

  /* front compound wall with a gate per house */
  const gates: Opening[] = [];
  for (let i = 0; i < 3; i++) {
    const a = localToWorld(i, 9.9, 0).x;
    const b = localToWorld(i, 14.9, 0).x;
    gates.push({ a: Math.min(a, b), b: Math.max(a, b), sill: 0, head: 99 });
  }
  wall(main, boxes, "x", Z(-3), 0.5, xL, xR, 0, 3.5, gates, "cladding", "cladding");
  for (const g of gates) {
    for (const gx of [g.a, g.b]) {
      main.box("extAccent", gx - 0.45, gx + 0.45, 0, 4.4, Z(-3) - 0.45, Z(-3) + 0.45);
      main.box("sconce", gx - 0.25, gx + 0.25, 4.4, 4.7, Z(-3) - 0.25, Z(-3) + 0.25);
    }
    // open gate leaves (swung inward 90deg)
    for (const [gx, sgn] of [[g.a + 0.5, 1], [g.b - 0.5, -1]] as const) {
      const z1 = Z(-2.85);
      const z2 = Z(-0.55);
      main.box("blackMetal", gx - 0.05, gx + 0.05, 0.3, 4.0, Math.min(z1, z2), Math.max(z1, z2));
      for (let k = 0; k < 6; k++) {
        const zz = Math.min(z1, z2) + 0.2 + k * 0.38;
        main.box("blackMetal", gx - 0.03, gx + 0.03, 0.3, 4.0, zz, zz + 0.05);
      }
      boxes.push(aabbFromRange(gx - 0.08, gx + 0.08, z1, z2));
      void sgn;
    }
  }

  /* each house */
  for (let i = 0; i < 3; i++) buildHouseUnit(i, ctx);

  /* road, footpath, ground */
  main.box("paver", xL - 8, xR + 8, 0, 0.25, Z(-5.5), Z(-3.25));
  main.box("concrete", xL - 8, xR + 8, 0, 0.3, Z(-5.75), Z(-5.5));
  main.box("asphalt", xL - 30, xR + 30, 0, 0.03, Z(-24), Z(-5.75));
  for (let x = xL - 28; x < xR + 28; x += 10) main.box("marking", x, x + 5, 0.03, 0.04, Z(-15.1), Z(-14.6));

  /* roof slab: finished ceiling underneath, terrace tiles on top */
  roof.box("ceiling", xL, xR, F + CEIL_H, F + CEIL_H + 0.6, Z(31.75), Z(0));
  roof.box("terrace", xL, xR, F + CEIL_H + 0.6, F + CEIL_H + 0.75, Z(31.75), Z(0));
  // two-tone fascia + sit-out drop beam
  roof.box("extAccent", xL - 0.05, xR + 0.05, F + CEIL_H - 0.9, F + CEIL_H + 0.75, Z(0.75), Z(0) + 0.05);
  roof.box("extAccent", xL - 0.05, xR + 0.05, F + CEIL_H, F + CEIL_H + 0.75, Z(31.75) - 0.05, Z(31.6));
  roof.box("extAccent", xL - 0.05, xL, F + CEIL_H, F + CEIL_H + 0.75, Z(31.75), Z(0));
  roof.box("extAccent", xR, xR + 0.05, F + CEIL_H, F + CEIL_H + 0.75, Z(31.75), Z(0));
  // parapets with modern railing accents
  const pY = F + CEIL_H + 0.75;
  roof.box("extAccent", xL, xR, pY, pY + 2.2, Z(0.5), Z(0));
  roof.box("extLight", xL, xR, pY, pY + 3.2, Z(31.75), Z(31.25));
  roof.box("extLight", xL, -22.5 + 0.375, pY, pY + 3.2, Z(31.25), Z(0.5));
  roof.box("extLight", 22.5 - 0.375, xR, pY, pY + 3.2, Z(31.25), Z(0.5));
  for (const x of [-7.5, 7.5]) roof.box("extLight", x - 0.25, x + 0.25, pY, pY + 2.0, Z(31.25), Z(0.5));
  for (let x = xL + 0.3; x <= xR; x += 3) roof.cyl("steel", x, pY + 2.2 + 0.65, Z(0.25), 1.3, 0.06, 0.06, "y", 8);
  roof.cyl("steel", 0, pY + 3.5, Z(0.25), xR - xL, 0.07, 0.07, "x", 10);
  roof.cyl("steel", 0, pY + 2.85, Z(0.25), xR - xL, 0.045, 0.045, "x", 8);

  /* collision bounds: road in front, rear compound wall behind */
  const collision: CollisionWorld = {
    boxes,
    bounds: { minX: xL - 0.2, maxX: xR + 0.2, minZ: Z(35.4), maxZ: Z(-16) },
  };

  const mainGroup = main.build(lib, "main");
  const roofGroup = roof.build(lib, "roof");

  const groundGeo = new THREE.PlaneGeometry(400, 400);
  const guv = groundGeo.attributes.uv as THREE.BufferAttribute;
  for (let v = 0; v < guv.count; v++) guv.setXY(v, guv.getX(v) * 400, guv.getY(v) * 400);
  groundGeo.rotateX(-Math.PI / 2);
  groundGeo.translate(0, -0.02, 0);
  const ground = new THREE.Mesh(groundGeo, lib.grass);
  ground.receiveShadow = true;
  ground.name = "ground";

  return {
    main: mainGroup,
    roof: roofGroup,
    ground,
    collision,
    doors: ctx.doors,
    fans: ctx.fans,
    anchors: ctx.anchors,
    lights: ctx.lights,
    dispose: () => {
      for (const g of [mainGroup, roofGroup]) g.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      groundGeo.dispose();
    },
  };
}
