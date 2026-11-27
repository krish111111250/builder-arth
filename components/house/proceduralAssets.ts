/**
 * Curved procedural stand-ins for every manifest slot.
 *
 * Used whenever public/models/<key>.glb is missing. Built at real size in feet,
 * front facing +Z, floor at y = 0, with rounded boxes, lathe-turned ceramics and
 * bevelled panels (no sharp boxes). Each template is built once per material
 * library; the three houses get clones that share geometry and materials.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { AssetKey } from "../../src/config/assetManifest";
import type { MaterialLibrary } from "./textures";

type M = THREE.Material;

function add(g: THREE.Group, geo: THREE.BufferGeometry, mat: M, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  g.add(m);
  return m;
}

/** Rounded box centred on (x, y, z). */
function rb(g: THREE.Group, mat: M, w: number, h: number, d: number, r: number, x = 0, y = 0, z = 0) {
  const rr = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
  return add(g, new RoundedBoxGeometry(w, h, d, 3, Math.max(rr, 0.002)), mat, x, y, z);
}

function lathe(g: THREE.Group, mat: M, pts: [number, number][], x = 0, y = 0, z = 0, seg = 40) {
  return add(g, new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), seg), mat, x, y, z);
}

function cyl(g: THREE.Group, mat: M, rTop: number, rBot: number, h: number, x: number, y: number, z: number, seg = 32) {
  return add(g, new THREE.CylinderGeometry(rTop, rBot, h, seg), mat, x, y, z);
}

/** Bevelled flat panel (door, drawer front) of size w × h, thickness t, front face at z. */
function panel(g: THREE.Group, mat: M, w: number, h: number, t: number, x: number, y: number, zFront: number, r = 0.04) {
  const b = 0.015;
  const s = new THREE.Shape();
  const W = w / 2 - b;
  const H = h / 2 - b;
  s.moveTo(-W + r, -H);
  s.lineTo(W - r, -H);
  s.quadraticCurveTo(W, -H, W, -H + r);
  s.lineTo(W, H - r);
  s.quadraticCurveTo(W, H, W - r, H);
  s.lineTo(-W + r, H);
  s.quadraticCurveTo(-W, H, -W, H - r);
  s.lineTo(-W, -H + r);
  s.quadraticCurveTo(-W, -H, -W + r, -H);
  const geo = new THREE.ExtrudeGeometry(s, { depth: t - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 6 });
  geo.translate(0, 0, -(t - b));
  return add(g, geo, mat, x, y, zFront);
}

/* ------------------------------------------------------------------ */

const builders: Partial<Record<AssetKey, (L: MaterialLibrary) => THREE.Group>> = {
  /** 55" wall TV: 4.0 × 2.3 ft, slim. */
  flatScreenTv(L) {
    const g = new THREE.Group();
    rb(g, L.blackMetal, 4.0, 2.3, 0.1, 0.03, 0, 1.15, 0.0);
    rb(g, L.screen, 3.9, 2.2, 0.012, 0.004, 0, 1.17, 0.052);
    rb(g, L.blackMetal, 1.4, 0.9, 0.06, 0.02, 0, 1.15, -0.08); // wall mount
    rb(g, L.steel, 0.18, 0.025, 0.02, 0.008, 0, 0.04, 0.05); // logo
    return g;
  },

  /** Queen bed (5 × 6.6 ft) with upholstered channel headboard. */
  queenBed(L) {
    const g = new THREE.Group();
    rb(g, L.blackMetal, 4.6, 0.3, 6.0, 0.04, 0, 0.15, 0.15); // recessed plinth
    rb(g, L.wood, 5.0, 0.75, 6.35, 0.07, 0, 0.675, 0.125);
    rb(g, L.sofa, 5.0, 3.0, 0.35, 0.12, 0, 2.5, -3.125); // headboard
    for (let i = 0; i < 5; i++) rb(g, L.sofa, 0.9, 2.5, 0.14, 0.06, -1.92 + i * 0.96, 2.55, -2.9);
    rb(g, L.linen, 4.8, 0.72, 6.15, 0.16, 0, 1.41, 0.16); // mattress
    rb(g, L.blanket, 4.92, 0.16, 4.1, 0.07, 0, 1.82, 1.2); // duvet
    rb(g, L.linen, 4.94, 0.18, 0.55, 0.08, 0, 1.83, -1.05); // folded sheet
    rb(g, L.linen, 1.95, 0.42, 1.0, 0.2, -1.15, 1.98, -2.35);
    rb(g, L.linen, 1.95, 0.42, 1.0, 0.2, 1.15, 1.98, -2.35);
    const c = rb(g, L.cushion, 1.5, 0.85, 0.28, 0.13, 0, 2.15, -1.7);
    c.rotation.x = -0.35;
    return g;
  },

  /** Floor-to-loft 2-door wardrobe, 4.9 × 1.95 × 9.6 ft. */
  wardrobe(L) {
    const g = new THREE.Group();
    rb(g, L.blackMetal, 4.7, 0.2, 1.7, 0.02, 0, 0.1, -0.1);
    rb(g, L.wood, 4.9, 9.4, 1.85, 0.04, 0, 4.9, -0.05);
    const zf = 0.975;
    const dw = 2.42;
    for (const sx of [-1, 1]) {
      panel(g, L.cabinet, dw, 7.2, 0.08, sx * (dw / 2 + 0.015), 0.25 + 3.6, zf); // main doors
      panel(g, L.cabinet, dw, 1.85, 0.08, sx * (dw / 2 + 0.015), 7.55 + 0.95, zf); // loft doors
      rb(g, L.steel, 0.05, 2.6, 0.06, sx * 0.12, 4.2, zf + 0.03, 0.02); // bar handles
    }
    return g;
  },

  /** One-piece western toilet, 1.3 × 2.3 × 2.6 ft. */
  toilet(L) {
    const g = new THREE.Group();
    const bowl = lathe(g, L.porcelain, [
      [0.001, 0.0], [0.3, 0.0], [0.33, 0.06], [0.34, 0.45], [0.4, 0.85], [0.53, 1.18], [0.6, 1.34], [0.6, 1.4],
      [0.52, 1.41], [0.45, 1.2], [0.25, 0.95], [0.001, 0.9],
    ], 0, 0, 0.32, 48);
    bowl.scale.set(1, 1, 1.34);
    const seat = cyl(g, L.porcelain, 0.6, 0.6, 0.07, 0, 1.45, 0.32, 48);
    seat.scale.set(1, 1, 1.34);
    rb(g, L.porcelain, 0.95, 0.55, 0.62, 0.14, 0, 1.2, -0.62); // neck to the tank
    rb(g, L.porcelain, 1.25, 1.1, 0.55, 0.14, 0, 2.0, -0.875);
    cyl(g, L.steel, 0.08, 0.08, 0.04, 0, 2.57, -0.875, 24); // flush button
    return g;
  },

  /** Vanity with vessel basin and faucet, 2.1 × 1.5 × 3.4 ft. */
  vanitySink(L) {
    const g = new THREE.Group();
    rb(g, L.blackMetal, 1.8, 0.2, 1.2, 0.02, 0, 0.1, -0.1);
    rb(g, L.wood, 2.0, 2.4, 1.38, 0.04, 0, 1.4, -0.06);
    panel(g, L.cabinet, 0.98, 1.4, 0.05, -0.5, 1.0, 0.68);
    panel(g, L.cabinet, 0.98, 1.4, 0.05, 0.5, 1.0, 0.68);
    panel(g, L.cabinet, 1.98, 0.85, 0.05, 0, 2.15, 0.68);
    rb(g, L.steel, 0.6, 0.04, 0.05, 0.02, 0, 2.3, 0.72);
    rb(g, L.porcelain, 2.1, 0.12, 1.5, 0.04, 0, 2.66, 0.0); // top
    lathe(g, L.porcelain, [
      [0.001, 0.0], [0.3, 0.0], [0.45, 0.06], [0.54, 0.22], [0.55, 0.33], [0.5, 0.33], [0.48, 0.2], [0.4, 0.1], [0.001, 0.08],
    ], 0, 2.72, 0.12, 48);
    cyl(g, L.steel, 0.045, 0.055, 0.66, 0, 3.05, -0.5, 20);
    const spout = cyl(g, L.steel, 0.035, 0.035, 0.42, 0, 3.36, -0.31, 20);
    spout.rotation.x = Math.PI / 2;
    rb(g, L.steel, 0.06, 0.06, 0.2, 0.02, 0.12, 3.2, -0.5);
    return g;
  },

  /** Double-door bottom-freezer fridge, 2.3 × 2.1 × 6.2 ft. */
  fridge(L) {
    const g = new THREE.Group();
    rb(g, L.appliance, 2.3, 6.15, 1.92, 0.1, 0, 3.075, -0.09);
    panel(g, L.appliance, 2.28, 3.85, 0.12, 0, 4.22, 0.99, 0.08);
    panel(g, L.appliance, 2.28, 2.1, 0.12, 0, 1.12, 0.99, 0.08);
    rb(g, L.blackMetal, 2.22, 0.04, 0.03, 0.01, 0, 2.21, 0.985);
    rb(g, L.steel, 0.07, 1.7, 0.08, 0.03, -0.95, 4.1, 1.03);
    rb(g, L.steel, 1.3, 0.07, 0.08, 0.03, 0, 1.95, 1.03);
    rb(g, L.screen, 0.32, 0.45, 0.012, 0.02, 0.6, 4.9, 1.0);
    return g;
  },

  /** 3-burner glass-top gas hob, 2.3 × 1.7 ft, sits on the counter. */
  stove(L) {
    const g = new THREE.Group();
    rb(g, L.hob, 2.3, 0.05, 1.7, 0.02, 0, 0.025, 0);
    for (const x of [-0.75, 0, 0.75]) {
      cyl(g, L.steel, 0.27, 0.29, 0.035, x, 0.07, -0.12, 32);
      cyl(g, L.blackMetal, 0.14, 0.15, 0.04, x, 0.105, -0.12, 24);
      for (const a of [0, Math.PI / 2]) {
        const bar = rb(g, L.blackMetal, 0.7, 0.03, 0.05, 0.012, x, 0.125, -0.12);
        bar.rotation.y = a + Math.PI / 4;
      }
      cyl(g, L.steel, 0.07, 0.07, 0.06, x, 0.08, 0.62, 20); // knob
    }
    return g;
  },

  /** T-shaped chimney hood, 2.8 × 1.6 × 4.4 ft. */
  chimney(L) {
    const g = new THREE.Group();
    rb(g, L.steel, 2.8, 0.35, 1.6, 0.04, 0, 0.175, 0);
    rb(g, L.blackMetal, 2.4, 0.02, 1.2, 0.006, 0, 0.012, 0); // filters
    rb(g, L.blackMetal, 0.9, 0.12, 0.02, 0.01, 0, 0.18, 0.8); // controls
    rb(g, L.steel, 0.95, 4.05, 0.8, 0.02, 0, 0.35 + 2.025, -0.4); // duct
    return g;
  },

  /** Front-load washing machine, 2 × 2 × 2.8 ft. */
  washingMachine(L) {
    const g = new THREE.Group();
    rb(g, L.porcelain, 2.0, 2.8, 1.9, 0.12, 0, 1.4, -0.05);
    rb(g, L.frame, 1.86, 0.36, 0.03, 0.02, 0, 2.48, 0.9);
    cyl(g, L.steel, 0.1, 0.1, 0.06, 0.6, 2.48, 0.93, 20).rotation.x = Math.PI / 2;
    const ring = add(g, new THREE.TorusGeometry(0.55, 0.07, 16, 48), L.steel, 0, 1.25, 0.92);
    ring.castShadow = false;
    cyl(g, L.screen, 0.5, 0.5, 0.04, 0, 1.25, 0.91, 40).rotation.x = Math.PI / 2;
    return g;
  },

  /** Bedside lamp, 0.9 × 1.6 ft. */
  lamp(L) {
    const g = new THREE.Group();
    lathe(g, L.porcelain, [[0.001, 0], [0.22, 0], [0.3, 0.2], [0.28, 0.5], [0.12, 0.8], [0.06, 0.9], [0.001, 0.9]], 0, 0, 0, 32);
    cyl(g, L.steel, 0.02, 0.02, 0.25, 0, 1.0, 0, 12);
    cyl(g, L.lampShade, 0.3, 0.45, 0.6, 0, 1.3, 0, 40);
    return g;
  },

  /* ---- fallbacks for the Poly Haven slots (only if a file goes missing) ---- */

  sofa(L) {
    const g = new THREE.Group();
    rb(g, L.blackMetal, 6.6, 0.3, 2.6, 0.04, 0, 0.15, 0);
    rb(g, L.sofa, 7.0, 1.1, 3.0, 0.2, 0, 0.85, 0);
    rb(g, L.sofa, 7.0, 1.6, 0.7, 0.25, 0, 2.1, -1.15);
    for (const s of [-1, 1]) rb(g, L.sofa, 0.6, 1.8, 3.0, 0.22, s * 3.2, 1.2, 0);
    for (const x of [-1.95, 0, 1.95]) rb(g, L.linen, 1.9, 0.35, 2.2, 0.15, x, 1.55, 0.3);
    return g;
  },
  coffeeTable(L) {
    const g = new THREE.Group();
    rb(g, L.wood, 3.6, 0.15, 1.8, 0.06, 0, 1.3, 0);
    for (const [x, z] of [[-1.5, -0.7], [1.5, -0.7], [-1.5, 0.7], [1.5, 0.7]]) cyl(g, L.blackMetal, 0.05, 0.05, 1.22, x, 0.61, z, 12);
    return g;
  },
  tvUnit(L) {
    const g = new THREE.Group();
    rb(g, L.wood, 5.2, 1.1, 1.45, 0.05, 0, 0.75, 0);
    for (const x of [-1.95, -0.65, 0.65, 1.95]) panel(g, L.cabinet, 1.28, 0.95, 0.04, x, 0.75, 0.745);
    for (const x of [-2.3, 2.3]) cyl(g, L.blackMetal, 0.04, 0.04, 0.2, x, 0.1, 0, 10);
    return g;
  },
  nightstand(L) {
    const g = new THREE.Group();
    rb(g, L.wood, 1.5, 1.5, 1.25, 0.05, 0, 0.75, 0);
    panel(g, L.cabinet, 1.38, 0.55, 0.04, 0, 1.08, 0.645);
    return g;
  },
  plant(L) {
    const g = new THREE.Group();
    lathe(g, L.pot, [[0.001, 0], [0.32, 0], [0.42, 1.1], [0.45, 1.2], [0.001, 1.2]], 0, 0, 0, 32);
    for (const [x, y, z, r] of [[0, 2.0, 0, 0.7], [0.3, 1.7, 0.2, 0.45], [-0.3, 1.75, -0.2, 0.5]]) {
      const leaf = add(g, new THREE.SphereGeometry(r, 16, 12), L.leaf, x, y, z);
      leaf.scale.y = 1.25;
    }
    return g;
  },
  ceilingFan(L) {
    const g = new THREE.Group();
    cyl(g, L.steel, 0.25, 0.25, 0.1, 0, -0.05, 0, 20);
    cyl(g, L.steel, 0.05, 0.05, 0.9, 0, -0.5, 0, 10);
    cyl(g, L.blackMetal, 0.38, 0.32, 0.32, 0, -1.05, 0, 24);
    for (let b = 0; b < 3; b++) {
      const a = (b * Math.PI * 2) / 3;
      const blade = rb(g, L.wood, 2.1, 0.04, 0.42, 0.02, Math.cos(a) * 1.35, -1.03, -Math.sin(a) * 1.35);
      blade.rotation.y = a;
    }
    return g;
  },
};

const templates = new WeakMap<MaterialLibrary, Map<AssetKey, THREE.Group | null>>();

/** Procedural template for a slot (shared; clone before adding to the scene). */
export function proceduralTemplate(key: AssetKey, lib: MaterialLibrary): THREE.Group | null {
  let byKey = templates.get(lib);
  if (!byKey) {
    byKey = new Map();
    templates.set(lib, byKey);
  }
  if (!byKey.has(key)) byKey.set(key, builders[key]?.(lib) ?? null);
  return byKey.get(key) ?? null;
}

export function disposeProceduralTemplates(lib: MaterialLibrary) {
  templates.get(lib)?.forEach((g) => g?.traverse((o) => (o as THREE.Mesh).geometry?.dispose()));
  templates.delete(lib);
}
